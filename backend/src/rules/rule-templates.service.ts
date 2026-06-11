import { Injectable, BadRequestException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RuleTemplate, TemplateType } from './rule-template.entity';
import { Rule, AlertSeverity, ConditionType } from './rule.entity';
import { RuleCondition } from './rules.service';

export interface CreateTemplateDto {
  name: string;
  description?: string;
  severity: AlertSeverity;
  conditionType: ConditionType;
  conditions: RuleCondition;
  dsl?: string;
  priority?: number;
  windowSize?: number;
  groupByLabels?: string[];
  sceneTags?: string[];
  suggestedThreshold?: string;
}

export interface SearchTemplatesParams {
  keyword?: string;
  sceneTag?: string;
  type?: TemplateType;
}

@Injectable()
export class RuleTemplatesService implements OnModuleInit {
  constructor(
    @InjectRepository(RuleTemplate)
    private readonly templateRepository: Repository<RuleTemplate>,
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,
  ) {}

  onModuleInit() {
    this.ensureSystemTemplates();
  }

  private async ensureSystemTemplates() {
    const count = await this.templateRepository.count({ where: { type: TemplateType.SYSTEM } });
    if (count === 0) {
      await this.createSystemTemplates();
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

  async findAll(tenantId: string, params?: SearchTemplatesParams): Promise<RuleTemplate[]> {
    const queryBuilder = this.templateRepository.createQueryBuilder('template');

    queryBuilder.where(
      '(template.type = :systemType OR template.tenantId = :tenantId)',
      { systemType: TemplateType.SYSTEM, tenantId },
    );

    if (params?.keyword) {
      queryBuilder.andWhere(
        '(template.name ILIKE :keyword OR template.description ILIKE :keyword)',
        { keyword: `%${params.keyword}%` },
      );
    }

    if (params?.sceneTag) {
      queryBuilder.andWhere('template.scene_tags @> ARRAY[:sceneTag]::varchar[]', { sceneTag: params.sceneTag });
    }

    if (params?.type) {
      queryBuilder.andWhere('template.type = :type', { type: params.type });
    }

    queryBuilder.orderBy('template.type', 'ASC');
    queryBuilder.addOrderBy('template.createdAt', 'DESC');

    return queryBuilder.getMany();
  }

  async findOne(tenantId: string, id: string): Promise<RuleTemplate> {
    const template = await this.templateRepository.findOne({
      where: [
        { id, type: TemplateType.SYSTEM },
        { id, tenantId },
      ],
    });

    if (!template) {
      throw new NotFoundException('模板不存在');
    }

    return template;
  }

  async create(tenantId: string, dto: CreateTemplateDto): Promise<RuleTemplate> {
    const template = this.templateRepository.create({
      ...dto,
      tenantId,
      type: TemplateType.CUSTOM,
    });

    return this.templateRepository.save(template);
  }

  async createFromRule(tenantId: string, ruleId: string, templateName: string, sceneTags?: string[]): Promise<RuleTemplate> {
    const rule = await this.ruleRepository.findOne({ where: { id: ruleId, tenantId } });

    if (!rule) {
      throw new NotFoundException('规则不存在');
    }

    const template = this.templateRepository.create({
      name: templateName,
      description: rule.description,
      tenantId,
      type: TemplateType.CUSTOM,
      severity: rule.severity,
      conditionType: rule.conditionType,
      conditions: rule.conditions,
      dsl: rule.dsl,
      priority: rule.priority,
      windowSize: rule.windowSize,
      groupByLabels: rule.groupByLabels,
      sceneTags: sceneTags || [],
      suggestedThreshold: '',
    });

    return this.templateRepository.save(template);
  }

  async update(tenantId: string, id: string, dto: Partial<CreateTemplateDto>): Promise<RuleTemplate> {
    const template = await this.findOne(tenantId, id);

    if (template.type === TemplateType.SYSTEM) {
      throw new BadRequestException('系统模板不可修改');
    }

    Object.assign(template, dto);
    return this.templateRepository.save(template);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const template = await this.findOne(tenantId, id);

    if (template.type === TemplateType.SYSTEM) {
      throw new BadRequestException('系统模板不可删除');
    }

    await this.templateRepository.delete({ id, tenantId, type: TemplateType.CUSTOM });
  }

  async getAllSceneTags(tenantId: string): Promise<string[]> {
    const templates = await this.findAll(tenantId);
    const tagSet = new Set<string>();

    for (const template of templates) {
      if (template.sceneTags) {
        template.sceneTags.forEach(tag => tagSet.add(tag));
      }
    }

    return Array.from(tagSet).sort();
  }
}
