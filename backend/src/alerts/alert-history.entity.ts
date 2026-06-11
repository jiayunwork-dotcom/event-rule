import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Alert } from '../alerts/alert.entity';
import { User } from '../users/user.entity';
import { AlertStatus } from '../rules/rule.entity';

@Entity('alert_history')
export class AlertHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'alert_id' })
  alertId: string;

  @ManyToOne(() => Alert)
  @JoinColumn({ name: 'alert_id' })
  alert: Alert;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'old_status', type: 'enum', enum: AlertStatus, nullable: true })
  oldStatus: AlertStatus;

  @Column({ name: 'new_status', type: 'enum', enum: AlertStatus })
  newStatus: AlertStatus;

  @Column({ name: 'operator_id', nullable: true })
  operatorId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'operator_id' })
  operator: User;

  @Column({ type: 'text', nullable: true })
  remark: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
