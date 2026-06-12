import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { ReplayEvent } from './replay-event.entity';

export enum ReplaySessionStatus {
  RECORDING = 'recording',
  STOPPED = 'stopped',
  ARCHIVED = 'archived',
}

@Entity('replay_sessions')
export class ReplaySession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'start_time', type: 'timestamp', nullable: true })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamp', nullable: true })
  endTime: Date;

  @Column({
    type: 'varchar',
    length: 20,
    default: ReplaySessionStatus.RECORDING,
  })
  status: ReplaySessionStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => ReplayEvent, (event) => event.session)
  events: ReplayEvent[];
}
