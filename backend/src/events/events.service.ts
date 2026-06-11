import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventQueueService } from '../common/services/event-queue.service';
import { Event } from '../common/types/event.type';
import { EventSource, EventSourceType } from './event-source.entity';
import { AgentConfig } from './agent-config.entity';
import { Tenant } from '../tenants/tenant.entity';
import * as crypto from 'crypto';

export interface WebhookEventDto {
  source?: string;
  timestamp?: string;
  labels: Record<string, string>;
  metricName?: string;
  value?: number;
  severity: 'info' | 'warning' | 'critical' | 'fatal';
  message?: string;
}

export interface PrometheusAlert {
  status: 'firing' | 'resolved';
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt: string;
  generatorURL: string;
  fingerprint: string;
}

export interface PrometheusWebhookDto {
  version: string;
  receiver: string;
  status: 'firing' | 'resolved';
  alerts: PrometheusAlert[];
  groupLabels: Record<string, string>;
  commonLabels: Record<string, string>;
  commonAnnotations: Record<string, string>;
  externalURL: string;
}

export interface AgentMetricsDto {
  host: string;
  cpu?: number;
  memory?: number;
  disk?: number;
  network?: number;
  labels?: Record<string, string>;
}

export interface MetricEventDto {
  metric_name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp?: string;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly eventQueueService: EventQueueService,
    @InjectRepository(EventSource)
    private readonly eventSourceRepository: Repository<EventSource>,
    @InjectRepository(AgentConfig)
    private readonly agentConfigRepository: Repository<AgentConfig>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async receiveWebhookEvent(apiKey: string, eventDto: WebhookEventDto, signature?: string): Promise<string> {
    const tenant = await this.tenantRepository.findOne({ where: { apiKey, isActive: true } });
    if (!tenant) {
      throw new BadRequestException('Invalid API key');
    }

    if (signature) {
      const expectedSignature = crypto
        .createHmac('sha256', tenant.webhookSecret)
        .update(JSON.stringify(eventDto))
        .digest('hex');
      
      if (signature !== expectedSignature) {
        throw new BadRequestException('Invalid signature');
      }
    }

    const event: Omit<Event, 'id'> = {
      source: eventDto.source || 'webhook',
      timestamp: eventDto.timestamp ? new Date(eventDto.timestamp) : new Date(),
      labels: eventDto.labels || {},
      metricName: eventDto.metricName,
      value: eventDto.value,
      severity: eventDto.severity,
      message: eventDto.message,
    };

    return this.eventQueueService.enqueue(tenant.id, event);
  }

  async receivePrometheusAlert(apiKey: string, dto: PrometheusWebhookDto): Promise<string[]> {
    const tenant = await this.tenantRepository.findOne({ where: { apiKey, isActive: true } });
    if (!tenant) {
      throw new BadRequestException('Invalid API key');
    }
    const eventIds: string[] = [];

    for (const alert of dto.alerts) {
      const labels = { ...alert.labels, ...dto.commonLabels };
      
      const severity = (labels.severity || 'warning') as Event['severity'];
      
      const event: Omit<Event, 'id'> = {
        source: 'prometheus',
        timestamp: new Date(alert.startsAt),
        labels,
        metricName: labels.alertname,
        severity,
        status: alert.status,
        message: alert.annotations?.description || alert.annotations?.summary,
      };

      const eventId = await this.eventQueueService.enqueue(tenant.id, event);
      eventIds.push(eventId);
    }

    return eventIds;
  }

