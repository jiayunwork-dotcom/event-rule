import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
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
export class RuleTemplatesService {
  constructor(
    @InjectRepository(RuleTemplate)
    private readonly templateRepository: Repository<RuleTemplate>,
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,
  ) {}

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
