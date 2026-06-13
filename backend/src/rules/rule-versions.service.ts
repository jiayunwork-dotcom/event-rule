import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan, In } from 'typeorm';
import { RuleVersion, RuleLock, ConditionTreeNode, ConditionTreeDiffResult } from './rule-version.entity';
import { Rule } from './rule.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

const MAX_VERSIONS = 50;

@Injectable()
export class RuleVersionsService {
  private readonly logger = new Logger(RuleVersionsService.name);

  constructor(
    @InjectRepository(RuleVersion)
    private readonly versionRepository: Repository<RuleVersion>,
    @InjectRepository(RuleLock)
    private readonly lockRepository: Repository<RuleLock>,
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createVersion(
    ruleId: string,
    rule: Rule,
    changeSummary: any,
    createdBy: string,
  ): Promise<RuleVersion> {
    const lastVersion = await this.versionRepository.findOne({
      where: { ruleId },
      order: { versionNumber: 'DESC' },
    });

    const versionNumber = lastVersion ? lastVersion.versionNumber + 1 : 1;

    const snapshot = {
      name: rule.name,
      description: rule.description,
      severity: rule.severity,
      conditionType: rule.conditionType,
      conditions: rule.conditions,
      dsl: rule.dsl,
      priority: rule.priority,
      isEnabled: rule.isEnabled,
      windowSize: rule.windowSize,
      groupByLabels: rule.groupByLabels,
    };

    const version = this.versionRepository.create({
      ruleId,
      versionNumber,
      snapshot,
      changeSummary,
      createdBy,
      tags: [],
      isFavorite: false,
    });

    const saved = await this.versionRepository.save(version);

    await this.pruneOldVersions(ruleId);

    return saved;
  }

  private async pruneOldVersions(ruleId: string): Promise<void> {
    const count = await this.versionRepository.count({ where: { ruleId } });
    if (count <= MAX_VERSIONS) return;

    const nonFavoriteCount = await this.versionRepository.count({
      where: { ruleId, isFavorite: false },
    });

    if (nonFavoriteCount <= MAX_VERSIONS) return;

    const deleteCount = count - MAX_VERSIONS;
    const oldestNonFavoriteVersions = await this.versionRepository.find({
      where: { ruleId, isFavorite: false },
      order: { versionNumber: 'ASC' },
      take: deleteCount,
    });

    const idsToDelete = oldestNonFavoriteVersions.map(v => v.id);
    if (idsToDelete.length > 0) {
      await this.versionRepository.delete(idsToDelete);
      this.logger.log(`Pruned ${idsToDelete.length} old non-favorite versions for rule ${ruleId}`);
    }
  }

  async getVersions(
    ruleId: string,
    options?: {
      startTime?: string;
      endTime?: string;
      createdBy?: string;
      tag?: string;
    },
  ): Promise<RuleVersion[]> {
    const qb = this.versionRepository
      .createQueryBuilder('v')
      .where('v.rule_id = :ruleId', { ruleId });

    if (options?.startTime) {
      qb.andWhere('v.created_at >= :startTime', { startTime: options.startTime });
    }
    if (options?.endTime) {
      qb.andWhere('v.created_at <= :endTime', { endTime: options.endTime });
    }
    if (options?.createdBy) {
      qb.andWhere('v.created_by = :createdBy', { createdBy: options.createdBy });
    }
    if (options?.tag) {
      qb.andWhere(':tag = ANY(v.tags)', { tag: options.tag });
    }

    qb.orderBy('v.is_favorite', 'DESC');
    qb.addOrderBy('v.version_number', 'DESC');

    return qb.getMany();
  }

  async getVersion(ruleId: string, versionId: string): Promise<RuleVersion> {
    const version = await this.versionRepository.findOne({
      where: { id: versionId, ruleId },
    });
    if (!version) {
      throw new BadRequestException('Version not found');
    }
    return version;
  }

  async addTags(ruleId: string, versionId: string, tags: string[]): Promise<RuleVersion> {
    const version = await this.getVersion(ruleId, versionId);
    const existingTags = version.tags || [];
    const newTags = [...new Set([...existingTags, ...tags])];
    version.tags = newTags;
    return this.versionRepository.save(version);
  }

  async removeTag(ruleId: string, versionId: string, tag: string): Promise<RuleVersion> {
    const version = await this.getVersion(ruleId, versionId);
    version.tags = (version.tags || []).filter(t => t !== tag);
    return this.versionRepository.save(version);
  }

  async toggleFavorite(ruleId: string, versionId: string): Promise<RuleVersion> {
    const version = await this.getVersion(ruleId, versionId);
    version.isFavorite = !version.isFavorite;
    return this.versionRepository.save(version);
  }

  async getVersionTags(ruleId: string): Promise<string[]> {
    const result = await this.versionRepository
      .createQueryBuilder('v')
      .select('DISTINCT UNNEST(v.tags)', 'tag')
      .where('v.rule_id = :ruleId', { ruleId })
      .andWhere('array_length(v.tags, 1) > 0')
      .getRawMany();
    return result.map(r => r.tag).filter(Boolean);
  }

  async diffVersions(
    ruleId: string,
    versionIdA: string,
    versionIdB: string,
  ): Promise<{
    versionA: RuleVersion;
    versionB: RuleVersion;
    diff: DiffResult;
    conditionTreeDiff: ConditionTreeDiffResult;
  }> {
    const versionA = await this.getVersion(ruleId, versionIdA);
    const versionB = await this.getVersion(ruleId, versionIdB);

    const [older, newer] =
      versionA.versionNumber < versionB.versionNumber
        ? [versionA, versionB]
        : [versionB, versionA];

    const diff = this.computeDiff(older.snapshot, newer.snapshot);
    const conditionTreeDiff = this.computeConditionTreeDiff(older.snapshot, newer.snapshot);

    return { versionA: older, versionB: newer, diff, conditionTreeDiff };
  }

  async getRollbackPreview(
    tenantId: string,
    ruleId: string,
    targetVersionId: string,
  ): Promise<{
    currentRule: Rule;
    targetVersion: RuleVersion;
    diff: DiffResult;
    conditionTreeDiff: ConditionTreeDiffResult;
  }> {
    const rule = await this.ruleRepository.findOne({
      where: { id: ruleId, tenantId },
    });
    if (!rule) {
      throw new BadRequestException('Rule not found');
    }

    const targetVersion = await this.getVersion(ruleId, targetVersionId);

    const currentSnapshot = {
      name: rule.name,
      description: rule.description,
      severity: rule.severity,
      conditionType: rule.conditionType,
      conditions: rule.conditions,
      dsl: rule.dsl,
      priority: rule.priority,
      isEnabled: rule.isEnabled,
      windowSize: rule.windowSize,
      groupByLabels: rule.groupByLabels,
    };

    const diff = this.computeDiff(targetVersion.snapshot, currentSnapshot);
    const conditionTreeDiff = this.computeConditionTreeDiff(targetVersion.snapshot, currentSnapshot);

    return { currentRule: rule, targetVersion, diff, conditionTreeDiff };
  }

  private computeDiff(snapshotA: any, snapshotB: any): DiffResult {
    const result: DiffResult = {
      added: 0,
      removed: 0,
      modified: 0,
      fields: [],
    };

    const scalarFields = [
      'name',
      'description',
      'severity',
      'conditionType',
      'dsl',
      'priority',
      'isEnabled',
      'windowSize',
    ] as const;

    for (const field of scalarFields) {
      const oldVal = snapshotA[field];
      const newVal = snapshotB[field];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        result.modified++;
        result.fields.push({
          field,
          type: 'modified',
          oldValue: oldVal,
          newValue: newVal,
        });
      }
    }

    const oldLabels = snapshotA.groupByLabels || [];
    const newLabels = snapshotB.groupByLabels || [];
    const labelsDiff = this.diffArray(oldLabels, newLabels, String);
    result.added += labelsDiff.added.length;
    result.removed += labelsDiff.removed.length;
    if (labelsDiff.added.length > 0) {
      result.fields.push({
        field: 'groupByLabels',
        type: 'added',
        addedItems: labelsDiff.added,
      });
    }
    if (labelsDiff.removed.length > 0) {
      result.fields.push({
        field: 'groupByLabels',
        type: 'removed',
        removedItems: labelsDiff.removed,
      });
    }

    const conditionsDiff = this.diffConditions(
      snapshotA.conditions,
      snapshotB.conditions,
    );
    result.added += conditionsDiff.added;
    result.removed += conditionsDiff.removed;
    result.modified += conditionsDiff.modified;
    result.fields.push(...conditionsDiff.fields);

    return result;
  }

