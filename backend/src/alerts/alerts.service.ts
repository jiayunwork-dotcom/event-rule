import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
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
import { v4 as uuidv4 } from 'uuid';

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

interface AggregationGroup {
  fingerprint: string;
  alerts: Alert[];
  count: number;
  windowStart: Date;
}

@Injectable()
export class AlertsService implements OnModuleInit {
  private readonly logger = new Logger(AlertsService.name);
  private readonly aggregationWindow = 5 * 60 * 1000;
  private readonly aggregationKeyPrefix = 'alert:aggregation:';
  private readonly pendingEscalationKey = 'alert:escalation:pending:';

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

  onModuleInit() {
    this.startAggregationProcessor();
  }

  private startAggregationProcessor() {
    setInterval(async () => {
      try {
        await this.processAggregationWindows();
      } catch (error) {
        this.logger.error('Error processing aggregation windows', error);
      }
    }, 60000);
  }

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

    const fingerprint = calculateFingerprint(rule.name, event.labels);
    
    const existingAlert = await this.alertRepository.findOne({
      where: { tenantId, fingerprint, status: AlertStatus.RESOLVED },
      order: { createdAt: 'DESC' },
    });

    let alert: Alert;
    
    const aggregationKey = `${this.aggregationKeyPrefix}${tenantId}:${fingerprint}`;
    const aggregationData = await this.redisService.get(aggregationKey);
    
    if (aggregationData) {
      const aggregation: AggregationGroup = JSON.parse(aggregationData);
      aggregation.count++;
      aggregation.alerts.push(this.createAlertEntity(tenantId, rule, event, fingerprint));
      
      if (Date.now() - aggregation.windowStart.getTime() > this.aggregationWindow) {
        alert = await this.createAggregatedAlert(tenantId, rule, event, fingerprint, aggregation);
        await this.redisService.del(aggregationKey);
      } else {
        await this.redisService.set(aggregationKey, JSON.stringify(aggregation), 300);
        return;
      }
    } else {
      const activeAlert = await this.alertRepository.findOne({
        where: { 
          tenantId, 
          fingerprint, 
          status: In([AlertStatus.PENDING, AlertStatus.ACKNOWLEDGED, AlertStatus.PROCESSING]) 
        } as any,
      });

      if (activeAlert) {
        activeAlert.count++;
        activeAlert.lastTriggeredAt = new Date();
        activeAlert.value = event.value;
        alert = await this.alertRepository.save(activeAlert);
        
        this.eventEmitter.emit('alert.updated', { tenantId, alert, isNew: false });
        return;
      } else {
        const newAggregation: AggregationGroup = {
          fingerprint,
          alerts: [],
          count: 1,
          windowStart: new Date(),
        };
        await this.redisService.set(aggregationKey, JSON.stringify(newAggregation), 300);
        
        alert = await this.createAlert(tenantId, rule, event, fingerprint);
      }
    }

    if (alert) {
      this.eventEmitter.emit('alert.created', { tenantId, alert, event, isNew: true });
    }
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

  private async createAggregatedAlert(
    tenantId: string, 
    rule: Rule, 
    event: Event, 
    fingerprint: string,
    aggregation: AggregationGroup
  ): Promise<Alert> {
    const alert = this.createAlertEntity(tenantId, rule, event, fingerprint);
    alert.count = aggregation.count;
    
    const saved = await this.alertRepository.save(alert);
    await this.recordAlertHistory(tenantId, saved.id, null, AlertStatus.PENDING, null, `Aggregated alert with ${aggregation.count} occurrences`);
    
    return saved;
  }

