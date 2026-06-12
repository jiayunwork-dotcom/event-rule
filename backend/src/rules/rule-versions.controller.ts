import { Controller, Get, Post, Query, Param, Body } from '@nestjs/common';
import { RuleVersionsService } from './rule-versions.service';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('rule-versions')
@ApiBearerAuth()
@Controller('api/v1/rules/:ruleId/versions')
export class RuleVersionsController {
  constructor(private readonly versionsService: RuleVersionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get version history for a rule' })
  async getVersions(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('createdBy') createdBy?: string,
  ) {
    return this.versionsService.getVersions(ruleId, {
      startTime,
      endTime,
      createdBy,
    });
  }

  @Get('creators')
  @ApiOperation({ summary: 'Get distinct version creators for a rule' })
  async getVersionCreators(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.versionsService.getVersionCreators(ruleId);
  }

  @Get(':versionId')
  @ApiOperation({ summary: 'Get a specific version' })
  async getVersion(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.versionsService.getVersion(ruleId, versionId);
  }

  @Post('diff')
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

  @Post(':versionId/rollback')
  @ApiOperation({ summary: 'Rollback rule to a specific version' })
  async rollback(
    @CurrentTenant() tenantId: string,
    @Param('ruleId') ruleId: string,
    @Param('versionId') versionId: string,
    @Body() body: { rolledBackBy: string },
  ) {
    return this.versionsService.rollback(
      tenantId,
      ruleId,
      versionId,
      body.rolledBackBy || 'system',
    );
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

@ApiTags('rule-versions')
@ApiBearerAuth()
@Controller('api/v1/rules')
export class RuleLockController {
  constructor(private readonly versionsService: RuleVersionsService) {}

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
}