  private diffConditions(condA: any, condB: any): {
    added: number;
    removed: number;
    modified: number;
    fields: DiffField[];
  } {
    const result = { added: 0, removed: 0, modified: 0, fields: [] as DiffField[] };

    if (!condA || !condB) return result;

    const operatorA = condA.operator;
    const operatorB = condB.operator;
    if (operatorA !== operatorB) {
      result.modified++;
      result.fields.push({
        field: 'conditions.operator',
        type: 'modified',
        oldValue: operatorA,
        newValue: operatorB,
      });
    }

    const conditionsA: any[] = condA.conditions || [];
    const conditionsB: any[] = condB.conditions || [];

    const maxLen = Math.max(conditionsA.length, conditionsB.length);
    for (let i = 0; i < maxLen; i++) {
      const cA = conditionsA[i];
      const cB = conditionsB[i];

      if (!cA && cB) {
        result.added++;
        result.fields.push({
          field: `conditions.conditions[${i}]`,
          type: 'added',
          newValue: cB,
        });
      } else if (cA && !cB) {
        result.removed++;
        result.fields.push({
          field: `conditions.conditions[${i}]`,
          type: 'removed',
          oldValue: cA,
        });
      } else if (cA && cB) {
        if (JSON.stringify(cA) !== JSON.stringify(cB)) {
          const subDiff = this.diffConditionItem(cA, cB, i);
          result.modified += subDiff.modified;
          result.fields.push(...subDiff.fields);
        }
      }
    }

    return result;
  }

