import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { AlertsService, UpdateAlertStatusDto, CreateSilenceDto, CreateInhibitRuleDto } from './alerts.service';
import { Alert } from './alert.entity';
import { AlertHistory } from './alert-history.entity';
import { AlertStatus, AlertSeverity } from '../rules/rule.entity';
import { Silence } from './silence.entity';
import { InhibitRule } from './inhibit-rule.entity';
import { CurrentUser, TenantContext } from '../common/decorators/tenant.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

@ApiTags('alerts')
@ApiBearerAuth()
@Controller('api/v1/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'Get alerts with filters' })
  @ApiQuery({ name: 'status', required: false, isArray: true })
  @ApiQuery({ name: 'severity', required: false, isArray: true })
  async findAll(
    @CurrentUser() ctx: TenantContext,
    @Query('status') status?: string[],
    @Query('severity') severity?: string[],
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<Alert[]> {
    return this.alertsService.findAll(ctx.tenantId, {
      status: status as AlertStatus[],
      severity: severity as AlertSeverity[],
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('grouped')
  @ApiOperation({ summary: 'Get alerts grouped by fingerprint' })
  @ApiQuery({ name: 'status', required: false, isArray: true })
  @ApiQuery({ name: 'severity', required: false, isArray: true })
  async findAllGrouped(
    @CurrentUser() ctx: TenantContext,
    @Query('status') status?: string[],
    @Query('severity') severity?: string[],
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.alertsService.findAllGrouped(ctx.tenantId, {
      status: status as AlertStatus[],
      severity: severity as AlertSeverity[],
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get alert by ID' })
  async findOne(
    @CurrentUser() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<Alert> {
    return this.alertsService.findOne(ctx.tenantId, id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Get alert history' })
  async getHistory(
    @CurrentUser() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<AlertHistory[]> {
    return this.alertsService.getAlertHistory(ctx.tenantId, id);
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Update alert status' })
  async updateStatus(
    @CurrentUser() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateAlertStatusDto,
  ): Promise<Alert> {
    return this.alertsService.updateAlertStatus(ctx.tenantId, id, dto, ctx.userId || null);
  }

  @Post(':id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge alert' })
  async acknowledge(
    @CurrentUser() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body?: { remark?: string },
  ): Promise<Alert> {
    return this.alertsService.updateAlertStatus(
      ctx.tenantId, 
      id, 
      { status: AlertStatus.ACKNOWLEDGED, remark: body?.remark },
      ctx.userId || null
    );
  }

  @Post(':id/process')
  @ApiOperation({ summary: 'Start processing alert' })
  async process(
    @CurrentUser() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body?: { remark?: string },
  ): Promise<Alert> {
    return this.alertsService.updateAlertStatus(
      ctx.tenantId, 
      id, 
      { status: AlertStatus.PROCESSING, remark: body?.remark },
      ctx.userId || null
    );
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Resolve alert' })
  async resolve(
    @CurrentUser() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body?: { remark?: string; resolvedReason?: string },
  ): Promise<Alert> {
    return this.alertsService.updateAlertStatus(
      ctx.tenantId, 
      id, 
      { 
        status: AlertStatus.RESOLVED, 
        remark: body?.remark,
        resolvedReason: body?.resolvedReason 
      },
      ctx.userId || null
    );
  }

  @Post('batch/acknowledge')
  @ApiOperation({ summary: 'Batch acknowledge alerts (pending only)' })
  async batchAcknowledge(
    @CurrentUser() ctx: TenantContext,
    @Body() body: { ids: string[] },
  ) {
    return this.alertsService.batchAcknowledge(ctx.tenantId, body.ids, ctx.userId || null);
  }

  @Post('batch/resolve')
  @ApiOperation({ summary: 'Batch resolve alerts (processing only)' })
  async batchResolve(
    @CurrentUser() ctx: TenantContext,
    @Body() body: { ids: string[]; resolvedReason: string },
  ) {
    return this.alertsService.batchResolve(ctx.tenantId, body.ids, body.resolvedReason, ctx.userId || null);
  }

  @Get('silences')
  @ApiOperation({ summary: 'Get all silences' })
  async getSilences(@CurrentUser() ctx: TenantContext): Promise<Silence[]> {
    return this.alertsService.getSilences(ctx.tenantId);
  }

  @Post('silences')
  @ApiOperation({ summary: 'Create silence' })
  async createSilence(
    @CurrentUser() ctx: TenantContext,
    @Body() dto: CreateSilenceDto,
  ): Promise<Silence> {
    return this.alertsService.createSilence(ctx.tenantId, ctx.userId!, dto);
  }

  @Delete('silences/:id')
  @ApiOperation({ summary: 'Delete silence' })
  async deleteSilence(
    @CurrentUser() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<void> {
    return this.alertsService.deleteSilence(ctx.tenantId, id);
  }

  @Get('inhibit-rules')
  @ApiOperation({ summary: 'Get all inhibit rules' })
  async getInhibitRules(@CurrentUser() ctx: TenantContext): Promise<InhibitRule[]> {
    return this.alertsService.getInhibitRules(ctx.tenantId);
  }

  @Post('inhibit-rules')
  @ApiOperation({ summary: 'Create inhibit rule' })
  async createInhibitRule(
    @CurrentUser() ctx: TenantContext,
    @Body() dto: CreateInhibitRuleDto,
  ): Promise<InhibitRule> {
    return this.alertsService.createInhibitRule(ctx.tenantId, dto);
  }

  @Delete('inhibit-rules/:id')
  @ApiOperation({ summary: 'Delete inhibit rule' })
  async deleteInhibitRule(
    @CurrentUser() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<void> {
    return this.alertsService.deleteInhibitRule(ctx.tenantId, id);
  }

  @Post('inhibit-rules/:id/enable')
  @ApiOperation({ summary: 'Enable inhibit rule' })
  async enableInhibitRule(
    @CurrentUser() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<InhibitRule> {
    return this.alertsService.toggleInhibitRule(ctx.tenantId, id, true);
  }

  @Post('inhibit-rules/:id/disable')
  @ApiOperation({ summary: 'Disable inhibit rule' })
  async disableInhibitRule(
    @CurrentUser() ctx: TenantContext,
    @Param('id') id: string,
  ): Promise<InhibitRule> {
    return this.alertsService.toggleInhibitRule(ctx.tenantId, id, false);
  }
}
