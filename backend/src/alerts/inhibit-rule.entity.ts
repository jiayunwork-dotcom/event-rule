import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

@Entity('inhibit_rules')
export class InhibitRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'source_matchers', type: 'jsonb' })
  sourceMatchers: Array<{ label: string; value: string; type: 'eq' | 'regex' }>;

  @Column({ name: 'target_matchers', type: 'jsonb' })
  targetMatchers: Array<{ label: string; value: string; type: 'eq' | 'regex' }>;

  @Column({ name: 'equal_labels', type: 'simple-array', default: '' })
  equalLabels: string[];

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