  private diffConditionItem(
    cA: any,
    cB: any,
    index: number,
  ): { modified: number; fields: DiffField[] } {
    const result = { modified: 0, fields: [] as DiffField[] };
    const keys = new Set([...Object.keys(cA), ...Object.keys(cB)]);

    for (const key of keys) {
      const oldVal = cA[key];
      const newVal = cB[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        result.modified++;
        result.fields.push({
          field: `conditions.conditions[${index}].${key}`,
          type: 'modified',
          oldValue: oldVal,
          newValue: newVal,
        });
      }
    }

    return result;
  }

  private diffArray(
    oldArr: any[],
    newArr: any[],
    keyFn: (item: any) => string,
  ): { added: any[]; removed: any[] } {
    const oldSet = new Set(oldArr.map(keyFn));
    const newSet = new Set(newArr.map(keyFn));

    const added = newArr.filter(item => !oldSet.has(keyFn(item)));
    const removed = oldArr.filter(item => !newSet.has(keyFn(item)));

    return { added, removed };
  }

  private computeConditionTreeDiff(snapshotA: any, snapshotB: any): ConditionTreeDiffResult {
    const leftTree = this.buildConditionTree(snapshotA.conditions, 'left');
    const rightTree = this.buildConditionTree(snapshotB.conditions, 'right');

    this.markTreeDiff(leftTree, rightTree);

    const mappings = this.computeTreeMappings(leftTree, rightTree);

    return { leftTree, rightTree, mappings };
  }

