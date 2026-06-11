import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
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

  @Post('parse-dsl')
  @ApiOperation({ summary: 'Parse DSL and return AST' })
  async parseDsl(@Body() body: { dsl: string }) {
    return this.rulesService.parseDsl(body.dsl);
  }
}