  private async processAggregationWindows() {
    const keys = await this.redisService.scan(`${this.aggregationKeyPrefix}*`);
    
    for (const key of keys) {
      const data = await this.redisService.get(key);
      if (!data) continue;
      
      const aggregation: AggregationGroup = JSON.parse(data);
      
      if (Date.now() - aggregation.windowStart.getTime() > this.aggregationWindow) {
        const [, tenantId] = key.replace(this.aggregationKeyPrefix, '').split(':');
        
        if (aggregation.count >= 1) {
          const firstAlert = aggregation.alerts[0];
          const rule = { id: firstAlert.ruleId, name: firstAlert.name, severity: firstAlert.severity } as Rule;
          const event = { labels: firstAlert.labels, value: firstAlert.value } as Event;
          
          const alert = await this.createAggregatedAlert(tenantId, rule, event, aggregation.fingerprint, aggregation);
          this.eventEmitter.emit('alert.created', { tenantId, alert, isNew: true, isAggregated: true, count: aggregation.count });
        }
        
        await this.redisService.del(key);
      }
    }
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
    const fingerprint = calculateFingerprint(rule.name, event.labels);
    
    const activeAlert = await this.alertRepository.findOne({
      where: { 
        tenantId, 
        fingerprint, 
        status: In([AlertStatus.PENDING, AlertStatus.ACKNOWLEDGED, AlertStatus.PROCESSING]) 
      } as any,
    });

    if (activeAlert) {
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

    if (oldStatus === AlertStatus.RESOLVED) {
      throw new BadRequestException('Cannot update resolved alert');
    }

    switch (dto.status) {
      case AlertStatus.ACKNOWLEDGED:
        if (oldStatus !== AlertStatus.PENDING) {
          throw new BadRequestException('Can only acknowledge pending alerts');
        }
        alert.acknowledgedAt = new Date();
        alert.acknowledgedBy = userId || undefined;
        break;

      case AlertStatus.PROCESSING:
        if (oldStatus !== AlertStatus.ACKNOWLEDGED) {
          throw new BadRequestException('Can only move to processing from acknowledged');
        }
        alert.processingAt = new Date();
        alert.processingBy = userId || undefined;
        break;

      case AlertStatus.RESOLVED:
        alert.resolvedAt = new Date();
        alert.resolvedBy = userId || undefined;
        alert.resolvedReason = dto.resolvedReason;
        break;

      default:
        throw new BadRequestException('Invalid status transition');
    }

    alert.status = dto.status;
    const saved = await this.alertRepository.save(alert);

    await this.recordAlertHistory(tenantId, alertId, oldStatus, dto.status, userId, dto.remark);

    this.eventEmitter.emit('alert.status.updated', { tenantId, alert: saved, oldStatus, newStatus: dto.status });

    return saved;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleAlertEscalation() {
    const now = new Date();
    
    const pendingAlerts = await this.alertRepository
      .createQueryBuilder('alert')
      .where('alert.status = :status', { status: AlertStatus.PENDING })
      .andWhere('alert.firstTriggeredAt < :threshold', { 
        threshold: new Date(now.getTime() - 30 * 60 * 1000) 
      })
      .andWhere('alert.escalationLevel = :level', { level: 0 })
      .getMany();

    for (const alert of pendingAlerts) {
      alert.escalationLevel = 1;
      await this.alertRepository.save(alert);
      
      this.eventEmitter.emit('alert.escalated', { 
        tenantId: alert.tenantId, 
        alert, 
        level: 1,
        reason: 'Pending alert not acknowledged within 30 minutes'
      });
    }

    const acknowledgedAlerts = await this.alertRepository
      .createQueryBuilder('alert')
      .where('alert.status = :status', { status: AlertStatus.ACKNOWLEDGED })
      .andWhere('alert.acknowledgedAt < :threshold', { 
        threshold: new Date(now.getTime() - 2 * 60 * 60 * 1000) 
      })
      .andWhere('alert.escalationLevel < :maxLevel', { maxLevel: 2 })
      .getMany();

    for (const alert of acknowledgedAlerts) {
      alert.escalationLevel = 2;
      await this.alertRepository.save(alert);
      
      this.eventEmitter.emit('alert.escalated', { 
        tenantId: alert.tenantId, 
        alert, 
        level: 2,
        reason: 'Acknowledged alert not processed within 2 hours'
      });
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