  private buildConditionTree(conditions: any, prefix: string): ConditionTreeNode {
    if (!conditions) {
      return { id: `${prefix}_empty`, type: 'operator', operator: 'AND', children: [] };
    }

    const operator = conditions.operator || 'AND';
    const condList: any[] = conditions.conditions || [];

    const children: ConditionTreeNode[] = condList.map((cond: any, idx: number) => {
      if (cond.operator && cond.conditions) {
        return this.buildConditionTree(cond, `${prefix}_${idx}`);
      }
      return {
        id: `${prefix}_cond_${idx}`,
        type: 'condition' as const,
        condition: cond,
        diffType: 'unchanged' as const,
      };
    });

    return {
      id: `${prefix}_root`,
      type: 'operator',
      operator,
      children,
      diffType: 'unchanged',
    };
  }

  private markTreeDiff(leftTree: ConditionTreeNode, rightTree: ConditionTreeNode): void {
    const leftConditions = this.collectConditions(leftTree);
    const rightConditions = this.collectConditions(rightTree);

    const leftMap = new Map(leftConditions.map(c => [c.id, c]));
    const rightMap = new Map(rightConditions.map(c => [c.id, c]));

    for (const leftCond of leftConditions) {
      const key = this.conditionKey(leftCond.condition);
      const rightMatch = rightConditions.find(
        rc => this.conditionKey(rc.condition) === key && !rc._matched,
      );
      if (rightMatch) {
        leftCond.diffType = 'unchanged';
        rightMatch.diffType = 'unchanged';
        rightMatch._matched = true;
        leftCond._matched = true;
        if (JSON.stringify(leftCond.condition) !== JSON.stringify(rightMatch.condition)) {
          leftCond.diffType = 'modified';
          rightMatch.diffType = 'modified';
          leftCond.newCondition = rightMatch.condition;
          rightMatch.oldCondition = leftCond.condition;
        }
      } else {
        leftCond.diffType = 'removed';
      }
    }

    for (const rightCond of rightConditions) {
      if (!rightCond._matched) {
        rightCond.diffType = 'added';
      }
    }

    if (leftTree.operator !== rightTree.operator) {
      leftTree.diffType = 'modified';
      rightTree.diffType = 'modified';
    }

    this.markOperatorNodes(leftTree);
    this.markOperatorNodes(rightTree);
  }

  private markOperatorNodes(node: ConditionTreeNode): void {
    if (node.type === 'operator' && node.children) {
      for (const child of node.children) {
        this.markOperatorNodes(child);
      }
      const childDiffTypes = node.children.map(c => c.diffType);
      if (childDiffTypes.some(d => d === 'added' || 'removed' || d === 'modified')) {
        if (node.diffType !== 'modified') {
          node.diffType = 'unchanged';
        }
      }
    }
  }

  private collectConditions(node: ConditionTreeNode): any[] {
    const result: any[] = [];
    if (node.type === 'condition') {
      result.push(node);
    }
    if (node.children) {
      for (const child of node.children) {
        result.push(...this.collectConditions(child));
      }
    }
    return result;
  }

  private conditionKey(cond: any): string {
    if (!cond) return '';
    return `${cond.type || ''}_${cond.metric || ''}_${cond.label || ''}`;
  }

  private computeTreeMappings(
    leftTree: ConditionTreeNode,
    rightTree: ConditionTreeNode,
  ): Array<{ leftId: string; rightId: string; type: 'unchanged' | 'modified' | 'structural_change' }> {
    const mappings: Array<{ leftId: string; rightId: string; type: 'unchanged' | 'modified' | 'structural_change' }> = [];

    const leftConditions = this.collectConditions(leftTree);
    const rightConditions = this.collectConditions(rightTree);

    for (const left of leftConditions) {
      for (const right of rightConditions) {
        if (left.diffType === 'modified' && right.diffType === 'modified' &&
            left.newCondition && right.oldCondition &&
            JSON.stringify(left.condition) === JSON.stringify(right.oldCondition)) {
          mappings.push({
            leftId: left.id,
            rightId: right.id,
            type: 'modified',
          });
        } else if (left.diffType === 'removed' && right.diffType === 'added') {
          const keyL = this.conditionKey(left.condition);
          const keyR = this.conditionKey(right.condition);
          if (keyL && keyR && keyL === keyR) {
            mappings.push({
              leftId: left.id,
              rightId: right.id,
              type: 'structural_change',
            });
          }
        } else if (left.diffType === 'unchanged' && right.diffType === 'unchanged') {
          if (JSON.stringify(left.condition) === JSON.stringify(right.condition)) {
            if (!mappings.some(m => m.leftId === left.id || m.rightId === right.id)) {
              mappings.push({
                leftId: left.id,
                rightId: right.id,
                type: 'unchanged',
              });
            }
          }
        }
      }
    }

    if (leftTree.operator !== rightTree.operator) {
      mappings.push({
        leftId: leftTree.id,
        rightId: rightTree.id,
        type: 'structural_change',
      });
    }

    return mappings;
  }

