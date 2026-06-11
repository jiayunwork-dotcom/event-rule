import { Controller, Post, Body, Headers, Get, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { EventsService, WebhookEventDto, PrometheusWebhookDto, AgentMetricsDto } from './events.service';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { EventSource } from './event-source.entity';
import { AgentConfig } from './agent-config.entity';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('events')
@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post('webhook/:apiKey')
  @ApiOperation({ summary: 'Receive events via webhook (no auth required, uses API key in URL)' })
  async receiveWebhook(
    @Param('apiKey') apiKey: string,
    @Body() eventDto: WebhookEventDto,
    @Headers('x-signature') signature?: string,
  ): Promise<{ eventId: string }> {
    const eventId = await this.eventsService.receiveWebhookEvent(
      apiKey,
      eventDto,
      signature,
    );
    return { eventId };
  }

  @Post('webhook/:apiKey/prometheus')
  @ApiOperation({ summary: 'Receive Prometheus AlertManager alerts' })
  async receivePrometheus(
    @Param('apiKey') apiKey: string,
    @Body() dto: PrometheusWebhookDto,
  ): Promise<{ eventIds: string[] }> {
    const eventIds = await this.eventsService.receivePrometheusAlert(
      apiKey,
      dto,
    );
    return { eventIds };
  }

  @ApiBearerAuth()
  @Get('api/v1/event-sources')
  @ApiOperation({ summary: 'Get all event sources' })
  async getEventSources(@CurrentTenant() tenantId: string): Promise<EventSource[]> {
    return this.eventsService.getEventSources(tenantId);
  }

  @ApiBearerAuth()
  @Post('api/v1/event-sources')
  @ApiOperation({ summary: 'Create event source' })
  async createEventSource(
    @CurrentTenant() tenantId: string,
    @Body() data: Partial<EventSource>,
  ): Promise<EventSource> {
    return this.eventsService.createEventSource(tenantId, data);
  }

  @ApiBearerAuth()
  @Get('api/v1/agent-configs')
  @ApiOperation({ summary: 'Get all agent configurations' })
  async getAgentConfigs(@CurrentTenant() tenantId: string): Promise<AgentConfig[]> {
    return this.eventsService.getAgentConfigs(tenantId);
  }

  @ApiBearerAuth()
  @Post('api/v1/agent-configs')
  @ApiOperation({ summary: 'Create agent configuration' })
  async createAgentConfig(
    @CurrentTenant() tenantId: string,
    @Body() data: Partial<AgentConfig>,
  ): Promise<AgentConfig> {
    return this.eventsService.createAgentConfig(tenantId, data);
  }

  @ApiBearerAuth()
  @Put('api/v1/agent-configs/:id')
  @ApiOperation({ summary: 'Update agent configuration' })
  async updateAgentConfig(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() data: Partial<AgentConfig>,
  ): Promise<AgentConfig> {
    return this.eventsService.updateAgentConfig(tenantId, id, data);
  }

  @ApiBearerAuth()
  @Delete('api/v1/agent-configs/:id')
  @ApiOperation({ summary: 'Delete agent configuration' })
  async deleteAgentConfig(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.eventsService.deleteAgentConfig(tenantId, id);
  }

  @Post('api/v1/agent/:id/metrics')
  @ApiOperation({ summary: 'Agent metrics endpoint' })
  async receiveAgentMetrics(
    @CurrentTenant() tenantId: string,
    @Param('id') agentId: string,
    @Body() dto: AgentMetricsDto,
  ): Promise<{ eventIds: string[] }> {
    const eventIds = await this.eventsService.receiveAgentMetrics(tenantId, agentId, dto);
    return { eventIds };
  }

  @ApiBearerAuth()
  @Get('api/v1/webhook/info')
  @ApiOperation({ summary: 'Get webhook URL and secret' })
  async getWebhookInfo(@CurrentTenant() tenantId: string): Promise<{ url: string; secret: string }> {
    return this.eventsService.getWebhookUrl(tenantId);
  }
}
