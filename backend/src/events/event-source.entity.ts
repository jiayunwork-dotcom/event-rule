import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

export enum EventSourceType {
  WEBHOOK = 'webhook',
  AGENT = 'agent',
  PROMETHEUS = 'prometheus',
}

@Entity('event_sources')
export class EventSource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({
    type: 'enum',
    enum: EventSourceType,
  })
  type: EventSourceType;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'jsonb', nullable: true })
  config: any;

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
