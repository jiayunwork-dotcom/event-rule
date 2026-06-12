import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Rule } from './rule.entity';

@Entity('rule_versions')
export class RuleVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'rule_id' })
  ruleId: string;

  @ManyToOne(() => Rule, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id' })
  rule: Rule;

  @Column({ name: 'version_number' })
  versionNumber: number;

  @Column({ type: 'jsonb' })
  snapshot: any;

  @Column({ name: 'change_summary', type: 'text', nullable: true })
  changeSummary: string;

  @Column({ name: 'created_by', length: 100, nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('rule_locks')
export class RuleLock {
  @PrimaryColumn({ name: 'rule_id' })
  ruleId: string;

  @ManyToOne(() => Rule, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id' })
  rule: Rule;

  @Column({ name: 'locked_by', length: 100 })
  lockedBy: string;

  @CreateDateColumn({ name: 'locked_at' })
  lockedAt: Date;
}
