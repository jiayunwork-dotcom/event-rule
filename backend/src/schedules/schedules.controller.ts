import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { SchedulesService, CreateScheduleDto, CurrentOnCall } from './schedules.service';
import { Schedule } from './schedule.entity';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('schedules')
@ApiBearerAuth()
@Controller('api/v1/schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all schedules' })
  async findAll(@CurrentTenant() tenantId: string): Promise<Schedule[]> {
    return this.schedulesService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get schedule by ID' })
  async findOne(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<Schedule> {
    return this.schedulesService.findOne(tenantId, id);
  }

  @Get(':id/oncall')
  @ApiOperation({ summary: 'Get current on-call users for schedule' })
  async getCurrentOnCall(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<CurrentOnCall> {
    return this.schedulesService.getCurrentOnCall(tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new schedule' })
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateScheduleDto,
  ): Promise<Schedule> {
    return this.schedulesService.create(tenantId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update schedule' })
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreateScheduleDto>,
  ): Promise<Schedule> {
    return this.schedulesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete schedule' })
  async remove(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.schedulesService.remove(tenantId, id);
  }

  @Post(':id/enable')
  @ApiOperation({ summary: 'Enable schedule' })
  async enable(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<Schedule> {
    return this.schedulesService.toggleEnabled(tenantId, id, true);
  }

  @Post(':id/disable')
  @ApiOperation({ summary: 'Disable schedule' })
  async disable(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<Schedule> {
    return this.schedulesService.toggleEnabled(tenantId, id, false);
  }
}
