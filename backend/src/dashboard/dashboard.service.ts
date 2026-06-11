import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Alert } from '../alerts/alert.entity';
import { AlertStatus, AlertSeverity } from '../rules/rule.entity';
import { RuleHit } from '../metrics/metric.entity';
import { Rule } from '../rules/rule.entity';
import { Notification } from '../notifications/notification.entity';
import { EventQueueService } from '../common/services/event-queue.service';

export interface DashboardStats {
  activeAlerts: {
    total: number;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
  };
  metrics: {
    mtta: number;
    mttr: number;
  };
  notifications: {
    total: number;
    byChannel: Record<string, number>;
    successRate: number;
  };
  queue: {
    size: number;
    discarded: number;
  };
}

export interface RuleHitStats {
  ruleId: string;
  ruleName: string;
  hits: number;
  trend: Array<{ timestamp: string; count: number }>;
}

export interface AlertTimeline {
  id: string;
  name: string;
  severity: AlertSeverity;
  status: AlertStatus;
  timestamp: Date;
  count: number;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    @InjectRepository(RuleHit)
    private readonly ruleHitRepository: Repository<RuleHit>,
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly eventQueueService: EventQueueService,
  ) {}

  async getStats(tenantId: string, startDate?: Date, endDate?: Date): Promise<DashboardStats> {
    const now = endDate || new Date();
    const defaultStart = startDate || new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const activeAlerts = await this.alertRepository.find({
      where: {
        tenantId,
        status: Between && [AlertStatus.PENDING, AlertStatus.ACKNOWLEDGED, AlertStatus.PROCESSING] as any,
      },
    });

    const activeBySeverity: Record<string, number> = {};
    const activeByStatus: Record<string, number> = {};
    
    for (const alert of activeAlerts) {
      activeBySeverity[alert.severity] = (activeBySeverity[alert.severity] || 0) + 1;
      activeByStatus[alert.status] = (activeByStatus[alert.status] || 0) + 1;
    }

    const resolvedAlerts = await this.alertRepository.find({
      where: {
        tenantId,
        status: AlertStatus.RESOLVED,
        resolvedAt: Between(defaultStart, now) as any,
      },
    });

    let totalAckTime = 0;
    let totalResolveTime = 0;
    let ackCount = 0;
    let resolveCount = 0;

    for (const alert of resolvedAlerts) {
      if (alert.acknowledgedAt && alert.firstTriggeredAt) {
        totalAckTime += (alert.acknowledgedAt.getTime() - alert.firstTriggeredAt.getTime()) / 1000 / 60;
        ackCount++;
      }
      if (alert.resolvedAt && alert.firstTriggeredAt) {
        totalResolveTime += (alert.resolvedAt.getTime() - alert.firstTriggeredAt.getTime()) / 1000 / 60;
        resolveCount++;
      }
    }

    const notifications = await this.notificationRepository.find({
      where: {
        tenantId,
        createdAt: Between(defaultStart, now) as any,
      },
    });

    const byChannel: Record<string, number> = {};
    let sentCount = 0;

    for (const n of notifications) {
      byChannel[n.channelType] = (byChannel[n.channelType] || 0) + 1;
      if (n.status === 'sent') sentCount++;
    }

    const queueSize = await this.eventQueueService.getQueueSize(tenantId);
    const discarded = await this.eventQueueService.getDiscardCount(tenantId);

    return {
      activeAlerts: {
        total: activeAlerts.length,
        bySeverity: activeBySeverity,
        byStatus: activeByStatus,
      },
      metrics: {
        mtta: ackCount > 0 ? Math.round(totalAckTime / ackCount) : 0,
        mttr: resolveCount > 0 ? Math.round(totalResolveTime / resolveCount) : 0,
      },
      notifications: {
        total: notifications.length,
        byChannel,
        successRate: notifications.length > 0 ? Math.round((sentCount / notifications.length) * 100) : 0,
      },
      queue: {
        size: queueSize,
        discarded,
      },
    };
  }

  async getRuleHitStats(
    tenantId: string, 
    startDate?: Date, 
    endDate?: Date,
    interval: 'hour' | 'day' = 'hour'
  ): Promise<RuleHitStats[]> {
    const now = endDate || new Date();
    const defaultStart = startDate || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const rules = await this.ruleRepository.find({ where: { tenantId } });
    const ruleHits = await this.ruleHitRepository.find({
      where: {
        tenantId,
        timestamp: Between(defaultStart, now) as any,
      },
      order: { timestamp: 'ASC' },
    });

    const hitMap: Record<string, RuleHitStats> = {};
    const trendPoints = this.generateTrendPoints(defaultStart, now, interval);

    for (const rule of rules) {
      hitMap[rule.id] = {
        ruleId: rule.id,
        ruleName: rule.name,
        hits: 0,
        trend: trendPoints.map(tp => ({ timestamp: tp, count: 0 })),
      };
    }

    for (const hit of ruleHits) {
      if (!hitMap[hit.ruleId!]) continue;
      
      hitMap[hit.ruleId!].hits += hit.count;
      
      const trendIndex = this.findTrendIndex(hit.timestamp, trendPoints, interval);
      if (trendIndex >= 0) {
        hitMap[hit.ruleId!].trend[trendIndex].count += hit.count;
      }
    }

    return Object.values(hitMap).sort((a, b) => b.hits - a.hits);
  }

  async getAlertTimeline(
    tenantId: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 100
  ): Promise<AlertTimeline[]> {
    const now = endDate || new Date();
    const defaultStart = startDate || new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const alerts = await this.alertRepository
      .createQueryBuilder('alert')
      .where('alert.tenantId = :tenantId', { tenantId })
      .andWhere('alert.createdAt BETWEEN :start AND :end', { start: defaultStart, end: now })
      .orderBy(`CASE alert.severity 
        WHEN 'fatal' THEN 1 
        WHEN 'critical' THEN 2 
        WHEN 'warning' THEN 3 
        WHEN 'info' THEN 4 
        END`, 'ASC')
      .addOrderBy('alert.lastTriggeredAt', 'DESC')
      .limit(limit)
      .getMany();

    return alerts.map(alert => ({
      id: alert.id,
      name: alert.name,
      severity: alert.severity,
      status: alert.status,
      timestamp: alert.lastTriggeredAt,
      count: alert.count,
    }));
  }

  private generateTrendPoints(start: Date, end: Date, interval: 'hour' | 'day'): string[] {
    const points: string[] = [];
    const current = new Date(start);
    
    while (current <= end) {
      if (interval === 'hour') {
        points.push(current.toISOString().slice(0, 13) + ':00:00');
        current.setHours(current.getHours() + 1);
      } else {
        points.push(current.toISOString().slice(0, 10));
        current.setDate(current.getDate() + 1);
      }
    }
    
    return points;
  }

  private findTrendIndex(timestamp: Date, trendPoints: string[], interval: 'hour' | 'day'): number {
    const tsStr = interval === 'hour' 
      ? timestamp.toISOString().slice(0, 13) + ':00:00'
      : timestamp.toISOString().slice(0, 10);
    
    return trendPoints.indexOf(tsStr);
  }
}
