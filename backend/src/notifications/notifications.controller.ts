import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { NotificationsService, CreateChannelDto, CreatePolicyDto } from './notifications.service';
import { NotificationChannel, ChannelType } from './notification-channel.entity';
import { Notification, NotificationStatus } from './notification.entity';
import { DeadLetter } from './dead-letter.entity';
import { NotificationPolicy } from '../schedules/schedule.entity';
import { CurrentTenant, CurrentUser, TenantContext } from '../common/decorators/tenant.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('api/v1')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('channels')
  @ApiOperation({ summary: 'Get all notification channels' })
  async getChannels(@CurrentTenant() tenantId: string): Promise<NotificationChannel[]> {
    return this.notificationsService.getChannels(tenantId);
  }

  @Post('channels')
  @ApiOperation({ summary: 'Create notification channel' })
  async createChannel(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateChannelDto,
  ): Promise<NotificationChannel> {
    return this.notificationsService.createChannel(tenantId, dto);
  }

  @Put('channels/:id')
  @ApiOperation({ summary: 'Update notification channel' })
  async updateChannel(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreateChannelDto>,
  ): Promise<NotificationChannel> {
    return this.notificationsService.updateChannel(tenantId, id, dto);
  }

  @Delete('channels/:id')
  @ApiOperation({ summary: 'Delete notification channel' })
  async deleteChannel(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.notificationsService.deleteChannel(tenantId, id);
  }

  @Post('channels/:id/enable')
  @ApiOperation({ summary: 'Enable channel' })
  async enableChannel(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<NotificationChannel> {
    return this.notificationsService.toggleChannel(tenantId, id, true);
  }

  @Post('channels/:id/disable')
  @ApiOperation({ summary: 'Disable channel' })
  async disableChannel(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<NotificationChannel> {
    return this.notificationsService.toggleChannel(tenantId, id, false);
  }

  @Get('policies')
  @ApiOperation({ summary: 'Get all notification policies' })
  async getPolicies(@CurrentTenant() tenantId: string): Promise<NotificationPolicy[]> {
    return this.notificationsService.getPolicies(tenantId);
  }

  @Post('policies')
  @ApiOperation({ summary: 'Create notification policy' })
  async createPolicy(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreatePolicyDto,
  ): Promise<NotificationPolicy> {
    return this.notificationsService.createPolicy(tenantId, dto);
  }

  @Put('policies/:id')
  @ApiOperation({ summary: 'Update notification policy' })
  async updatePolicy(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreatePolicyDto>,
  ): Promise<NotificationPolicy> {
    return this.notificationsService.updatePolicy(tenantId, id, dto);
  }

  @Delete('policies/:id')
  @ApiOperation({ summary: 'Delete notification policy' })
  async deletePolicy(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.notificationsService.deletePolicy(tenantId, id);
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Get notification history' })
  async getNotificationHistory(
    @CurrentTenant() tenantId: string,
    @Query('channelType') channelType?: ChannelType,
    @Query('status') status?: NotificationStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<Notification[]> {
    return this.notificationsService.getNotificationHistory(tenantId, {
      channelType,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('dead-letters')
  @ApiOperation({ summary: 'Get dead letter queue' })
  async getDeadLetters(@CurrentTenant() tenantId: string): Promise<DeadLetter[]> {
    return this.notificationsService.getDeadLetters(tenantId);
  }
}
