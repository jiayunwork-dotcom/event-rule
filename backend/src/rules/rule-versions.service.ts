import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { RuleVersion, RuleLock } from './rule-version.entity';
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
    changeSummary: string,
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
    });

    const saved = await this.versionRepository.save(version);

    await this.pruneOldVersions(ruleId);

    return saved;
  }

  private async pruneOldVersions(ruleId: string): Promise<void> {
    const count = await this.versionRepository.count({ where: { ruleId } });
    if (count <= MAX_VERSIONS) return;

    const deleteCount = count - MAX_VERSIONS;
    const oldestVersions = await this.versionRepository.find({
      where: { ruleId },
      order: { versionNumber: 'ASC' },
      take: deleteCount,
    });

    const idsToDelete = oldestVersions.map(v => v.id);
    if (idsToDelete.length > 0) {
      await this.versionRepository.delete(idsToDelete);
      this.logger.log(`Pruned ${idsToDelete.length} old versions for rule ${ruleId}`);
    }
  }

  async getVersions(
    ruleId: string,
    options?: {
      startTime?: string;
      endTime?: string;
      createdBy?: string;
    },
  ): Promise<RuleVersion[]> {
    const qb = this.versionRepository
      .createQueryBuilder('v')
      .where('v.rule_id = :ruleId', { ruleId })
      .orderBy('v.version_number', 'DESC');

    if (options?.startTime) {
      qb.andWhere('v.created_at >= :startTime', { startTime: options.startTime });
    }
    if (options?.endTime) {
      qb.andWhere('v.created_at <= :endTime', { endTime: options.endTime });
    }
    if (options?.createdBy) {
      qb.andWhere('v.created_by = :createdBy', { createdBy: options.createdBy });
    }

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

  async diffVersions(
    ruleId: string,
    versionIdA: string,
    versionIdB: string,
  ): Promise<{
    versionA: RuleVersion;
    versionB: RuleVersion;
    diff: DiffResult;
  }> {
    const versionA = await this.getVersion(ruleId, versionIdA);
    const versionB = await this.getVersion(ruleId, versionIdB);

    const [older, newer] =
      versionA.versionNumber < versionB.versionNumber
        ? [versionA, versionB]
        : [versionB, versionA];

    const diff = this.computeDiff(older.snapshot, newer.snapshot);

    return { versionA: older, versionB: newer, diff };
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

  async rollback(
    tenantId: string,
    ruleId: string,
    targetVersionId: string,
    rolledBackBy: string,
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
        changeSummary: `回滚至版本${targetVersion.versionNumber}`,
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
