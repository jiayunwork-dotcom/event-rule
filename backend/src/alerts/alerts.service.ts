import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Alert } from './alert.entity';
import { AlertHistory } from './alert-history.entity';
import { AlertStatus } from '../rules/rule.entity';
import { Rule, AlertSeverity } from '../rules/rule.entity';
import { Event, calculateFingerprint } from '../common/types/event.type';
import { RedisService } from '../common/services/redis.service';
import { Silence } from './silence.entity';
import { InhibitRule } from './inhibit-rule.entity';
import { RuleHit } from '../metrics/metric.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface UpdateAlertStatusDto {
  status: AlertStatus;
  remark?: string;
  resolvedReason?: string;
}

export interface CreateSilenceDto {
  name: string;
  matchers: Array<{ label: string; value: string; type: 'eq' | 'regex' }>;
  startsAt: Date;
  endsAt: Date;
  comment?: string;
}

export interface CreateInhibitRuleDto {
  name: string;
  sourceMatchers: Array<{ label: string; value: string; type: 'eq' | 'regex' }>;
  targetMatchers: Array<{ label: string; value: string; type: 'eq' | 'regex' }>;
  equalLabels: string[];
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    @InjectRepository(AlertHistory)
    private readonly alertHistoryRepository: Repository<AlertHistory>,
    @InjectRepository(Silence)
    private readonly silenceRepository: Repository<Silence>,
    @InjectRepository(InhibitRule)
    private readonly inhibitRuleRepository: Repository<InhibitRule>,
    @InjectRepository(RuleHit)
    private readonly ruleHitRepository: Repository<RuleHit>,
    private readonly eventEmitter: EventEmitter2,
    private readonly redisService: RedisService,
  ) {}

  @OnEvent('rule.triggered')
  async handleRuleTriggered(payload: { tenantId: string; rule: Rule; event: Event }) {
    const { tenantId, rule, event } = payload;

    await this.recordRuleHit(tenantId, rule.id);

    if (event.status === 'resolved') {
      await this.resolveAlertByEvent(tenantId, rule, event);
      return;
    }

    if (await this.isSilenced(tenantId, event.labels)) {
      this.logger.log(`Alert silenced for tenant ${tenantId}`);
      return;
    }

    if (await this.isInhibited(tenantId, event.labels)) {
      this.logger.log(`Alert inhibited for tenant ${tenantId}`);
      return;
    }

    const fingerprint = calculateFingerprint(rule.id, event.labels, rule.groupByLabels);

    const activeAlerts = await this.alertRepository.find({
      where: {
        tenantId,
        fingerprint,
        status: In([AlertStatus.PENDING, AlertStatus.ACKNOWLEDGED, AlertStatus.PROCESSING]) as any,
      },
    });

    if (activeAlerts.length > 0) {
      const targetAlert = activeAlerts[0];
      targetAlert.count++;
      targetAlert.lastTriggeredAt = new Date();
      if (event.value !== undefined) {
        targetAlert.value = event.value;
      }
      const saved = await this.alertRepository.save(targetAlert);
      this.eventEmitter.emit('alert.updated', { tenantId, alert: saved, isNew: false });
      return;
    }

    const alert = await this.createAlert(tenantId, rule, event, fingerprint);
    this.eventEmitter.emit('alert.created', { tenantId, alert, event, isNew: true });
  }

  private createAlertEntity(tenantId: string, rule: Rule, event: Event, fingerprint: string): Alert {
    return this.alertRepository.create({
      tenantId,
      ruleId: rule.id,
      fingerprint,
      name: rule.name,
      severity: rule.severity,
      status: AlertStatus.PENDING,
      labels: event.labels,
      value: event.value,
      count: 1,
      firstTriggeredAt: new Date(),
      lastTriggeredAt: new Date(),
    });
  }

  private async createAlert(tenantId: string, rule: Rule, event: Event, fingerprint: string): Promise<Alert> {
    const alert = this.createAlertEntity(tenantId, rule, event, fingerprint);
    const saved = await this.alertRepository.save(alert);
    
    await this.recordAlertHistory(tenantId, saved.id, null, AlertStatus.PENDING, null, 'Alert created');
    
    return saved;
  }

  private async isSilenced(tenantId: string, labels: Record<string, string>): Promise<boolean> {
    const now = new Date();
    const silences = await this.silenceRepository.find({
      where: { tenantId, isActive: true },
    });

    for (const silence of silences) {
      if (now < silence.startsAt || now > silence.endsAt) continue;
      
      if (this.matchLabels(labels, silence.matchers)) {
        return true;
      }
    }

    return false;
  }

  private async isInhibited(tenantId: string, labels: Record<string, string>): Promise<boolean> {
    const inhibitRules = await this.inhibitRuleRepository.find({
      where: { tenantId, isEnabled: true },
    });

    for (const rule of inhibitRules) {
      if (this.matchLabels(labels, rule.targetMatchers)) {
        const hasSourceAlert = await this.hasMatchingSourceAlert(tenantId, rule, labels);
        if (hasSourceAlert) {
          return true;
        }
      }
    }

    return false;
  }

  private async hasMatchingSourceAlert(
    tenantId: string, 
    rule: InhibitRule, 
    targetLabels: Record<string, string>
  ): Promise<boolean> {
    const activeAlerts = await this.alertRepository.find({
      where: { 
        tenantId, 
        status: In([AlertStatus.PENDING, AlertStatus.ACKNOWLEDGED, AlertStatus.PROCESSING]) 
      } as any,
    });

    for (const alert of activeAlerts) {
      if (this.matchLabels(alert.labels, rule.sourceMatchers)) {
        if (rule.equalLabels.length > 0) {
          const hasEqualLabels = rule.equalLabels.every(label => 
            alert.labels?.[label] === targetLabels[label]
          );
          if (hasEqualLabels) {
            return true;
          }
        } else {
          return true;
        }
      }
    }

    return false;
  }

  private matchLabels(
    labels: Record<string, string>, 
    matchers: Array<{ label: string; value: string; type: 'eq' | 'regex' }>
  ): boolean {
    return matchers.every(matcher => {
      const labelValue = labels?.[matcher.label];
      if (!labelValue) return false;
      
      if (matcher.type === 'eq') {
        return labelValue === matcher.value;
      } else if (matcher.type === 'regex') {
        return new RegExp(matcher.value).test(labelValue);
      }
      return false;
    });
  }

  private async recordRuleHit(tenantId: string, ruleId: string) {
    const hit = this.ruleHitRepository.create({
      tenantId,
      ruleId,
      timestamp: new Date(),
      count: 1,
    });
    await this.ruleHitRepository.save(hit);
  }

  private async recordAlertHistory(
    tenantId: string,
    alertId: string,
    oldStatus: AlertStatus | null,
    newStatus: AlertStatus,
    operatorId: string | null,
    remark?: string,
  ) {
    const history = this.alertHistoryRepository.create({
      alertId,
      tenantId,
      oldStatus,
      newStatus,
      operatorId,
      remark,
    });
    await this.alertHistoryRepository.save(history);
  }

  private async resolveAlertByEvent(tenantId: string, rule: Rule, event: Event) {
    const fingerprint = calculateFingerprint(rule.id, event.labels, rule.groupByLabels);

    const activeAlerts = await this.alertRepository.find({
      where: {
        tenantId,
        fingerprint,
        status: In([AlertStatus.PENDING, AlertStatus.ACKNOWLEDGED, AlertStatus.PROCESSING]) as any,
      },
    });

    for (const activeAlert of activeAlerts) {
      await this.updateAlertStatus(
        tenantId,
        activeAlert.id,
        { status: AlertStatus.RESOLVED, resolvedReason: 'Auto-resolved by resolved event' },
        null
      );
    }
  }

  async findAll(tenantId: string, filters?: {
    status?: AlertStatus[];
    severity?: AlertSeverity[];
    startDate?: Date;
    endDate?: Date;
    labels?: Record<string, string>;
  }): Promise<Alert[]> {
    const queryBuilder = this.alertRepository
      .createQueryBuilder('alert')
      .where('alert.tenantId = :tenantId', { tenantId });

    if (filters?.status?.length) {
      queryBuilder.andWhere('alert.status IN (:...status)', { status: filters.status });
    }

    if (filters?.severity?.length) {
      queryBuilder.andWhere('alert.severity IN (:...severity)', { severity: filters.severity });
    }

    if (filters?.startDate) {
      queryBuilder.andWhere('alert.createdAt >= :startDate', { startDate: filters.startDate });
    }

    if (filters?.endDate) {
      queryBuilder.andWhere('alert.createdAt <= :endDate', { endDate: filters.endDate });
    }

    queryBuilder
      .orderBy(`CASE alert.severity 
        WHEN 'fatal' THEN 1 
        WHEN 'critical' THEN 2 
        WHEN 'warning' THEN 3 
        WHEN 'info' THEN 4 
        END`, 'ASC')
      .addOrderBy('alert.createdAt', 'DESC');

    const alerts = await queryBuilder.getMany();

    if (filters?.labels) {
      return alerts.filter(alert => 
        Object.entries(filters.labels!).every(([key, value]) => 
          alert.labels?.[key] === value
        )
      );
    }

    return alerts;
  }

  async findAllGrouped(tenantId: string, filters?: {
    status?: AlertStatus[];
    severity?: AlertSeverity[];
    startDate?: Date;
    endDate?: Date;
  }): Promise<Array<{
    fingerprint: string;
    name: string;
    severity: AlertSeverity;
    labels: Record<string, string>;
    alerts: Alert[];
    count: number;
    lastTriggeredAt: Date;
  }>> {
    const alerts = await this.findAll(tenantId, filters);

    const groups = new Map<string, {
      fingerprint: string;
      name: string;
      severity: AlertSeverity;
      labels: Record<string, string>;
      alerts: Alert[];
      count: number;
      lastTriggeredAt: Date;
    }>();

    for (const alert of alerts) {
      if (!groups.has(alert.fingerprint)) {
        groups.set(alert.fingerprint, {
          fingerprint: alert.fingerprint,
          name: alert.name,
          severity: alert.severity,
          labels: alert.labels || {},
          alerts: [],
          count: 0,
          lastTriggeredAt: alert.lastTriggeredAt,
        });
      }
      const group = groups.get(alert.fingerprint)!;
      group.alerts.push(alert);
      group.count += alert.count;
      if (alert.lastTriggeredAt > group.lastTriggeredAt) {
        group.lastTriggeredAt = alert.lastTriggeredAt;
      }
    }

    const severityOrder: Record<string, number> = {
      fatal: 1,
      critical: 2,
      warning: 3,
      info: 4,
    };

    return Array.from(groups.values()).sort((a, b) => {
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return b.lastTriggeredAt.getTime() - a.lastTriggeredAt.getTime();
    });
  }

  async findOne(tenantId: string, id: string): Promise<Alert> {
    const alert = await this.alertRepository.findOne({ where: { id, tenantId } });
    if (!alert) {
      throw new BadRequestException('Alert not found');
    }
    return alert;
  }

  async getAlertHistory(tenantId: string, alertId: string): Promise<AlertHistory[]> {
    return this.alertHistoryRepository.find({
      where: { alertId, tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateAlertStatus(
    tenantId: string,
    alertId: string,
    dto: UpdateAlertStatusDto,
    userId: string | null,
  ): Promise<Alert> {
    const alert = await this.findOne(tenantId, alertId);
    const oldStatus = alert.status;

    const validTransitions: Record<AlertStatus, AlertStatus[]> = {
      [AlertStatus.PENDING]: [AlertStatus.ACKNOWLEDGED],
      [AlertStatus.ACKNOWLEDGED]: [AlertStatus.PROCESSING],
      [AlertStatus.PROCESSING]: [AlertStatus.RESOLVED],
      [AlertStatus.RESOLVED]: [],
    };

    const allowedNext = validTransitions[oldStatus] || [];
    if (!allowedNext.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid status transition: ${oldStatus} -> ${dto.status}. ` +
        `Allowed transitions: ${oldStatus} -> ${allowedNext.join(', ') || 'none'}`
      );
    }

    switch (dto.status) {
      case AlertStatus.ACKNOWLEDGED:
        alert.acknowledgedAt = new Date();
        alert.acknowledgedBy = userId || undefined;
        break;

      case AlertStatus.PROCESSING:
        alert.processingAt = new Date();
        alert.processingBy = userId || undefined;
        break;

      case AlertStatus.RESOLVED:
        if (!dto.resolvedReason) {
          throw new BadRequestException('Resolved reason is required');
        }
        alert.resolvedAt = new Date();
        alert.resolvedBy = userId || undefined;
        alert.resolvedReason = dto.resolvedReason;
        break;
    }

    alert.status = dto.status;
    const saved = await this.alertRepository.save(alert);

    await this.recordAlertHistory(tenantId, alertId, oldStatus, dto.status, userId, dto.remark);

    this.eventEmitter.emit('alert.status.updated', { tenantId, alert: saved, oldStatus, newStatus: dto.status });

    return saved;
  }

  private readonly escalationIntervals = [15 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000];
  private readonly maxEscalationLevel = 3;

  @Cron(CronExpression.EVERY_MINUTE)
  async handleAlertEscalation() {
    const now = Date.now();

    const activeAlerts = await this.alertRepository
      .createQueryBuilder('alert')
      .where('alert.status IN (:...statuses)', {
        statuses: [AlertStatus.PENDING, AlertStatus.ACKNOWLEDGED, AlertStatus.PROCESSING],
      })
      .andWhere('alert.escalationLevel < :maxLevel', { maxLevel: this.maxEscalationLevel })
      .getMany();

    for (const alert of activeAlerts) {
      const nextLevel = alert.escalationLevel + 1;
      if (nextLevel > this.maxEscalationLevel) continue;

      const interval = this.escalationIntervals[alert.escalationLevel];
      if (!interval) continue;

      let referenceTime: Date;
      if (alert.escalationLevel === 0) {
        referenceTime = alert.firstTriggeredAt;
      } else if (alert.escalationLevel === 1) {
        referenceTime = alert.acknowledgedAt || alert.firstTriggeredAt;
      } else {
        referenceTime = alert.processingAt || alert.acknowledgedAt || alert.firstTriggeredAt;
      }

      if (now - referenceTime.getTime() >= interval) {
        alert.escalationLevel = nextLevel;
        await this.alertRepository.save(alert);

        this.eventEmitter.emit('alert.escalated', {
          tenantId: alert.tenantId,
          alert,
          level: nextLevel,
          reason: `Alert not handled within ${Math.round(interval / 60000)} minutes at level ${alert.escalationLevel - 1}`,
        });
      }
    }
  }

  async getSilences(tenantId: string): Promise<Silence[]> {
    return this.silenceRepository.find({ 
      where: { tenantId },
      order: { createdAt: 'DESC' }
    });
  }

  async createSilence(tenantId: string, userId: string, dto: CreateSilenceDto): Promise<Silence> {
    const silence = this.silenceRepository.create({
      ...dto,
      tenantId,
      createdBy: userId,
    });
    return this.silenceRepository.save(silence);
  }

  async deleteSilence(tenantId: string, id: string): Promise<void> {
    await this.silenceRepository.update({ id, tenantId }, { isActive: false });
  }

  async getInhibitRules(tenantId: string): Promise<InhibitRule[]> {
    return this.inhibitRuleRepository.find({ where: { tenantId } });
  }

  async createInhibitRule(tenantId: string, dto: CreateInhibitRuleDto): Promise<InhibitRule> {
    const rule = this.inhibitRuleRepository.create({ ...dto, tenantId });
    return this.inhibitRuleRepository.save(rule);
  }

  async deleteInhibitRule(tenantId: string, id: string): Promise<void> {
    await this.inhibitRuleRepository.delete({ id, tenantId });
  }

  async toggleInhibitRule(tenantId: string, id: string, isEnabled: boolean): Promise<InhibitRule> {
    const rule = await this.inhibitRuleRepository.findOne({ where: { id, tenantId } });
    if (!rule) {
      throw new BadRequestException('Inhibit rule not found');
    }
    rule.isEnabled = isEnabled;
    return this.inhibitRuleRepository.save(rule);
  }
}
