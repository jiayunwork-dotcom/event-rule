import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Rule, ConditionType, AlertSeverity } from './rule.entity';
import { Event } from '../common/types/event.type';
import { validateConditions } from '../common/types/event.type';
import { RedisService } from '../common/services/redis.service';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface Condition {
  type: 'threshold' | 'label' | 'frequency' | 'window' | 'sequence';
  metric?: string;
  operator?: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'ne' | 'contains' | 'regex';
  value?: number | string;
  label?: string;
  labelValue?: string;
  windowSize?: number;
  threshold?: number;
  aggregate?: 'count' | 'sum' | 'avg' | 'max' | 'min';
  eventA?: string;
  eventB?: string;
  interval?: number;
}

export interface RuleCondition {
  operator: 'AND' | 'OR';
  conditions: Condition[];
}

export interface CreateRuleDto {
  name: string;
  description?: string;
  severity: AlertSeverity;
  conditionType: ConditionType;
  conditions: RuleCondition;
  dsl?: string;
  priority?: number;
  isEnabled?: boolean;
  windowSize?: number;
  groupByLabels?: string[];
}

export interface ParsedDsl {
  select: string;
  metric?: string;
  where: Array<{ label: string; operator: string; value: string }>;
  window: number;
  having: { operator: string; value: number };
  alert: { severity: AlertSeverity; name?: string };
}

@Injectable()
export class RulesService implements OnModuleInit {
  private readonly logger = new Logger(RulesService.name);
  private readonly slidingWindowInterval: number;
  private rulesCache: Map<string, Rule[]> = new Map();
  private readonly sequenceTimersKey = 'rule:sequence:';
  private readonly windowDataKey = 'rule:window:';

  constructor(
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,
    private readonly eventEmitter: EventEmitter2,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.slidingWindowInterval = this.configService.get<number>('SLIDING_WINDOW_INTERVAL', 10000);
  }

  onModuleInit() {
    this.loadAllRules();
    this.startSlidingWindowProcessor();
  }

  private async loadAllRules() {
    const rules = await this.ruleRepository.find({ where: { isEnabled: true } });
    this.rulesCache.clear();
    for (const rule of rules) {
      const tenantRules = this.rulesCache.get(rule.tenantId) || [];
      tenantRules.push(rule);
      this.rulesCache.set(rule.tenantId, tenantRules);
    }
    this.logger.log(`Loaded ${rules.length} rules into cache`);
  }

  private startSlidingWindowProcessor() {
    setInterval(async () => {
      try {
        await this.processSlidingWindows();
      } catch (error) {
        this.logger.error('Error processing sliding windows', error);
      }
    }, this.slidingWindowInterval);
  }

  private async processSlidingWindows() {
    const tenants = Array.from(this.rulesCache.keys());
    for (const tenantId of tenants) {
      const rules = this.rulesCache.get(tenantId) || [];
      for (const rule of rules) {
        if (rule.conditionType === ConditionType.WINDOW_AGGREGATE) {
          await this.evaluateWindowRule(tenantId, rule);
        }
      }
    }
  }

  private async evaluateWindowRule(tenantId: string, rule: Rule) {
    const now = Date.now();
    const windowSize = rule.windowSize * 1000;
    const windowKey = `${this.windowDataKey}${tenantId}:${rule.id}`;

    const windowData = await this.redisService.zrangebyscore(
      windowKey,
      now - windowSize,
      now,
    );

    if (windowData.length > 0) {
      const condition = rule.conditions as RuleCondition;
      const windowCondition = condition.conditions.find(c => c.type === 'window');

      if (windowCondition) {
        let result: number;
        const values = windowData.map(d => parseFloat(JSON.parse(d).value));

        switch (windowCondition.aggregate) {
          case 'count':
            result = values.length;
            break;
          case 'sum':
            result = values.reduce((a, b) => a + b, 0);
            break;
          case 'avg':
            result = values.reduce((a, b) => a + b, 0) / values.length;
            break;
          case 'max':
            result = Math.max(...values);
            break;
          case 'min':
            result = Math.min(...values);
            break;
          default:
            result = values.length;
        }

        if (this.compareValue(result, windowCondition.operator!, windowCondition.threshold!)) {
          const labels = rule.groupByLabels?.length > 0
            ? { rule: rule.name, ...this.extractGroupLabels(windowData, rule.groupByLabels) }
            : { rule: rule.name };

          const latestEvent = JSON.parse(windowData[windowData.length - 1]);

          this.eventEmitter.emit('rule.triggered', {
            tenantId,
            rule,
            event: {
              source: 'window-aggregate',
              timestamp: new Date(),
              labels,
              metricName: windowCondition.metric,
              value: result,
              severity: rule.severity,
            } as Event,
          });
        }
      }
    }

    await this.redisService.zremrangebyscore(windowKey, 0, now - windowSize);
  }

