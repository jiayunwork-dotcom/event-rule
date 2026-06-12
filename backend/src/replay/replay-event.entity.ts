import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { ReplaySession } from './replay-session.entity';
import { ReplayResult } from './replay-result.entity';

@Entity('replay_events')
export class ReplayEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => ReplaySession, (session) => session.events)
  @JoinColumn({ name: 'session_id' })
  session: ReplaySession;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'event_source', length: 100 })
  eventSource: string;

  @Column({ name: 'event_payload', type: 'jsonb' })
  eventPayload: any;

  @Column({ name: 'original_matched_rule_ids', type: 'uuid', array: true, default: () => 'ARRAY[]::UUID[]' })
  originalMatchedRuleIds: string[];

  @Column({ name: 'original_timestamp', type: 'timestamp' })
  originalTimestamp: Date;

  @CreateDateColumn({ name: 'recorded_at' })
  recordedAt: Date;

  @OneToMany(() => ReplayResult, (result) => result.event)
  replayResults: ReplayResult[];
}
