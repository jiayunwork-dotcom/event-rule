import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './tenant.entity';
import { v4 as uuidv4 } from 'uuid';

export interface CreateTenantDto {
  name: string;
  timezone?: string;
  maxRules?: number;
  maxEventsPerSecond?: number;
  maxActiveAlerts?: number;
}

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async findAll(): Promise<Tenant[]> {
    return this.tenantRepository.find({ where: { isActive: true } });
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { id, isActive: true } });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }
    return tenant;
  }

  async findByApiKey(apiKey: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { apiKey, isActive: true } });
  }

  async create(createTenantDto: CreateTenantDto): Promise<Tenant> {
    const tenant = this.tenantRepository.create({
      ...createTenantDto,
      apiKey: uuidv4(),
      webhookSecret: uuidv4(),
    });
    return this.tenantRepository.save(tenant);
  }

  async update(id: string, updateTenantDto: Partial<CreateTenantDto>): Promise<Tenant> {
    const tenant = await this.findOne(id);
    Object.assign(tenant, updateTenantDto);
    return this.tenantRepository.save(tenant);
  }

  async remove(id: string): Promise<void> {
    const tenant = await this.findOne(id);
    tenant.isActive = false;
    await this.tenantRepository.save(tenant);
  }

  async regenerateApiKey(id: string): Promise<Tenant> {
    const tenant = await this.findOne(id);
    tenant.apiKey = uuidv4();
    tenant.webhookSecret = uuidv4();
    return this.tenantRepository.save(tenant);
  }

  async checkQuota(tenantId: string, currentRules: number, currentEvents: number, currentAlerts: number): Promise<{ exceeded: boolean; message?: string }> {
    const tenant = await this.findOne(tenantId);
    
    if (currentRules > tenant.maxRules) {
      return { exceeded: true, message: `Maximum rules (${tenant.maxRules}) exceeded` };
    }
    if (currentEvents > tenant.maxEventsPerSecond) {
      return { exceeded: true, message: `Maximum events per second (${tenant.maxEventsPerSecond}) exceeded` };
    }
    if (currentAlerts > tenant.maxActiveAlerts) {
      return { exceeded: true, message: `Maximum active alerts (${tenant.maxActiveAlerts}) exceeded` };
    }
    
    return { exceeded: false };
  }
}
