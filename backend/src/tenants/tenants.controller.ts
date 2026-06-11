import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { TenantsService, CreateTenantDto } from './tenants.service';
import { Tenant } from './tenant.entity';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('api/v1/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all tenants' })
  async findAll(): Promise<Tenant[]> {
    return this.tenantsService.findAll();
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current tenant info' })
  async getCurrentTenant(@CurrentTenant() tenantId: string): Promise<Tenant> {
    return this.tenantsService.findOne(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tenant by ID' })
  async findOne(@Param('id') id: string): Promise<Tenant> {
    return this.tenantsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new tenant' })
  async create(@Body() createTenantDto: CreateTenantDto): Promise<Tenant> {
    return this.tenantsService.create(createTenantDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update tenant' })
  async update(@Param('id') id: string, @Body() updateTenantDto: Partial<CreateTenantDto>): Promise<Tenant> {
    return this.tenantsService.update(id, updateTenantDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete tenant' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.tenantsService.remove(id);
  }

  @Post(':id/regenerate-api-key')
  @ApiOperation({ summary: 'Regenerate API key' })
  async regenerateApiKey(@Param('id') id: string): Promise<Tenant> {
    return this.tenantsService.regenerateApiKey(id);
  }
}
