import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
  FATAL = 'fatal',
}

export enum AlertStatus {
  PENDING = 'pending',
  ACKNOWLEDGED = 'acknowledged',
  PROCESSING = 'processing',
  RESOLVED = 'resolved',
}

export enum ConditionType {
  SINGLE_THRESHOLD = 'single_threshold',
  MULTI_CONDITION = 'multi_condition',
  WINDOW_AGGREGATE = 'window_aggregate',
  FREQUENCY = 'frequency',
  LABEL_MATCH = 'label_match',
  SEQUENCE_PATTERN = 'sequence_pattern',
  DSL = 'dsl',
}

@Entity('rules')
export class Rule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: AlertSeverity,
    default: AlertSeverity.WARNING,
  })
  severity: AlertSeverity;

  @Column({
    name: 'condition_type',
    type: 'enum',
    enum: ConditionType,
    default: ConditionType.SINGLE_THRESHOLD,
  })
  conditionType: ConditionType;

  @Column({ type: 'jsonb' })
  conditions: any;

  @Column({ type: 'text', nullable: true })
  dsl: string;

  @Column({ default: 0 })
  priority: number;

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean;

  @Column({ name: 'window_size', default: 300 })
  windowSize: number;

  @Column({ name: 'group_by_labels', type: 'varchar', array: true, default: () => 'ARRAY[]::VARCHAR[]' })
  groupByLabels: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