  private extractGroupLabels(windowData: string[], groupByLabels: string[]): Record<string, string> {
    const labels: Record<string, string> = {};
    if (windowData.length > 0) {
      const firstEvent = JSON.parse(windowData[0]);
      for (const label of groupByLabels) {
        if (firstEvent.labels?.[label]) {
          labels[label] = firstEvent.labels[label];
        }
      }
    }
    return labels;
  }

  @OnEvent('event.received')
  async handleEvent(payload: { tenantId: string; event: Event }) {
    const { tenantId, event } = payload;
    const rules = this.rulesCache.get(tenantId) || [];
    
    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      try {
        const matched = await this.evaluateRule(tenantId, rule, event);
        if (matched) {
          this.logger.log(`Rule ${rule.name} triggered by event`);
          this.eventEmitter.emit('rule.triggered', { tenantId, rule, event });
        }
      } catch (error) {
        this.logger.error(`Error evaluating rule ${rule.name}`, error);
      }
    }
  }

  private async evaluateRule(tenantId: string, rule: Rule, event: Event): Promise<boolean> {
    switch (rule.conditionType) {
      case ConditionType.SINGLE_THRESHOLD:
        return this.evaluateSingleThreshold(rule, event);
      case ConditionType.MULTI_CONDITION:
        return this.evaluateMultiCondition(rule, event);
      case ConditionType.WINDOW_AGGREGATE:
        return this.storeEventForWindow(tenantId, rule, event);
      case ConditionType.FREQUENCY:
        return this.evaluateFrequency(tenantId, rule, event);
      case ConditionType.LABEL_MATCH:
        return this.evaluateLabelMatch(rule, event);
      case ConditionType.SEQUENCE_PATTERN:
        return this.evaluateSequencePattern(tenantId, rule, event);
      case ConditionType.DSL:
        return this.evaluateDsl(rule, event);
      default:
        return false;
    }
  }

  private evaluateSingleThreshold(rule: Rule, event: Event): boolean {
    const condition = (rule.conditions as RuleCondition).conditions[0];
    if (!condition || !event.metricName || event.value === undefined) return false;
    
    if (event.metricName !== condition.metric) return false;
    
    return this.compareValue(event.value, condition.operator!, condition.value as number);
  }

  private evaluateMultiCondition(rule: Rule, event: Event): boolean {
    const ruleCondition = rule.conditions as RuleCondition;
    const results = ruleCondition.conditions.map(condition => {
      if (condition.type === 'threshold') {
        if (event.metricName !== condition.metric) return false;
        return this.compareValue(event.value!, condition.operator!, condition.value as number);
      } else if (condition.type === 'label') {
        const labelValue = event.labels[condition.label!];
        if (!labelValue) return false;
        return this.compareString(labelValue, condition.operator!, condition.labelValue!);
      }
      return false;
    });

    if (ruleCondition.operator === 'AND') {
      return results.every(r => r);
    } else {
      return results.some(r => r);
    }
  }

  private async storeEventForWindow(tenantId: string, rule: Rule, event: Event): Promise<boolean> {
    const windowKey = `${this.windowDataKey}${tenantId}:${rule.id}`;
    const timestamp = Date.now();
    const eventData = JSON.stringify({ ...event, timestamp });
    
    await this.redisService.zadd(windowKey, timestamp, eventData);
    return false;
  }

  private async evaluateFrequency(tenantId: string, rule: Rule, event: Event): Promise<boolean> {
    const condition = (rule.conditions as RuleCondition).conditions[0];
    if (!condition) return false;

    const fingerprint = `${tenantId}:${rule.id}:${event.metricName}`;
    const freqKey = `rule:freq:${fingerprint}`;
    
    const count = await this.redisService.incr(freqKey);
    if (count === 1) {
      await this.redisService.expire(freqKey, condition.windowSize!);
    }

    return count > condition.threshold!;
  }

  private evaluateLabelMatch(rule: Rule, event: Event): boolean {
    const condition = (rule.conditions as RuleCondition).conditions[0];
    if (!condition) return false;

    const labelValue = event.labels[condition.label!];
    if (!labelValue) return false;

    return this.compareString(labelValue, condition.operator!, condition.labelValue!);
  }

  private async evaluateSequencePattern(tenantId: string, rule: Rule, event: Event): Promise<boolean> {
    const condition = (rule.conditions as RuleCondition).conditions[0];
    if (!condition) return false;

    const timerKey = `${this.sequenceTimersKey}${tenantId}:${rule.id}`;
    
    if (event.labels.event_type === condition.eventA) {
      await this.redisService.set(timerKey, JSON.stringify({ event, startedAt: Date.now() }), condition.interval!);
      return false;
    }

    if (event.labels.event_type === condition.eventB) {
      const timerData = await this.redisService.get(timerKey);
      if (timerData) {
        await this.redisService.del(timerKey);
        return true;
      }
    }

    return false;
  }

  private evaluateDsl(rule: Rule, event: Event): boolean {
    if (!rule.dsl) return false;
    
    try {
      const parsed = this.parseDsl(rule.dsl);
      
      for (const whereCondition of parsed.where) {
        const labelValue = event.labels[whereCondition.label];
        if (!labelValue || !this.compareString(labelValue, whereCondition.operator, whereCondition.value)) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Error parsing DSL for rule ${rule.name}`, error);
      return false;
    }
  }

  parseDsl(dsl: string): ParsedDsl {
    const selectMatch = dsl.match(/SELECT\s+(\w+)(?:\((\w+)\))?\s+FROM\s+events/i);
    const whereMatch = dsl.match(/WHERE\s+(.+?)\s+(WINDOW|HAVING|THEN)/i);
    const windowMatch = dsl.match(/WINDOW\s+(\d+)([smh])/i);
    const havingMatch = dsl.match(/HAVING\s+(\w+)\s*([><=!]+)\s*(\d+)/i);
    const alertMatch = dsl.match(/THEN\s+alert\((.+?)\)/i);

    if (!selectMatch || !alertMatch) {
      throw new BadRequestException('Invalid DSL syntax');
    }

    const result: ParsedDsl = {
      select: selectMatch[1],
      metric: selectMatch[2],
      where: [],
      window: 300,
      having: { operator: '>', value: 0 },
      alert: { severity: AlertSeverity.WARNING },
    };

    if (whereMatch) {
      const whereStr = whereMatch[1];
      const conditions = whereStr.split(/\s+AND\s+/i);
      for (const cond of conditions) {
        const match = cond.match(/label\.(\w+)\s*([><=!~]+)\s*['"](.+?)['"]/i);
        if (match) {
          result.where.push({
            label: match[1],
            operator: match[2],
            value: match[3],
          });
        }
      }
    }

    if (windowMatch) {
      const value = parseInt(windowMatch[1]);
      const unit = windowMatch[2].toLowerCase();
      switch (unit) {
        case 's': result.window = value; break;
        case 'm': result.window = value * 60; break;
        case 'h': result.window = value * 3600; break;
      }
    }

    if (havingMatch) {
      result.having = {
        operator: havingMatch[2],
        value: parseInt(havingMatch[3]),
      };
    }

    if (alertMatch) {
      const alertParams = alertMatch[1];
      const severityMatch = alertParams.match(/severity\s*=\s*['"](\w+)['"]/i);
      const nameMatch = alertParams.match(/name\s*=\s*['"](.+?)['"]/i);
      
      if (severityMatch) {
        result.alert.severity = severityMatch[1].toLowerCase() as AlertSeverity;
      }
      if (nameMatch) {
        result.alert.name = nameMatch[1];
      }
    }

    return result;
  }

  private compareValue(a: number, operator: string, b: number): boolean {
    switch (operator) {
      case 'gt': return a > b;
      case 'lt': return a < b;
      case 'gte': return a >= b;
      case 'lte': return a <= b;
      case 'eq': return a === b;
      case 'ne': return a !== b;
      default: return false;
    }
  }

  private compareString(a: string, operator: string, b: string): boolean {
    switch (operator) {
      case 'eq': return a === b;
      case 'ne': return a !== b;
      case 'contains': return a.includes(b);
      case 'regex': return new RegExp(b).test(a);
      default: return false;
    }
  }

  async findAll(tenantId: string): Promise<Rule[]> {
    return this.ruleRepository.find({
      where: { tenantId },
      order: { priority: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<Rule> {
    const rule = await this.ruleRepository.findOne({ where: { id, tenantId } });
    if (!rule) {
      throw new BadRequestException('Rule not found');
    }
    return rule;
  }

  async create(tenantId: string, dto: CreateRuleDto): Promise<Rule> {
    const ruleCount = await this.ruleRepository.count({ where: { tenantId } });
    
    if (dto.conditionType !== ConditionType.DSL) {
      validateConditions(dto.conditions.conditions);
    }

    const rule = this.ruleRepository.create({
      ...dto,
      tenantId,
    });
    
    const saved = await this.ruleRepository.save(rule);
    await this.refreshRulesCache(tenantId);
    
    this.eventEmitter.emit('rule.created', { tenantId, rule: saved });
    
    return saved;
  }

  async update(tenantId: string, id: string, dto: Partial<CreateRuleDto>): Promise<Rule> {
    const rule = await this.findOne(tenantId, id);
    
    if (dto.conditions && dto.conditionType !== ConditionType.DSL) {
      validateConditions(dto.conditions.conditions);
    }

    Object.assign(rule, dto);
    const saved = await this.ruleRepository.save(rule);
    await this.refreshRulesCache(tenantId);
    
    this.eventEmitter.emit('rule.updated', { tenantId, rule: saved });
    
    return saved;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.ruleRepository.delete({ id, tenantId });
    await this.refreshRulesCache(tenantId);
    
    this.eventEmitter.emit('rule.deleted', { tenantId, ruleId: id });
  }

  private async refreshRulesCache(tenantId: string) {
    const rules = await this.ruleRepository.find({ where: { tenantId, isEnabled: true } });
    this.rulesCache.set(tenantId, rules);
  }

  async toggleEnabled(tenantId: string, id: string, isEnabled: boolean): Promise<Rule> {
    const rule = await this.findOne(tenantId, id);
    rule.isEnabled = isEnabled;
    const saved = await this.ruleRepository.save(rule);
    await this.refreshRulesCache(tenantId);
    return saved;
  }

  async exportRules(tenantId: string, ruleIds?: string[]): Promise<any[]> {
    let rules: Rule[];

    if (ruleIds && ruleIds.length > 0) {
      rules = await this.ruleRepository.createQueryBuilder('rule')
        .where('rule.tenantId = :tenantId', { tenantId })
        .andWhere('rule.id IN (:...ruleIds)', { ruleIds })
        .getMany();
    } else {
      rules = await this.findAll(tenantId);
    }

    return rules.map(rule => ({
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
    }));
  }

  async importRules(
    tenantId: string,
    rulesData: any[],
    conflictStrategy: 'skip' | 'overwrite' | 'rename',
  ): Promise<{
    success: number;
    skipped: number;
    failed: number;
    results: Array<{ name: string; status: string; message?: string; newName?: string }>;
  }> {
    const result = {
      success: 0,
      skipped: 0,
      failed: 0,
      results: [] as Array<{ name: string; status: string; message?: string; newName?: string }>,
    };

    const existingRules = await this.findAll(tenantId);
    const existingNames = new Set(existingRules.map(r => r.name));

    for (const ruleData of rulesData) {
      try {
        const name = ruleData.name;

        if (!name) {
          result.failed++;
          result.results.push({
            name: '未知规则',
            status: 'failed',
            message: '规则名称不能为空',
          });
          continue;
        }

        if (existingNames.has(name)) {
          if (conflictStrategy === 'skip') {
            result.skipped++;
            result.results.push({
              name,
              status: 'skipped',
              message: '规则名称已存在，已跳过',
            });
            continue;
          } else if (conflictStrategy === 'overwrite') {
            const existingRule = existingRules.find(r => r.name === name);
            if (existingRule) {
              if (ruleData.conditionType !== ConditionType.DSL) {
                validateConditions(ruleData.conditions.conditions);
              }
              Object.assign(existingRule, ruleData);
              await this.ruleRepository.save(existingRule);
              result.success++;
              result.results.push({
                name,
                status: 'success',
                message: '规则已覆盖更新',
              });
              continue;
            }
          } else if (conflictStrategy === 'rename') {
            let newName = `${name}_导入`;
            let counter = 1;
            while (existingNames.has(newName)) {
              counter++;
              newName = `${name}_导入${counter}`;
            }
            ruleData.name = newName;

            if (ruleData.conditionType !== ConditionType.DSL) {
              validateConditions(ruleData.conditions.conditions);
            }

            const rule = this.ruleRepository.create({
              ...ruleData,
              tenantId,
            });
            await this.ruleRepository.save(rule);
            existingNames.add(newName);
            result.success++;
            result.results.push({
              name,
              newName,
              status: 'success',
              message: '规则重命名后导入成功',
            });
            continue;
          }
        }

        if (ruleData.conditionType !== ConditionType.DSL) {
          validateConditions(ruleData.conditions.conditions);
        }

        const rule = this.ruleRepository.create({
          ...ruleData,
          tenantId,
        });
        await this.ruleRepository.save(rule);
        existingNames.add(name);
        result.success++;
        result.results.push({
          name,
          status: 'success',
          message: '规则导入成功',
        });
      } catch (error: any) {
        result.failed++;
        result.results.push({
          name: ruleData.name || '未知规则',
          status: 'failed',
          message: error.message || '导入失败',
        });
      }
    }

    await this.refreshRulesCache(tenantId);
    return result;
  }
}
