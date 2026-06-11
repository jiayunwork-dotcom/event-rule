import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'api_key', unique: true })
  apiKey: string;

  @Column({ name: 'webhook_secret' })
  webhookSecret: string;

  @Column({ length: 50, default: 'Asia/Shanghai' })
  timezone: string;

  @Column({ name: 'max_rules', default: 100 })
  maxRules: number;

  @Column({ name: 'max_events_per_second', default: 1000 })
  maxEventsPerSecond: number;

  @Column({ name: 'max_active_alerts', default: 500 })
  maxActiveAlerts: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
