import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { AlertSeverity } from '../rules/rule.entity';

export enum ScheduleType {
  FIXED = 'fixed',
  ROTATION = 'rotation',
}

@Entity('schedules')
export class Schedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ length: 100 })
  name: string;

  @Column({
    type: 'enum',
    enum: ScheduleType,
  })
  type: ScheduleType;

  @Column({ type: 'jsonb', nullable: true })
  shifts: Array<{
    day: number;
    startTime: string;
    endTime: string;
    userIds: string[];
  }>;

  @Column({ type: 'jsonb', nullable: true })
  rotations: Array<{
    period: 'daily' | 'weekly';
    userIds: string[];
    currentIndex: number;
    lastRotation: Date;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  holidays: Array<{
    date: string;
    userIds: string[];
  }>;

  @Column({ length: 50, nullable: true })
  timezone: string;

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('notification_policies')
export class NotificationPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'severity_levels', type: 'varchar', array: true, default: () => 'ARRAY[]::VARCHAR[]' })
  severityLevels: AlertSeverity[];

  @Column({ name: 'channel_ids', type: 'uuid', array: true, default: () => 'ARRAY[]::UUID[]' })
  channelIds: string[];

  @Column({ name: 'schedule_id', nullable: true })
  scheduleId: string;

  @ManyToOne(() => Schedule, { nullable: true })
  @JoinColumn({ name: 'schedule_id' })
  schedule: Schedule;

  @Column({ name: 'escalation_chain', type: 'jsonb', nullable: true })
  escalationChain: Array<{
    level: number;
    timeout: number;
    userIds: string[];
  }>;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
