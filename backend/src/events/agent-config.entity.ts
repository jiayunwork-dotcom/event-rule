import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

@Entity('agent_configs')
export class AgentConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 255 })
  host: string;

  @Column({ name: 'cpu_enabled', default: true })
  cpuEnabled: boolean;

  @Column({ name: 'memory_enabled', default: true })
  memoryEnabled: boolean;

  @Column({ name: 'disk_enabled', default: true })
  diskEnabled: boolean;

  @Column({ name: 'network_enabled', default: true })
  networkEnabled: boolean;

  @Column({ default: 60 })
  interval: number;

  @Column({ type: 'jsonb', nullable: true })
  tags: Record<string, string>;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'last_heartbeat', nullable: true })
  lastHeartbeat: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