  async receiveAgentMetrics(tenantId: string, agentId: string, dto: AgentMetricsDto): Promise<string[]> {
    const agentConfig = await this.agentConfigRepository.findOne({
      where: { id: agentId, tenantId, isActive: true },
    });

    if (!agentConfig) {
      throw new BadRequestException('Agent configuration not found');
    }

    const eventIds: string[] = [];
    const baseLabels = { ...dto.labels, host: dto.host, agent: agentConfig.name };

    if (agentConfig.cpuEnabled && dto.cpu !== undefined) {
      const event: Omit<Event, 'id'> = {
        source: 'agent',
        timestamp: new Date(),
        labels: { ...baseLabels, metric: 'cpu_usage' },
        metricName: 'cpu_usage',
        value: dto.cpu,
        severity: dto.cpu > 90 ? 'critical' : dto.cpu > 80 ? 'warning' : 'info',
      };
      eventIds.push(await this.eventQueueService.enqueue(tenantId, event));
    }

    if (agentConfig.memoryEnabled && dto.memory !== undefined) {
      const event: Omit<Event, 'id'> = {
        source: 'agent',
        timestamp: new Date(),
        labels: { ...baseLabels, metric: 'memory_usage' },
        metricName: 'memory_usage',
        value: dto.memory,
        severity: dto.memory > 90 ? 'critical' : dto.memory > 80 ? 'warning' : 'info',
      };
      eventIds.push(await this.eventQueueService.enqueue(tenantId, event));
    }

    if (agentConfig.diskEnabled && dto.disk !== undefined) {
      const event: Omit<Event, 'id'> = {
        source: 'agent',
        timestamp: new Date(),
        labels: { ...baseLabels, metric: 'disk_usage' },
        metricName: 'disk_usage',
        value: dto.disk,
        severity: dto.disk > 90 ? 'critical' : dto.disk > 80 ? 'warning' : 'info',
      };
      eventIds.push(await this.eventQueueService.enqueue(tenantId, event));
    }

    if (agentConfig.networkEnabled && dto.network !== undefined) {
      const event: Omit<Event, 'id'> = {
        source: 'agent',
        timestamp: new Date(),
        labels: { ...baseLabels, metric: 'network_usage' },
        metricName: 'network_usage',
        value: dto.network,
        severity: dto.network > 90 ? 'critical' : dto.network > 80 ? 'warning' : 'info',
      };
      eventIds.push(await this.eventQueueService.enqueue(tenantId, event));
    }

    agentConfig.lastHeartbeat = new Date();
    await this.agentConfigRepository.save(agentConfig);

    return eventIds;
  }

  async getEventSources(tenantId: string): Promise<EventSource[]> {
    return this.eventSourceRepository.find({ where: { tenantId } });
  }

  async createEventSource(tenantId: string, data: Partial<EventSource>): Promise<EventSource> {
    const source = this.eventSourceRepository.create({ ...data, tenantId });
    return this.eventSourceRepository.save(source);
  }

  async getAgentConfigs(tenantId: string): Promise<AgentConfig[]> {
    return this.agentConfigRepository.find({ where: { tenantId } });
  }

  async createAgentConfig(tenantId: string, data: Partial<AgentConfig>): Promise<AgentConfig> {
    const config = this.agentConfigRepository.create({ ...data, tenantId });
    return this.agentConfigRepository.save(config);
  }

  async updateAgentConfig(tenantId: string, id: string, data: Partial<AgentConfig>): Promise<AgentConfig> {
    const config = await this.agentConfigRepository.findOne({ where: { id, tenantId } });
    if (!config) {
      throw new BadRequestException('Agent config not found');
    }
    Object.assign(config, data);
    return this.agentConfigRepository.save(config);
  }

  async deleteAgentConfig(tenantId: string, id: string): Promise<void> {
    await this.agentConfigRepository.delete({ id, tenantId });
  }

  async getWebhookUrl(tenantId: string): Promise<{ url: string; secret: string }> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    return {
      url: `/webhook/${tenant.apiKey}`,
      secret: tenant.webhookSecret,
    };
  }

  async receiveMetricEvent(tenantId: string, dto: MetricEventDto): Promise<string> {
    const event: Omit<Event, 'id'> = {
      source: 'metric-api',
      timestamp: dto.timestamp ? new Date(dto.timestamp) : new Date(),
      labels: dto.labels || {},
      metricName: dto.metric_name,
      value: dto.value,
      severity: 'info',
    };

    return this.eventQueueService.enqueue(tenantId, event);
  }
}
