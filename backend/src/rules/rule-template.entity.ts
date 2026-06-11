import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { AlertSeverity, ConditionType } from './rule.entity';

export enum TemplateType {
  SYSTEM = 'system',
  CUSTOM = 'custom',
}

@Entity('rule_templates')
export class RuleTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({
    type: 'enum',
    enum: TemplateType,
    default: TemplateType.CUSTOM,
  })
  type: TemplateType;

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

  @Column({ name: 'window_size', default: 300 })
  windowSize: number;

  @Column({ name: 'group_by_labels', type: 'varchar', array: true, default: () => 'ARRAY[]::VARCHAR[]' })
  groupByLabels: string[];

  @Column({ name: 'scene_tags', type: 'varchar', array: true, default: () => 'ARRAY[]::VARCHAR[]' })
  sceneTags: string[];

  @Column({ name: 'suggested_threshold', type: 'text', nullable: true })
  suggestedThreshold: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
