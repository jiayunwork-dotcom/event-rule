import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService, DashboardStats, RuleHitStats, AlertTimeline } from './dashboard.service';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('api/v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getStats(
    @CurrentTenant() tenantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<DashboardStats> {
    return this.dashboardService.getStats(
      tenantId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('rule-hits')
  @ApiOperation({ summary: 'Get rule hit statistics with trend' })
  @ApiQuery({ name: 'interval', enum: ['hour', 'day'] })
  async getRuleHitStats(
    @CurrentTenant() tenantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('interval') interval: 'hour' | 'day' = 'hour',
  ): Promise<RuleHitStats[]> {
    return this.dashboardService.getRuleHitStats(
      tenantId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      interval,
    );
  }

  @Get('alert-timeline')
  @ApiOperation({ summary: 'Get alert timeline' })
  async getAlertTimeline(
    @CurrentTenant() tenantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: number,
  ): Promise<AlertTimeline[]> {
    return this.dashboardService.getAlertTimeline(
      tenantId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      limit,
    );
  }
}
