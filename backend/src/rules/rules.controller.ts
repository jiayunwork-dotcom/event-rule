import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { RulesService, CreateRuleDto } from './rules.service';
import { RuleVersionsService } from './rule-versions.service';
import { Rule } from './rule.entity';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('rules')
@ApiBearerAuth()
@Controller('api/v1/rules')
export class RulesController {
  constructor(
    private readonly rulesService: RulesService,
    private readonly versionsService: RuleVersionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all rules for tenant' })
  async findAll(@CurrentTenant() tenantId: string): Promise<Rule[]> {
    return this.rulesService.findAll(tenantId);
  }

  @Get(':ruleId/versions')
  @ApiOperation({ summary: 'Get version history for a rule' })
  async getVersions(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('createdBy') createdBy?: string,
    @Query('tag') tag?: string,
  ) {
    return this.versionsService.getVersions(ruleId, {
      startTime,
      endTime,
      createdBy,
      tag,
    });
  }

  @Get(':ruleId/versions/creators')
  @ApiOperation({ summary: 'Get distinct version creators for a rule' })
  async getVersionCreators(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.versionsService.getVersionCreators(ruleId);
  }

  @Get(':ruleId/versions/tags')
  @ApiOperation({ summary: 'Get all distinct tags for a rule' })
  async getVersionTags(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.versionsService.getVersionTags(ruleId);
  }

  @Get(':ruleId/versions/:versionId')
  @ApiOperation({ summary: 'Get a specific version' })
  async getVersion(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.versionsService.getVersion(ruleId, versionId);
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

  @Post('check-locks')
  @ApiOperation({ summary: 'Check if rules are locked' })
  async checkLocks(
    @CurrentTenant() tenantId: string,
    @Body() body: { ruleIds: string[] },
  ) {
    const lockedIds = await this.versionsService.getLockedRuleIds(body.ruleIds);
    return {
      lockedRuleIds: Array.from(lockedIds),
    };
  }

  @Post(':ruleId/versions/diff')
  @ApiOperation({ summary: 'Compare two versions' })
  async diffVersions(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: { versionIdA: string; versionIdB: string },
  ) {
    return this.versionsService.diffVersions(
      ruleId,
      body.versionIdA,
      body.versionIdB,
    );
  }

  @Post(':ruleId/versions/:versionId/rollback-preview')
  @ApiOperation({ summary: 'Preview rollback to a specific version' })
  async rollbackPreview(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.versionsService.getRollbackPreview(tenantId, ruleId, versionId);
  }

  @Post(':ruleId/versions/:versionId/rollback')
  @ApiOperation({ summary: 'Rollback rule to a specific version' })
  async rollback(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
    @Param('versionId') versionId: string,
    @Body() body: { rolledBackBy: string; reason?: string },
  ) {
    return this.versionsService.rollback(
      tenantId,
      ruleId,
      versionId,
      body.rolledBackBy || 'system',
      body.reason,
    );
  }

  @Post(':ruleId/versions/:versionId/tags')
  @ApiOperation({ summary: 'Add tags to a version' })
  async addTags(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
    @Param('versionId') versionId: string,
    @Body() body: { tags: string[] },
  ) {
    return this.versionsService.addTags(ruleId, versionId, body.tags);
  }

  @Delete(':ruleId/versions/:versionId/tags/:tag')
  @ApiOperation({ summary: 'Remove a tag from a version' })
  async removeTag(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
    @Param('versionId') versionId: string,
    @Param('tag') tag: string,
  ) {
    return this.versionsService.removeTag(ruleId, versionId, decodeURIComponent(tag));
  }

  @Post(':ruleId/versions/:versionId/favorite')
  @ApiOperation({ summary: 'Toggle favorite status of a version' })
  async toggleFavorite(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.versionsService.toggleFavorite(ruleId, versionId);
  }

  @Post(':ruleId/versions/batch-delete')
  @ApiOperation({ summary: 'Batch delete versions (skips favorites)' })
  async batchDeleteVersions(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: { versionIds: string[] },
  ) {
    return this.versionsService.batchDeleteVersions(ruleId, body.versionIds);
  }

  @Post(':ruleId/versions/batch-export')
  @ApiOperation({ summary: 'Batch export versions as JSON' })
  async batchExportVersions(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: { versionIds: string[] },
    @Res() res: Response,
  ) {
    const data = await this.versionsService.batchExportVersions(ruleId, body.versionIds);
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${data.ruleName}_versions_${timestamp}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(data, null, 2));
  }

  @Post(':ruleId/versions/batch-tag')
  @ApiOperation({ summary: 'Batch add tags to versions' })
  async batchAddTags(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: { versionIds: string[]; tags: string[] },
  ) {
    return this.versionsService.batchAddTags(ruleId, body.versionIds, body.tags);
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
}

@ApiTags('rule-versions')
@ApiBearerAuth()
@Controller('api/v1/rule-versions')
export class RuleBatchVersionsController {
  constructor(private readonly versionsService: RuleVersionsService) {}

  @Post('batch-rollback')
  @ApiOperation({ summary: 'Batch rollback rules to previous versions' })
  async batchRollback(
    @CurrentTenant() tenantId: string,
    @Body() body: { ruleIds: string[]; rolledBackBy: string },
  ) {
    return this.versionsService.batchRollback(
      tenantId,
      body.ruleIds,
      body.rolledBackBy || 'system',
    );
  }
}
