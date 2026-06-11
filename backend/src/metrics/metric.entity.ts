import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Rule } from '../rules/rule.entity';

@Entity('metrics')
export class Metric {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'timestamp' })
  timestamp: Date;

  @Column({ name: 'metric_name', length: 100 })
  metricName: string;

  @Column({ type: 'numeric' })
  value: number;

  @Column({ type: 'jsonb', nullable: true })
  labels: Record<string, string>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('rule_hits')
export class RuleHit {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'rule_id', nullable: true })
  ruleId: string;

  @ManyToOne(() => Rule, { nullable: true })
  @JoinColumn({ name: 'rule_id' })
  rule: Rule;

  @Column({ type: 'timestamp' })
  timestamp: Date;

  @Column({ default: 1 })
  count: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
