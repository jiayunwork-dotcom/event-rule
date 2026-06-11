import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Alert } from '../alerts/alert.entity';
import { NotificationChannel, ChannelType } from './notification-channel.entity';

export enum NotificationStatus {
  PENDING = 'pending',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'alert_id', nullable: true })
  alertId: string;

  @ManyToOne(() => Alert, { nullable: true })
  @JoinColumn({ name: 'alert_id' })
  alert: Alert;

  @Column({ name: 'channel_id', nullable: true })
  channelId: string;

  @ManyToOne(() => NotificationChannel, { nullable: true })
  @JoinColumn({ name: 'channel_id' })
  channel: NotificationChannel;

  @Column({ name: 'channel_type', type: 'enum', enum: ChannelType })
  channelType: ChannelType;

  @Column({ length: 255, nullable: true })
  recipient: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.PENDING,
  })
  status: NotificationStatus;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', default: 3 })
  maxRetries: number;

  @Column({ name: 'next_retry_at', type: 'timestamp', nullable: true })
  nextRetryAt: Date;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
