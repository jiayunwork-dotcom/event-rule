import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { RulesService, CreateRuleDto } from './rules.service';
import { Rule } from './rule.entity';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('rules')
@ApiBearerAuth()
@Controller('api/v1/rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all rules for tenant' })
  async findAll(@CurrentTenant() tenantId: string): Promise<Rule[]> {
    return this.rulesService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get rule by ID' })
  async findOne(@CurrentTenant() tenantId: string, @Param('id') id: string): Promise<Rule> {
    return this.rulesService.findOne(tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new rule' })
  async create(@CurrentTenant() tenantId: string, @Body() dto: CreateRuleDto): Promise<Rule> {
    return this.rulesService.create(tenantId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update rule' })
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreateRuleDto>,
  ): Promise<Rule> {
    return this.rulesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete rule' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string): Promise<void> {
    return this.rulesService.remove(tenantId, id);
  }

  @Post(':id/enable')
  @ApiOperation({ summary: 'Enable rule' })
  async enable(@CurrentTenant() tenantId: string, @Param('id') id: string): Promise<Rule> {
    return this.rulesService.toggleEnabled(tenantId, id, true);
  }

  @Post(':id/disable')
  @ApiOperation({ summary: 'Disable rule' })
  async disable(@CurrentTenant() tenantId: string, @Param('id') id: string): Promise<Rule> {
    return this.rulesService.toggleEnabled(tenantId, id, false);
  }

  @Post(':id/simulate')
  @ApiOperation({ summary: 'Simulate rule matching with test event data' })
  async simulate(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: { metricName?: string; value?: number; labels?: Record<string, string>; timestamp?: string },
  ) {
    return this.rulesService.simulateRule(tenantId, id, body);
  }

  @Post('parse-dsl')
  @ApiOperation({ summary: 'Parse DSL and return AST' })
  async parseDsl(@Body() body: { dsl: string }) {
    return this.rulesService.parseDsl(body.dsl);
  }

  @Post('export')
  @ApiOperation({ summary: 'Export rules as JSON' })
  async exportRules(
    @CurrentTenant() tenantId: string,
    @Body() body: { ruleIds?: string[] },
    @Res() res: Response,
  ) {
    const rules = await this.rulesService.exportRules(tenantId, body.ruleIds);
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `rules_${timestamp}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(rules, null, 2));
  }

  @Post('import')
  @ApiOperation({ summary: 'Import rules from JSON' })
  async importRules(
    @CurrentTenant() tenantId: string,
    @Body() body: { rules: any[]; conflictStrategy: 'skip' | 'overwrite' | 'rename' },
  ) {
    return this.rulesService.importRules(tenantId, body.rules, body.conflictStrategy);
  }
}
