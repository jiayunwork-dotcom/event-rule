import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';
import { User } from '../../users/user.entity';
import { RuleTemplate, TemplateType } from '../../rules/rule-template.entity';
import { AlertSeverity, ConditionType } from '../../rules/rule.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class DatabaseInitService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseInitService.name);
  private readonly DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
  private readonly DEFAULT_USERNAME = 'admin';
  private readonly DEFAULT_PASSWORD = 'password';

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RuleTemplate)
    private readonly templateRepository: Repository<RuleTemplate>,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultTenant();
    await this.ensureDefaultUser();
    await this.ensureSystemTemplates();
    this.logger.log('Database initialization completed');
  }

  private async ensureDefaultTenant() {
    const tenant = await this.tenantRepository.findOne({
      where: { id: this.DEFAULT_TENANT_ID },
    });

    if (!tenant) {
      this.logger.log('Creating default tenant...');
      await this.tenantRepository.save({
        id: this.DEFAULT_TENANT_ID,
        name: 'Default Tenant',
        apiKey: 'default-api-key-123',
        webhookSecret: 'default-secret-456',
      });
      this.logger.log('Default tenant created');
    }
  }

  private async ensureDefaultUser() {
    const user = await this.userRepository.findOne({
      where: { username: this.DEFAULT_USERNAME },
    });

    if (!user) {
      this.logger.log('Creating default admin user...');
      const passwordHash = await bcrypt.hash(this.DEFAULT_PASSWORD, 10);
      await this.userRepository.save({
        tenantId: this.DEFAULT_TENANT_ID,
        username: this.DEFAULT_USERNAME,
        email: 'admin@example.com',
        passwordHash,
        role: 'admin',
      });
      this.logger.log(`Default admin user created (username: ${this.DEFAULT_USERNAME}, password: ${this.DEFAULT_PASSWORD})`);
    } else {
      const isValid = await bcrypt.compare(this.DEFAULT_PASSWORD, user.passwordHash);
      if (!isValid) {
        this.logger.warn('Default admin user password mismatch, resetting to default...');
        user.passwordHash = await bcrypt.hash(this.DEFAULT_PASSWORD, 10);
        await this.userRepository.save(user);
        this.logger.log(`Default admin password reset to: ${this.DEFAULT_PASSWORD}`);
      }
    }
  }

  private async ensureSystemTemplates() {
    const count = await this.templateRepository.count({
      where: { type: TemplateType.SYSTEM },
    });

    if (count === 0) {
      this.logger.log('Creating system rule templates...');
      await this.createSystemTemplates();
      this.logger.log('System rule templates created');
    }
  }

  private async createSystemTemplates() {
    const systemTemplates: Partial<RuleTemplate>[] = [
      {
        name: 'CPU使用率告警',
        description: '当CPU使用率持续超过阈值时触发告警，适用于服务器资源监控',
        type: TemplateType.SYSTEM,
        severity: AlertSeverity.WARNING,
        conditionType: ConditionType.WINDOW_AGGREGATE,
        conditions: {
          operator: 'AND',
          conditions: [
            {
              type: 'window',
              metric: 'cpu_usage',
              aggregate: 'avg',
              operator: 'gt',
              threshold: 80,
            },
          ],
        },
        priority: 1,
        windowSize: 300,
        groupByLabels: ['host'],
        sceneTags: ['基础设施', 'CPU', '资源监控'],
        suggestedThreshold: '80%',
      },
      {
        name: '内存使用率告警',
        description: '当内存使用率持续超过阈值时触发告警，适用于服务器资源监控',
        type: TemplateType.SYSTEM,
        severity: AlertSeverity.CRITICAL,
        conditionType: ConditionType.WINDOW_AGGREGATE,
        conditions: {
          operator: 'AND',
          conditions: [
            {
              type: 'window',
              metric: 'memory_usage',
              aggregate: 'avg',
              operator: 'gt',
              threshold: 90,
            },
          ],
        },
        priority: 2,
        windowSize: 180,
        groupByLabels: ['host'],
        sceneTags: ['基础设施', '内存', '资源监控'],
        suggestedThreshold: '90%',
      },
      {
        name: '磁盘使用率告警',
        description: '当磁盘使用率超过阈值时触发告警，适用于磁盘空间监控',
        type: TemplateType.SYSTEM,
        severity: AlertSeverity.WARNING,
        conditionType: ConditionType.SINGLE_THRESHOLD,
        conditions: {
          operator: 'AND',
          conditions: [
            {
              type: 'threshold',
              metric: 'disk_usage',
              operator: 'gt',
              value: 85,
            },
          ],
        },
        priority: 1,
        windowSize: 300,
        groupByLabels: ['host', 'mount'],
        sceneTags: ['基础设施', '磁盘', '资源监控'],
        suggestedThreshold: '85%',
      },
      {
        name: '服务响应时间告警',
        description: '当服务P99响应时间超过阈值时触发告警，适用于应用性能监控',
        type: TemplateType.SYSTEM,
        severity: AlertSeverity.WARNING,
        conditionType: ConditionType.WINDOW_AGGREGATE,
        conditions: {
          operator: 'AND',
          conditions: [
            {
              type: 'window',
              metric: 'response_time_p99',
              aggregate: 'avg',
              operator: 'gt',
              threshold: 2000,
            },
          ],
        },
        priority: 2,
        windowSize: 300,
        groupByLabels: ['service', 'endpoint'],
        sceneTags: ['应用性能', '响应时间', 'APM'],
        suggestedThreshold: '2秒',
      },
      {
        name: '错误率告警',
        description: '当5分钟窗口内错误率超过阈值时触发告警，适用于服务可用性监控',
        type: TemplateType.SYSTEM,
        severity: AlertSeverity.CRITICAL,
        conditionType: ConditionType.WINDOW_AGGREGATE,
        conditions: {
          operator: 'AND',
          conditions: [
            {
              type: 'window',
              metric: 'error_rate',
              aggregate: 'avg',
              operator: 'gt',
              threshold: 5,
            },
          ],
        },
        priority: 3,
        windowSize: 300,
        groupByLabels: ['service'],
        sceneTags: ['应用性能', '错误率', '可用性'],
        suggestedThreshold: '5%',
      },
      {
        name: '服务宕机检测',
        description: '当心跳超时60秒时触发告警，适用于服务存活状态监控',
        type: TemplateType.SYSTEM,
        severity: AlertSeverity.FATAL,
        conditionType: ConditionType.FREQUENCY,
        conditions: {
          operator: 'AND',
          conditions: [
            {
              type: 'frequency',
              windowSize: 60,
              threshold: 0,
            },
          ],
        },
        priority: 5,
        windowSize: 60,
        groupByLabels: ['service', 'instance'],
        sceneTags: ['可用性', '心跳', '存活检测'],
        suggestedThreshold: '心跳超时60秒',
      },
    ];

    for (const template of systemTemplates) {
      const entity = this.templateRepository.create(template);
      await this.templateRepository.save(entity);
    }
  }
}
