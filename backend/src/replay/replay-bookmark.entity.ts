import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { ReplaySession } from './replay-session.entity';

@Entity('replay_bookmarks')
export class ReplayBookmark {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => ReplaySession)
  @JoinColumn({ name: 'session_id' })
  session: ReplaySession;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ length: 200 })
  name: string;

  @Column({ name: 'event_index' })
  eventIndex: number;

  @Column({ name: 'progress_snapshot', type: 'jsonb' })
  progressSnapshot: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
