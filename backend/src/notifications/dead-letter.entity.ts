import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Notification } from './notification.entity';

@Entity('dead_letter_queue')
export class DeadLetter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'notification_id', nullable: true })
  notificationId: string;

  @ManyToOne(() => Notification, { nullable: true })
  @JoinColumn({ name: 'notification_id' })
  notification: Notification;

  @Column({ name: 'original_data', type: 'jsonb', nullable: true })
  originalData: any;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
