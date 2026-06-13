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

  @Column({ name: 'change_summary', type: 'jsonb', default: '[]' })
  changeSummary: any;

  @Column({ name: 'created_by', length: 100, nullable: true })
  createdBy: string;

  @Column({ name: 'tags', type: 'varchar', array: true, default: () => 'ARRAY[]::VARCHAR[]' })
  tags: string[];

  @Column({ name: 'is_favorite', default: false })
  isFavorite: boolean;

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

export interface ChangeSummaryItem {
  field: string;
  label: string;
  oldValue?: any;
  newValue?: any;
  displayText: string;
  isStatusChange?: boolean;
  statusChangeType?: 'enabled' | 'disabled';
}

export interface ConditionTreeNode {
  id: string;
  type: 'operator' | 'condition';
  operator?: 'AND' | 'OR';
  condition?: any;
  children?: ConditionTreeNode[];
  diffType?: 'added' | 'removed' | 'modified' | 'unchanged';
  oldCondition?: any;
  newCondition?: any;
}

export interface ConditionTreeDiffResult {
  leftTree: ConditionTreeNode;
  rightTree: ConditionTreeNode;
  mappings: Array<{ leftId: string; rightId: string; type: 'unchanged' | 'modified' | 'structural_change' }>;
}
