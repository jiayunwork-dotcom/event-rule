import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationChannel, ChannelType } from './notification-channel.entity';
import { Notification, NotificationStatus } from './notification.entity';
import { DeadLetter } from './dead-letter.entity';
import { NotificationPolicy } from '../schedules/schedule.entity';
import { Alert } from '../alerts/alert.entity';
import { AlertSeverity } from '../rules/rule.entity';
import * as nodemailer from 'nodemailer';
import axios from 'axios';

export interface CreateChannelDto {
  type: ChannelType;
  name: string;
  config: any;
  template?: string;
}

export interface CreatePolicyDto {
  name: string;
  severityLevels: AlertSeverity[];
  channelIds: string[];
  scheduleId?: string;
  escalationChain?: Array<{ level: number; timeout: number; userIds: string[] }>;
  isDefault?: boolean;
}

interface NotificationContext {
  alert: Alert;
  isNew?: boolean;
  isAggregated?: boolean;
  count?: number;
  escalationLevel?: number;
  customRecipients?: string[];
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly retryIntervals = [60000, 300000, 900000];
  private transporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(NotificationChannel)
    private readonly channelRepository: Repository<NotificationChannel>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(DeadLetter)
    private readonly deadLetterRepository: Repository<DeadLetter>,
    @InjectRepository(NotificationPolicy)
    private readonly policyRepository: Repository<NotificationPolicy>,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    this.initEmailTransporter();
  }

  onModuleInit() {
    this.startRetryProcessor();
  }

  private initEmailTransporter() {
    const host = this.configService.get('SMTP_HOST');
    const port = this.configService.get('SMTP_PORT', 587);
    const user = this.configService.get('SMTP_USER');
    const pass = this.configService.get('SMTP_PASSWORD');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(port),
        secure: Number(port) === 465,
        auth: { user, pass },
      });
    }
  }

  @OnEvent('alert.created')
  async handleAlertCreated(payload: { 
    tenantId: string; 
    alert: Alert; 
    event?: any;
    isNew: boolean;
    isAggregated?: boolean;
    count?: number;
  }) {
    const { tenantId, alert, isNew, isAggregated, count } = payload;
    
    if (!isNew && !isAggregated) {
      return;
    }

    await this.sendAlertNotifications(tenantId, alert, {
      alert,
      isNew,
      isAggregated,
      count,
    });
  }

  @OnEvent('alert.escalated')
  async handleAlertEscalated(payload: {
    tenantId: string;
    alert: Alert;
    level: number;
    reason: string;
  }) {
    const { tenantId, alert, level } = payload;
    
    await this.sendAlertNotifications(tenantId, alert, {
      alert,
      escalationLevel: level,
    });
  }

  private async sendAlertNotifications(
    tenantId: string, 
    alert: Alert, 
    context: NotificationContext
  ) {
    const policies = await this.policyRepository.find({
      where: { tenantId, isEnabled: true },
      order: { isDefault: 'DESC' },
    });

    const applicablePolicies = policies.filter(policy => 
      policy.severityLevels.length === 0 || 
      policy.severityLevels.includes(alert.severity)
    );

    if (applicablePolicies.length === 0) {
      this.logger.warn(`No notification policy found for tenant ${tenantId} and severity ${alert.severity}`);
      return;
    }

    for (const policy of applicablePolicies) {
      for (const channelId of policy.channelIds) {
        const channel = await this.channelRepository.findOne({ 
          where: { id: channelId, tenantId, isEnabled: true } 
        });
        
        if (!channel) continue;

        await this.createNotification(tenantId, alert, channel, context);
      }
    }
  }

  private async createNotification(
    tenantId: string,
    alert: Alert,
    channel: NotificationChannel,
    context: NotificationContext
  ): Promise<Notification> {
    const content = this.renderTemplate(channel.template || this.getDefaultTemplate(channel.type), alert, context);
    
    const recipient = this.getRecipient(channel);

    const notification = this.notificationRepository.create({
      tenantId,
      alertId: alert.id,
      channelId: channel.id,
      channelType: channel.type,
      recipient,
      content,
      status: NotificationStatus.PENDING,
      retryCount: 0,
      maxRetries: 3,
    });

    const saved = await this.notificationRepository.save(notification);
    
    await this.processNotification(saved, channel);
    
    return saved;
  }

  private getDefaultTemplate(type: ChannelType): string {
    switch (type) {
      case ChannelType.EMAIL:
        return `
          <h1>告警通知: {{alert_name}}</h1>
          <p><strong>严重程度:</strong> {{severity}}</p>
          <p><strong>状态:</strong> {{status}}</p>
          <p><strong>主机:</strong> {{labels.host}}</p>
          <p><strong>指标值:</strong> {{value}}</p>
          <p><strong>首次触发时间:</strong> {{first_triggered_at}}</p>
          <p><strong>触发次数:</strong> {{count}}</p>
          {{#if is_aggregated}}
          <p><strong>聚合告警:</strong> 共 {{aggregate_count}} 条告警</p>
          {{/if}}
          <p><strong>标签:</strong></p>
          <ul>
          {{#each labels}}
            <li>{{@key}}: {{this}}</li>
          {{/each}}
          </ul>
        `;
      case ChannelType.SLACK:
      case ChannelType.WECHAT:
        return `
          *[{{severity}}] {{alert_name}}*
          状态: {{status}}
          主机: {{labels.host}}
          指标值: {{value}}
          首次触发: {{first_triggered_at}}
          触发次数: {{count}}
          {{#if is_aggregated}}
          聚合告警: 共 {{aggregate_count}} 条告警
          {{/if}}
        `;
      case ChannelType.WEBHOOK:
        return JSON.stringify({
          alert_name: '{{alert_name}}',
          severity: '{{severity}}',
          status: '{{status}}',
          labels: '{{labels}}',
          value: '{{value}}',
          first_triggered_at: '{{first_triggered_at}}',
          count: '{{count}}',
        });
      default:
        return '{{alert_name}}: {{severity}}';
    }
  }

  private renderTemplate(template: string, alert: Alert, context: NotificationContext): string {
    let result = template;

    const formatDate = (date: Date | null | undefined) => {
      if (!date) return 'N/A';
      return new Date(date).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    };

    const replacements: Record<string, any> = {
      alert_name: alert.name,
      severity: alert.severity.toUpperCase(),
      status: alert.status,
      value: alert.value?.toString() || 'N/A',
      count: alert.count.toString(),
      first_triggered_at: formatDate(alert.firstTriggeredAt),
      last_triggered_at: formatDate(alert.lastTriggeredAt),
      is_aggregated: context.isAggregated || false,
      aggregate_count: context.count || 1,
      escalation_level: context.escalationLevel || 0,
    };

    for (const [key, value] of Object.entries(replacements)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, String(value));
    }

    if (alert.labels) {
      for (const [key, value] of Object.entries(alert.labels)) {
        const regex = new RegExp(`{{\\s*labels\\.${key}\\s*}}`, 'g');
        result = result.replace(regex, String(value));
      }

      const labelsRegex = new RegExp(`{{\\s*labels\\s*}}`, 'g');
      result = result.replace(labelsRegex, JSON.stringify(alert.labels));
    }

    return result;
  }

  private getRecipient(channel: NotificationChannel): string {
    switch (channel.type) {
      case ChannelType.EMAIL:
        return channel.config?.to || channel.config?.email || '';
      case ChannelType.SLACK:
        return channel.config?.webhookUrl || this.configService.get('SLACK_WEBHOOK_URL') || '';
      case ChannelType.WECHAT:
        return channel.config?.webhookUrl || this.configService.get('WECHAT_WEBHOOK_URL') || '';
      case ChannelType.WEBHOOK:
        return channel.config?.url || '';
      default:
        return '';
    }
  }

  private async processNotification(notification: Notification, channel: NotificationChannel) {
    try {
      notification.status = NotificationStatus.SENDING;
      await this.notificationRepository.save(notification);

      await this.sendViaChannel(notification, channel);

      notification.status = NotificationStatus.SENT;
      notification.sentAt = new Date();
      await this.notificationRepository.save(notification);

      this.eventEmitter.emit('notification.sent', { notification });
    } catch (error) {
      this.logger.error(`Failed to send notification ${notification.id}`, error);
      await this.handleNotificationFailure(notification, channel, error.message);
    }
  }

  private async sendViaChannel(notification: Notification, channel: NotificationChannel): Promise<void> {
    switch (notification.channelType) {
      case ChannelType.EMAIL:
        await this.sendEmail(notification, channel);
        break;
      case ChannelType.SLACK:
        await this.sendSlack(notification, channel);
        break;
      case ChannelType.WECHAT:
        await this.sendWeChat(notification, channel);
        break;
      case ChannelType.WEBHOOK:
        await this.sendWebhook(notification, channel);
        break;
      default:
        throw new Error(`Unsupported channel type: ${notification.channelType}`);
    }
  }

  private async sendEmail(notification: Notification, channel: NotificationChannel): Promise<void> {
    if (!this.transporter) {
      throw new Error('Email transporter not configured');
    }

    const to = notification.recipient || channel.config?.to;
    if (!to) {
      throw new Error('No email recipient configured');
    }

    await this.transporter.sendMail({
      from: this.configService.get('SMTP_USER'),
      to,
      subject: `[${notification.channelType.toUpperCase()}] ${this.extractSubject(notification.content)}`,
      html: notification.content,
    });
  }

  private async sendSlack(notification: Notification, channel: NotificationChannel): Promise<void> {
    const webhookUrl = notification.recipient || channel.config?.webhookUrl;
    if (!webhookUrl) {
      throw new Error('No Slack webhook URL configured');
    }

    const payload = {
      text: notification.content,
      attachments: [
        {
          color: this.getSeverityColor(channel),
          fields: [
            { title: 'Severity', value: channel.config?.severity || 'warning', short: true },
          ],
        },
      ],
    };

    await axios.post(webhookUrl, payload);
  }

  private async sendWeChat(notification: Notification, channel: NotificationChannel): Promise<void> {
    const webhookUrl = notification.recipient || channel.config?.webhookUrl;
    if (!webhookUrl) {
      throw new Error('No WeChat webhook URL configured');
    }

    const payload = {
      msgtype: 'markdown',
      markdown: {
        content: notification.content,
      },
    };

    await axios.post(webhookUrl, payload);
  }

  private async sendWebhook(notification: Notification, channel: NotificationChannel): Promise<void> {
    const url = notification.recipient || channel.config?.url;
    if (!url) {
      throw new Error('No webhook URL configured');
    }

    const headers = channel.config?.headers || {};
    const method = channel.config?.method || 'POST';
    let payload: any;

    try {
      payload = JSON.parse(notification.content);
    } catch {
      payload = { content: notification.content };
    }

    await axios({
      method,
      url,
      headers,
      data: payload,
      timeout: 10000,
    });
  }

  private getSeverityColor(channel: NotificationChannel): string {
    const severity = channel.config?.severity || 'warning';
    switch (severity) {
      case 'fatal': return '#ff0000';
      case 'critical': return '#ff6600';
      case 'warning': return '#ffcc00';
      default: return '#00ccff';
    }
  }

  private extractSubject(content: string): string {
    const match = content.match(/<h1>(.+?)<\/h1>/);
    return match ? match[1] : 'Alert Notification';
  }

  private async handleNotificationFailure(
    notification: Notification, 
    channel: NotificationChannel,
    errorMessage: string
  ) {
    notification.retryCount++;
    notification.errorMessage = errorMessage;

    if (notification.retryCount >= notification.maxRetries) {
      notification.status = NotificationStatus.DEAD_LETTER;
      await this.notificationRepository.save(notification);
      
      await this.moveToDeadLetter(notification);
      
      this.eventEmitter.emit('notification.failed', { notification, error: errorMessage });
    } else {
      notification.status = NotificationStatus.FAILED;
      notification.nextRetryAt = new Date(
        Date.now() + this.retryIntervals[notification.retryCount - 1]
      );
      await this.notificationRepository.save(notification);
    }
  }

  private async moveToDeadLetter(notification: Notification): Promise<DeadLetter> {
    const deadLetter = this.deadLetterRepository.create({
      tenantId: notification.tenantId,
      notificationId: notification.id,
      originalData: {
        alertId: notification.alertId,
        channelType: notification.channelType,
        recipient: notification.recipient,
        content: notification.content,
      },
      errorMessage: notification.errorMessage,
    });

    return this.deadLetterRepository.save(deadLetter);
  }

  private startRetryProcessor() {
    setInterval(async () => {
      try {
        await this.processRetryQueue();
      } catch (error) {
        this.logger.error('Error processing retry queue', error);
      }
    }, 30000);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processRetryQueue() {
    const now = new Date();
    
    const failedNotifications = await this.notificationRepository
      .createQueryBuilder('n')
      .where('n.status = :status', { status: NotificationStatus.FAILED })
      .andWhere('n.nextRetryAt <= :now', { now })
      .andWhere('n.retryCount < n.maxRetries')
      .getMany();

    for (const notification of failedNotifications) {
      const channel = await this.channelRepository.findOne({ 
        where: { id: notification.channelId! } 
      });
      
      if (channel) {
        await this.processNotification(notification, channel);
      }
    }
  }

  async getChannels(tenantId: string): Promise<NotificationChannel[]> {
    return this.channelRepository.find({ where: { tenantId } });
  }

  async createChannel(tenantId: string, dto: CreateChannelDto): Promise<NotificationChannel> {
    const channel = this.channelRepository.create({ ...dto, tenantId });
    return this.channelRepository.save(channel);
  }

  async updateChannel(tenantId: string, id: string, dto: Partial<CreateChannelDto>): Promise<NotificationChannel> {
    const channel = await this.channelRepository.findOne({ where: { id, tenantId } });
    if (!channel) {
      throw new BadRequestException('Channel not found');
    }
    Object.assign(channel, dto);
    return this.channelRepository.save(channel);
  }

  async deleteChannel(tenantId: string, id: string): Promise<void> {
    await this.channelRepository.delete({ id, tenantId });
  }

  async toggleChannel(tenantId: string, id: string, isEnabled: boolean): Promise<NotificationChannel> {
    const channel = await this.channelRepository.findOne({ where: { id, tenantId } });
    if (!channel) {
      throw new BadRequestException('Channel not found');
    }
    channel.isEnabled = isEnabled;
    return this.channelRepository.save(channel);
  }

  async getPolicies(tenantId: string): Promise<NotificationPolicy[]> {
    return this.policyRepository.find({ where: { tenantId } });
  }

  async createPolicy(tenantId: string, dto: CreatePolicyDto): Promise<NotificationPolicy> {
    const policy = this.policyRepository.create({ ...dto, tenantId });
    return this.policyRepository.save(policy);
  }

  async updatePolicy(tenantId: string, id: string, dto: Partial<CreatePolicyDto>): Promise<NotificationPolicy> {
    const policy = await this.policyRepository.findOne({ where: { id, tenantId } });
    if (!policy) {
      throw new BadRequestException('Policy not found');
    }
    Object.assign(policy, dto);
    return this.policyRepository.save(policy);
  }

  async deletePolicy(tenantId: string, id: string): Promise<void> {
    await this.policyRepository.delete({ id, tenantId });
  }

  async getNotificationsByAlertId(tenantId: string, alertId: string): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { tenantId, alertId },
      order: { createdAt: 'DESC' },
    });
  }

  async retryNotification(tenantId: string, notificationId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, tenantId },
    });

    if (!notification) {
      throw new BadRequestException('Notification not found');
    }

    if (notification.status !== NotificationStatus.FAILED && notification.status !== NotificationStatus.DEAD_LETTER) {
      throw new BadRequestException('Only failed or dead_letter notifications can be retried');
    }

    notification.status = NotificationStatus.PENDING;
    notification.retryCount = 0;
    notification.errorMessage = null;
    notification.nextRetryAt = null;
    await this.notificationRepository.save(notification);

    const channel = await this.channelRepository.findOne({
      where: { id: notification.channelId! },
    });

    if (channel) {
      await this.processNotification(notification, channel);
    }

    return notification;
  }

  async getDeadLetters(tenantId: string): Promise<DeadLetter[]> {
    return this.deadLetterRepository.find({ 
      where: { tenantId },
      order: { createdAt: 'DESC' }
    });
  }

  async getNotificationHistory(tenantId: string, filters?: {
    channelType?: ChannelType;
    status?: NotificationStatus;
    startDate?: Date;
    endDate?: Date;
  }): Promise<Notification[]> {
    const query = this.notificationRepository.createQueryBuilder('n')
      .where('n.tenantId = :tenantId', { tenantId });

    if (filters?.channelType) {
      query.andWhere('n.channelType = :channelType', { channelType: filters.channelType });
    }
    if (filters?.status) {
      query.andWhere('n.status = :status', { status: filters.status });
    }
    if (filters?.startDate) {
      query.andWhere('n.createdAt >= :startDate', { startDate: filters.startDate });
    }
    if (filters?.endDate) {
      query.andWhere('n.createdAt <= :endDate', { endDate: filters.endDate });
    }

    return query.orderBy('n.createdAt', 'DESC').getMany();
  }
}