  async rollback(
    tenantId: string,
    ruleId: string,
    targetVersionId: string,
    rolledBackBy: string,
    reason?: string,
  ): Promise<Rule> {
    const isLocked = await this.isRuleLocked(ruleId);
    if (isLocked) {
      throw new BadRequestException('该规则正在回滚中，请稍后再试');
    }

    const targetVersion = await this.getVersion(ruleId, targetVersionId);

    await this.acquireLock(ruleId, rolledBackBy);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const rule = await queryRunner.manager.findOne(Rule, {
        where: { id: ruleId, tenantId },
      });
      if (!rule) {
        throw new BadRequestException('Rule not found');
      }

      const snapshot = targetVersion.snapshot;
      Object.assign(rule, {
        name: snapshot.name,
        description: snapshot.description,
        severity: snapshot.severity,
        conditionType: snapshot.conditionType,
        conditions: snapshot.conditions,
        dsl: snapshot.dsl,
        priority: snapshot.priority,
        isEnabled: snapshot.isEnabled,
        windowSize: snapshot.windowSize,
        groupByLabels: snapshot.groupByLabels,
      });

      const savedRule = await queryRunner.manager.save(rule);

      const lastVersion = await queryRunner.manager.findOne(RuleVersion, {
        where: { ruleId },
        order: { versionNumber: 'DESC' },
      });
      const newVersionNumber = lastVersion ? lastVersion.versionNumber + 1 : 1;

      const changeSummaryText = reason
        ? `回滚至版本${targetVersion.versionNumber}: ${reason}`
        : `回滚至版本${targetVersion.versionNumber}`;

      const newVersion = queryRunner.manager.create(RuleVersion, {
        ruleId,
        versionNumber: newVersionNumber,
        snapshot: {
          name: savedRule.name,
          description: savedRule.description,
          severity: savedRule.severity,
          conditionType: savedRule.conditionType,
          conditions: savedRule.conditions,
          dsl: savedRule.dsl,
          priority: savedRule.priority,
          isEnabled: savedRule.isEnabled,
          windowSize: savedRule.windowSize,
          groupByLabels: savedRule.groupByLabels,
        },
        changeSummary: [{ field: 'rollback', label: '回滚操作', displayText: changeSummaryText, isStatusChange: false }],
        createdBy: rolledBackBy,
      });

      await queryRunner.manager.save(newVersion);

      await queryRunner.commitTransaction();

      this.eventEmitter.emit('rule.rolledback', {
        tenantId,
        rule: savedRule,
        targetVersionNumber: targetVersion.versionNumber,
      });

      return savedRule;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
      await this.releaseLock(ruleId);
    }
  }

  async batchRollback(
    tenantId: string,
    ruleIds: string[],
    rolledBackBy: string,
  ): Promise<{
    success: string[];
    failed: Array<{ ruleId: string; reason: string }>;
  }> {
    const result = {
      success: [] as string[],
      failed: [] as Array<{ ruleId: string; reason: string }>,
    };

    for (const ruleId of ruleIds) {
      try {
        const isLocked = await this.isRuleLocked(ruleId);
        if (isLocked) {
          result.failed.push({ ruleId, reason: '该规则正在回滚中，请稍后再试' });
          continue;
        }

        const lastVersion = await this.versionRepository.findOne({
          where: { ruleId },
          order: { versionNumber: 'DESC' },
        });

        if (!lastVersion) {
          result.failed.push({ ruleId, reason: '该规则没有历史版本' });
          continue;
        }

        const previousVersion = await this.versionRepository.findOne({
          where: { ruleId, versionNumber: LessThan(lastVersion.versionNumber) },
          order: { versionNumber: 'DESC' },
        });

        if (!previousVersion) {
          result.failed.push({ ruleId, reason: '该规则没有上一个版本可回滚' });
          continue;
        }

        await this.rollback(tenantId, ruleId, previousVersion.id, rolledBackBy);
        result.success.push(ruleId);
      } catch (error: any) {
        result.failed.push({ ruleId, reason: error.message || '回滚失败' });
      }
    }

    return result;
  }

  async batchDeleteVersions(ruleId: string, versionIds: string[]): Promise<{ deleted: number; skipped: number }> {
    const versions = await this.versionRepository.find({
      where: { id: In(versionIds), ruleId },
    });

    const favoriteVersions = versions.filter(v => v.isFavorite);
    const deletableVersions = versions.filter(v => !v.isFavorite);

    if (deletableVersions.length > 0) {
      await this.versionRepository.delete(deletableVersions.map(v => v.id));
    }

    return {
      deleted: deletableVersions.length,
      skipped: favoriteVersions.length,
    };
  }

  async batchExportVersions(ruleId: string, versionIds: string[]): Promise<{ ruleName: string; versions: any[] }> {
    const rule = await this.ruleRepository.findOne({ where: { id: ruleId } });
    const versions = await this.versionRepository.find({
      where: { id: In(versionIds), ruleId },
      order: { versionNumber: 'ASC' },
    });

    return {
      ruleName: rule?.name || 'unknown',
      versions: versions.map(v => ({
        versionNumber: v.versionNumber,
        snapshot: v.snapshot,
        changeSummary: v.changeSummary,
        createdBy: v.createdBy,
        tags: v.tags,
        isFavorite: v.isFavorite,
        createdAt: v.createdAt,
      })),
    };
  }

  async batchAddTags(ruleId: string, versionIds: string[], tags: string[]): Promise<{ updated: number }> {
    const versions = await this.versionRepository.find({
      where: { id: In(versionIds), ruleId },
    });

    for (const version of versions) {
      const existingTags = version.tags || [];
      version.tags = [...new Set([...existingTags, ...tags])];
    }

    await this.versionRepository.save(versions);
    return { updated: versions.length };
  }

  async isRuleLocked(ruleId: string): Promise<boolean> {
    const lock = await this.lockRepository.findOne({ where: { ruleId } });
    return !!lock;
  }

  async getLockedRuleIds(ruleIds: string[]): Promise<Set<string>> {
    const locks = await this.lockRepository
      .createQueryBuilder('lock')
      .where('lock.rule_id IN (:...ruleIds)', { ruleIds })
      .getMany();
    return new Set(locks.map(l => l.ruleId));
  }

  private async acquireLock(ruleId: string, lockedBy: string): Promise<void> {
    const existing = await this.lockRepository.findOne({ where: { ruleId } });
    if (existing) {
      throw new BadRequestException('该规则正在回滚中，请稍后再试');
    }
    const lock = this.lockRepository.create({ ruleId, lockedBy });
    await this.lockRepository.save(lock);
  }

  private async releaseLock(ruleId: string): Promise<void> {
    await this.lockRepository.delete({ ruleId });
  }

  async getVersionCreators(ruleId: string): Promise<string[]> {
    const result = await this.versionRepository
      .createQueryBuilder('v')
      .select('DISTINCT v.created_by', 'created_by')
      .where('v.rule_id = :ruleId', { ruleId })
      .andWhere('v.created_by IS NOT NULL')
      .getRawMany();
    return result.map(r => r.created_by);
  }
}

export interface DiffField {
  field: string;
  type: 'added' | 'removed' | 'modified';
  oldValue?: any;
  newValue?: any;
  addedItems?: any[];
  removedItems?: any[];
}

export interface DiffResult {
  added: number;
  removed: number;
  modified: number;
  fields: DiffField[];
}
