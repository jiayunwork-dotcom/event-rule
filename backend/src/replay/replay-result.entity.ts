import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { ReplaySession } from './replay-session.entity';
import { ReplayEvent } from './replay-event.entity';

@Entity('replay_results')
export class ReplayResult {
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

  @Column({ name: 'event_id' })
  eventId: string;

  @ManyToOne(() => ReplayEvent, (event) => event.replayResults)
  @JoinColumn({ name: 'event_id' })
  event: ReplayEvent;

  @Column({ name: 'rule_id', nullable: true })
  ruleId: string;

  @Column({ default: false })
  matched: boolean;

  @Column({ name: 'match_detail', type: 'jsonb', nullable: true })
  matchDetail: any;

  @CreateDateColumn({ name: 'replayed_at' })
  replayedAt: Date;
}
