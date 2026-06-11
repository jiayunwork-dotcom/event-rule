import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { RuleTemplatesService, CreateTemplateDto, SearchTemplatesParams } from './rule-templates.service';
import { RuleTemplate } from './rule-template.entity';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

@ApiTags('rule-templates')
@ApiBearerAuth()
@Controller('api/v1/rule-templates')
export class RuleTemplatesController {
  constructor(private readonly templatesService: RuleTemplatesService) {}

  @Get()
  @ApiOperation({ summary: '获取规则模板列表' })
  @ApiQuery({ name: 'keyword', required: false, description: '关键词搜索' })
  @ApiQuery({ name: 'sceneTag', required: false, description: '场景标签筛选' })
  @ApiQuery({ name: 'type', required: false, description: '模板类型: system/custom' })
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query() params: SearchTemplatesParams,
  ): Promise<RuleTemplate[]> {
    return this.templatesService.findAll(tenantId, params);
  }

  @Get('scene-tags')
  @ApiOperation({ summary: '获取所有场景标签' })
  async getSceneTags(@CurrentTenant() tenantId: string): Promise<string[]> {
    return this.templatesService.getAllSceneTags(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个规则模板' })
  async findOne(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<RuleTemplate> {
    return this.templatesService.findOne(tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: '创建自定义规则模板' })
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateTemplateDto,
  ): Promise<RuleTemplate> {
    return this.templatesService.create(tenantId, dto);
  }

  @Post('from-rule/:ruleId')
  @ApiOperation({ summary: '从已有规则保存为模板' })
  async createFromRule(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: { name: string; sceneTags?: string[] },
  ): Promise<RuleTemplate> {
    return this.templatesService.createFromRule(tenantId, ruleId, body.name, body.sceneTags);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新自定义规则模板' })
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreateTemplateDto>,
  ): Promise<RuleTemplate> {
    return this.templatesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除自定义规则模板' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.templatesService.remove(tenantId, id);
  }
}
