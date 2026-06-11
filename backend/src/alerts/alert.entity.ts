import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Rule } from '../rules/rule.entity';
import { User } from '../users/user.entity';
import { AlertSeverity, AlertStatus } from '../rules/rule.entity';

@Entity('alerts')
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ length: 64 })
  fingerprint: string;

  @Column({ length: 200 })
  name: string;

  @Column({
    type: 'enum',
    enum: AlertSeverity,
  })
  severity: AlertSeverity;

  @Column({
    type: 'enum',
    enum: AlertStatus,
    default: AlertStatus.PENDING,
  })
  status: AlertStatus;

  @Column({ type: 'jsonb', nullable: true })
  labels: Record<string, string>;

  @Column({ type: 'numeric', nullable: true })
  value: number;

  @Column({ default: 1 })
  count: number;

  @Column({ name: 'first_triggered_at', default: () => 'CURRENT_TIMESTAMP' })
  firstTriggeredAt: Date;

  @Column({ name: 'last_triggered_at', default: () => 'CURRENT_TIMESTAMP' })
  lastTriggeredAt: Date;

  @Column({ name: 'acknowledged_at', nullable: true })
  acknowledgedAt: Date;

  @Column({ name: 'acknowledged_by', nullable: true })
  acknowledgedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'acknowledged_by' })
  acknowledgedByUser: User;

  @Column({ name: 'processing_at', nullable: true })
  processingAt: Date;

  @Column({ name: 'processing_by', nullable: true })
  processingBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'processing_by' })
  processingByUser: User;

  @Column({ name: 'resolved_at', nullable: true })
  resolvedAt: Date;

  @Column({ name: 'resolved_by', nullable: true })
  resolvedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolved_by' })
  resolvedByUser: User;

  @Column({ name: 'resolved_reason', type: 'text', nullable: true })
  resolvedReason: string;

  @Column({ name: 'escalation_level', default: 0 })
  escalationLevel: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
