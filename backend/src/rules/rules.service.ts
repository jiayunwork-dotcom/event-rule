import { Injectable, Logger, BadRequestException, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Rule, ConditionType, AlertSeverity } from './rule.entity';
import { Event } from '../common/types/event.type';
import { validateConditions } from '../common/types/event.type';
import { RedisService } from '../common/services/redis.service';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RuleVersionsService } from './rule-versions.service';

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
    @Inject(forwardRef(() => RuleVersionsService))
    private readonly versionsService: RuleVersionsService,
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
    if (dto.conditionType !== ConditionType.DSL) {
      validateConditions(dto.conditions.conditions);
    }

    const rule = this.ruleRepository.create({
      ...dto,
      tenantId,
    });
    
    const saved = await this.ruleRepository.save(rule);
    await this.refreshRulesCache(tenantId);

    try {
      await this.versionsService.createVersion(saved.id, saved, [{ field: 'create', label: '创建', displayText: '创建规则' }], 'system');
    } catch (error) {
      this.logger.error(`Failed to create version for rule ${saved.id}`, error);
    }

    this.eventEmitter.emit('rule.created', { tenantId, rule: saved });
    
    return saved;
  }

  async update(tenantId: string, id: string, dto: Partial<CreateRuleDto>): Promise<Rule> {
    const rule = await this.findOne(tenantId, id);

    const isLocked = await this.versionsService.isRuleLocked(id);
    if (isLocked) {
      throw new BadRequestException('该规则正在回滚中，请稍后再试');
    }
    
    if (dto.conditions && dto.conditionType !== ConditionType.DSL) {
      validateConditions(dto.conditions.conditions);
    }

    const changeSummary = this.generateChangeSummary(rule, dto);

    Object.assign(rule, dto);
    const saved = await this.ruleRepository.save(rule);
    await this.refreshRulesCache(tenantId);

    try {
      await this.versionsService.createVersion(saved.id, saved, changeSummary, 'system');
    } catch (error) {
      this.logger.error(`Failed to create version for rule ${saved.id}`, error);
    }
    
    this.eventEmitter.emit('rule.updated', { tenantId, rule: saved });
    
    return saved;
  }

  private generateChangeSummary(oldRule: Rule, dto: Partial<CreateRuleDto>): any[] {
    const items: any[] = [];
    if (dto.name !== undefined && dto.name !== oldRule.name) {
      items.push({ field: 'name', label: '名称', oldValue: oldRule.name, newValue: dto.name, displayText: `名称从"${oldRule.name}"改为"${dto.name}"` });
    }
    if (dto.severity !== undefined && dto.severity !== oldRule.severity) {
      items.push({ field: 'severity', label: '严重程度', oldValue: oldRule.severity, newValue: dto.severity, displayText: `严重程度从${oldRule.severity}改为${dto.severity}` });
    }
    if (dto.priority !== undefined && dto.priority !== oldRule.priority) {
      items.push({ field: 'priority', label: '优先级', oldValue: oldRule.priority, newValue: dto.priority, displayText: `优先级从${oldRule.priority}改为${dto.priority}` });
    }
    if (dto.isEnabled !== undefined && dto.isEnabled !== oldRule.isEnabled) {
      items.push({
        field: 'isEnabled',
        label: '启用状态',
        oldValue: oldRule.isEnabled,
        newValue: dto.isEnabled,
        displayText: dto.isEnabled ? '⚠️规则已启用' : '⚠️规则已禁用',
        isStatusChange: true,
        statusChangeType: dto.isEnabled ? 'enabled' : 'disabled',
      });
    }
    if (dto.conditionType !== undefined && dto.conditionType !== oldRule.conditionType) {
      items.push({ field: 'conditionType', label: '条件类型', oldValue: oldRule.conditionType, newValue: dto.conditionType, displayText: `条件类型从${oldRule.conditionType}改为${dto.conditionType}` });
    }
    if (dto.conditions !== undefined && JSON.stringify(dto.conditions) !== JSON.stringify(oldRule.conditions)) {
      const oldConds = oldRule.conditions as RuleCondition;
      const newConds = dto.conditions as RuleCondition;
      const condItems = this.generateConditionChangeItems(oldConds, newConds);
      if (condItems.length > 0) {
        items.push(...condItems);
      } else {
        items.push({ field: 'conditions', label: '条件配置', displayText: '修改了条件配置' });
      }
    }
    if (dto.dsl !== undefined && dto.dsl !== oldRule.dsl) {
      items.push({ field: 'dsl', label: 'DSL规则', oldValue: oldRule.dsl, newValue: dto.dsl, displayText: '修改了DSL规则' });
    }
    if (dto.windowSize !== undefined && dto.windowSize !== oldRule.windowSize) {
      items.push({ field: 'windowSize', label: '窗口大小', oldValue: oldRule.windowSize, newValue: dto.windowSize, displayText: `窗口大小从${oldRule.windowSize}改为${dto.windowSize}` });
    }
    if (dto.description !== undefined && dto.description !== oldRule.description) {
      items.push({ field: 'description', label: '描述', oldValue: oldRule.description, newValue: dto.description, displayText: '修改了描述' });
    }
    if (items.length === 0) {
      items.push({ field: 'general', label: '更新', displayText: '更新规则' });
    }
    return items;
  }

  private generateConditionChangeItems(oldConds: RuleCondition, newConds: RuleCondition): any[] {
    const items: any[] = [];
    if (!oldConds || !newConds) return items;

    if (oldConds.operator !== newConds.operator) {
      items.push({ field: 'conditions.operator', label: '条件逻辑运算符', oldValue: oldConds.operator, newValue: newConds.operator, displayText: `条件逻辑从${oldConds.operator}改为${newConds.operator}` });
    }

    const oldList = oldConds.conditions || [];
    const newList = newConds.conditions || [];
    const maxLen = Math.max(oldList.length, newList.length);

    for (let i = 0; i < maxLen; i++) {
      const oldC = oldList[i];
      const newC = newList[i];

      if (!oldC && newC) {
        items.push({ field: `conditions[${i}]`, label: `新增条件${i + 1}`, newValue: newC, displayText: `新增条件: ${this.describeCondition(newC)}` });
      } else if (oldC && !newC) {
        items.push({ field: `conditions[${i}]`, label: `删除条件${i + 1}`, oldValue: oldC, displayText: `删除条件: ${this.describeCondition(oldC)}` });
      } else if (oldC && newC && JSON.stringify(oldC) !== JSON.stringify(newC)) {
        const changeDetails = this.describeConditionChanges(oldC, newC, i);
        items.push(...changeDetails);
      }
    }

    return items;
  }

  private describeCondition(cond: any): string {
    if (!cond) return '';
    switch (cond.type) {
      case 'threshold':
        return `${cond.metric || ''} ${cond.operator || ''} ${cond.value ?? ''}`;
      case 'label':
        return `${cond.label || ''} ${cond.operator || ''} ${cond.labelValue || ''}`;
      case 'window':
        return `窗口聚合: ${cond.metric || ''} ${cond.aggregate || ''} ${cond.operator || ''} ${cond.threshold ?? ''}`;
      case 'frequency':
        return `频率: ${cond.metric || ''} ${cond.windowSize || ''}s内超${cond.threshold ?? ''}次`;
      case 'sequence':
        return `序列: ${cond.eventA || ''} -> ${cond.eventB || ''} (${cond.interval || ''}s)`;
      default:
        return JSON.stringify(cond);
    }
  }

  private describeConditionChanges(oldC: any, newC: any, index: number): any[] {
    const items: any[] = [];
    const keys = new Set([...Object.keys(oldC), ...Object.keys(newC)]);
    const condLabel = `条件${index + 1}`;

    for (const key of keys) {
      const oldVal = oldC[key];
      const newVal = newC[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        const keyLabelMap: Record<string, string> = {
          type: '类型', metric: '指标', operator: '操作符', value: '阈值',
          label: '标签', labelValue: '标签值', aggregate: '聚合函数',
          threshold: '阈值', windowSize: '窗口大小',
          eventA: '前置事件', eventB: '后续事件', interval: '时间间隔',
        };
        const keyLabel = keyLabelMap[key] || key;
        let displayText = `${condLabel}.${keyLabel}从${oldVal ?? '无'}改为${newVal ?? '无'}`;

        if (key === 'threshold' || key === 'value') {
          displayText = `${condLabel}阈值从${oldVal ?? '无'}改为${newVal ?? '无'}`;
        } else if (key === 'metric') {
          displayText = `${condLabel}指标从${oldVal ?? '无'}改为${newVal ?? '无'}`;
        }

        items.push({
          field: `conditions[${index}].${key}`,
          label: `${condLabel}.${keyLabel}`,
          oldValue: oldVal,
          newValue: newVal,
          displayText,
        });
      }
    }

    return items;
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

  @OnEvent('rule.rolledback')
  async handleRollback(payload: { tenantId: string; rule: Rule }) {
    const { tenantId, rule } = payload;
    await this.refreshRulesCache(tenantId);
    this.eventEmitter.emit('rule.updated', { tenantId, rule });
    this.logger.log(`Rule ${rule.name} rolled back, cache refreshed`);
  }

  async toggleEnabled(tenantId: string, id: string, isEnabled: boolean): Promise<Rule> {
    const isLocked = await this.versionsService.isRuleLocked(id);
    if (isLocked) {
      throw new BadRequestException('该规则正在回滚中，请稍后再试');
    }

    const rule = await this.findOne(tenantId, id);
    rule.isEnabled = isEnabled;
    const saved = await this.ruleRepository.save(rule);
    await this.refreshRulesCache(tenantId);

    try {
      await this.versionsService.createVersion(
        saved.id,
        saved,
        [{
          field: 'isEnabled',
          label: '启用状态',
          oldValue: !isEnabled,
          newValue: isEnabled,
          displayText: isEnabled ? '⚠️规则已启用' : '⚠️规则已禁用',
          isStatusChange: true,
          statusChangeType: isEnabled ? 'enabled' : 'disabled',
        }],
        'system',
      );
    } catch (error) {
      this.logger.error(`Failed to create version for rule ${saved.id}`, error);
    }

    return saved;
  }

  async simulateRule(
    tenantId: string,
    ruleId: string,
    eventData: { metricName?: string; value?: number; labels?: Record<string, string>; timestamp?: string },
  ): Promise<{
    matched: boolean;
    matchDetails: Array<{ condition: string; passed: boolean; reason: string }>;
    aggregationWindowStatus?: { eventCount: number; aggregateResult?: number };
  }> {
    const rule = await this.findOne(tenantId, ruleId);

    const event: Event = {
      source: 'simulate',
      timestamp: eventData.timestamp ? new Date(eventData.timestamp) : new Date(),
      labels: eventData.labels || {},
      metricName: eventData.metricName,
      value: eventData.value,
      severity: rule.severity,
    };

    const matchDetails: Array<{ condition: string; passed: boolean; reason: string }> = [];
    let matched = false;
    let aggregationWindowStatus: { eventCount: number; aggregateResult?: number } | undefined;

    switch (rule.conditionType) {
      case ConditionType.SINGLE_THRESHOLD: {
        const condition = (rule.conditions as RuleCondition).conditions[0];
        if (!condition) {
          matchDetails.push({ condition: '单指标阈值', passed: false, reason: '规则未配置条件' });
          break;
        }
        if (!event.metricName) {
          matchDetails.push({ condition: '指标名称匹配', passed: false, reason: '模拟事件未提供 metric_name' });
          break;
        }
        if (event.metricName !== condition.metric) {
          matchDetails.push({
            condition: `指标名称匹配: ${event.metricName} vs ${condition.metric}`,
            passed: false,
            reason: `指标名称不匹配, 事件指标 "${event.metricName}" ≠ 规则指标 "${condition.metric}"`,
          });
        } else {
          matchDetails.push({ condition: `指标名称匹配: ${event.metricName}`, passed: true, reason: '指标名称匹配' });
        }
        if (event.value === undefined) {
          matchDetails.push({ condition: '指标值比较', passed: false, reason: '模拟事件未提供 value' });
        } else {
          const valueMatched = this.compareValue(event.value, condition.operator!, condition.value as number);
          matchDetails.push({
            condition: `指标值比较: ${event.value} ${condition.operator} ${condition.value}`,
            passed: valueMatched,
            reason: valueMatched
              ? `${event.value} ${condition.operator} ${condition.value} 成立`
              : `${event.value} ${condition.operator} ${condition.value} 不成立`,
          });
        }
        matched = matchDetails.every(d => d.passed);
        break;
      }

      case ConditionType.MULTI_CONDITION: {
        const ruleCondition = rule.conditions as RuleCondition;
        for (let i = 0; i < ruleCondition.conditions.length; i++) {
          const condition = ruleCondition.conditions[i];
          if (condition.type === 'threshold') {
            if (event.metricName !== condition.metric) {
              matchDetails.push({
                condition: `[条件${i + 1}] 阈值指标匹配: ${event.metricName || '无'} vs ${condition.metric}`,
                passed: false,
                reason: `指标名称不匹配`,
              });
            } else {
              const valueMatched = event.value !== undefined && this.compareValue(event.value, condition.operator!, condition.value as number);
              matchDetails.push({
                condition: `[条件${i + 1}] 阈值: ${event.value} ${condition.operator} ${condition.value}`,
                passed: valueMatched,
                reason: valueMatched ? '阈值条件满足' : '阈值条件不满足',
              });
            }
          } else if (condition.type === 'label') {
            const labelValue = event.labels[condition.label!];
            if (!labelValue) {
              matchDetails.push({
                condition: `[条件${i + 1}] 标签匹配: ${condition.label}`,
                passed: false,
                reason: `事件中不存在标签 "${condition.label}"`,
              });
            } else {
              const labelMatched = this.compareString(labelValue, condition.operator!, condition.labelValue!);
              matchDetails.push({
                condition: `[条件${i + 1}] 标签: ${condition.label}=${labelValue} ${condition.operator} ${condition.labelValue}`,
                passed: labelMatched,
                reason: labelMatched ? '标签条件满足' : '标签条件不满足',
              });
            }
          }
        }
        if (ruleCondition.operator === 'AND') {
          matched = matchDetails.every(d => d.passed);
        } else {
          matched = matchDetails.some(d => d.passed);
        }
        break;
      }

      case ConditionType.WINDOW_AGGREGATE: {
        const ruleCondition = rule.conditions as RuleCondition;
        const windowCondition = ruleCondition.conditions.find(c => c.type === 'window');
        if (!windowCondition) {
          matchDetails.push({ condition: '窗口聚合', passed: false, reason: '规则未配置窗口聚合条件' });
          break;
        }
        matchDetails.push({
          condition: '窗口聚合检测',
          passed: false,
          reason: '模拟测试无法提供真实时间窗口数据, 仅展示当前事件是否满足窗口内指标条件',
        });
        if (event.metricName && windowCondition.metric && event.metricName !== windowCondition.metric) {
          matchDetails.push({
            condition: `窗口指标匹配: ${event.metricName} vs ${windowCondition.metric}`,
            passed: false,
            reason: '指标名称不匹配, 该事件不会进入此规则的聚合窗口',
          });
        } else {
          matchDetails.push({
            condition: `窗口指标匹配: ${event.metricName || windowCondition.metric}`,
            passed: true,
            reason: '指标名称匹配, 事件将被加入聚合窗口',
          });
          if (event.value !== undefined && windowCondition.operator && windowCondition.threshold !== undefined) {
            const currentValueMatches = this.compareValue(event.value, windowCondition.operator, windowCondition.threshold);
            matchDetails.push({
              condition: `当前值阈值检查: ${event.value} ${windowCondition.operator} ${windowCondition.threshold}`,
              passed: currentValueMatches,
              reason: currentValueMatches ? '当前值满足阈值条件' : '当前值不满足阈值条件',
            });
          }
        }
        const windowKey = `${this.windowDataKey}${tenantId}:${rule.id}`;
        const now = Date.now();
        const windowSize = rule.windowSize * 1000;
        try {
          const windowData = await this.redisService.zrangebyscore(windowKey, now - windowSize, now);
          aggregationWindowStatus = { eventCount: windowData.length };
          if (windowData.length > 0 && windowCondition) {
            const values = windowData.map(d => parseFloat(JSON.parse(d).value));
            let aggregateResult: number;
            switch (windowCondition.aggregate) {
              case 'count': aggregateResult = values.length; break;
              case 'sum': aggregateResult = values.reduce((a, b) => a + b, 0); break;
              case 'avg': aggregateResult = values.reduce((a, b) => a + b, 0) / values.length; break;
              case 'max': aggregateResult = Math.max(...values); break;
              case 'min': aggregateResult = Math.min(...values); break;
              default: aggregateResult = values.length;
            }
            aggregationWindowStatus.aggregateResult = aggregateResult;
          }
        } catch {
          aggregationWindowStatus = { eventCount: 0 };
        }
        break;
      }

      case ConditionType.FREQUENCY: {
        const condition = (rule.conditions as RuleCondition).conditions[0];
        if (!condition) {
          matchDetails.push({ condition: '频率检测', passed: false, reason: '规则未配置频率条件' });
          break;
        }
        if (!event.metricName) {
          matchDetails.push({ condition: '频率检测', passed: false, reason: '模拟事件未提供 metric_name' });
          break;
        }
        matchDetails.push({
          condition: `频率检测: 窗口 ${condition.windowSize}s 内超过 ${condition.threshold} 次`,
          passed: false,
          reason: '模拟测试为单次事件, 无法直接判断频率条件。实际匹配需在时间窗口内积累事件',
        });
        const fingerprint = `${tenantId}:${rule.id}:${event.metricName}`;
        const freqKey = `rule:freq:${fingerprint}`;
        try {
          const currentCount = await this.redisService.get(freqKey);
          matchDetails.push({
            condition: `当前频率计数`,
            passed: false,
            reason: `当前窗口内已有 ${currentCount || 0} 次事件, 阈值为 ${condition.threshold}`,
          });
        } catch {
          matchDetails.push({ condition: '当前频率计数', passed: false, reason: '无法获取频率计数' });
        }
        break;
      }

      case ConditionType.LABEL_MATCH: {
        const condition = (rule.conditions as RuleCondition).conditions[0];
        if (!condition) {
          matchDetails.push({ condition: '标签匹配', passed: false, reason: '规则未配置标签匹配条件' });
          break;
        }
        const labelValue = event.labels[condition.label!];
        if (!labelValue) {
          matchDetails.push({
            condition: `标签匹配: ${condition.label}`,
            passed: false,
            reason: `事件中不存在标签 "${condition.label}"`,
          });
        } else {
          const labelMatched = this.compareString(labelValue, condition.operator!, condition.labelValue!);
          matchDetails.push({
            condition: `标签匹配: ${condition.label}=${labelValue} ${condition.operator} ${condition.labelValue}`,
            passed: labelMatched,
            reason: labelMatched ? '标签条件满足' : '标签条件不满足',
          });
        }
        matched = matchDetails.every(d => d.passed);
        break;
      }

      case ConditionType.SEQUENCE_PATTERN: {
        const condition = (rule.conditions as RuleCondition).conditions[0];
        if (!condition) {
          matchDetails.push({ condition: '序列模式', passed: false, reason: '规则未配置序列模式条件' });
          break;
        }
        const eventType = event.labels?.event_type;
        if (eventType === condition.eventA) {
          matchDetails.push({
            condition: `序列模式: 事件A "${condition.eventA}" 匹配`,
            passed: false,
            reason: '当前事件匹配序列起点(A事件), 但序列需要后续出现B事件才能完整匹配',
          });
        } else if (eventType === condition.eventB) {
          const timerKey = `${this.sequenceTimersKey}${tenantId}:${rule.id}`;
          let hasTimer = false;
          try {
            const timerData = await this.redisService.get(timerKey);
            hasTimer = !!timerData;
          } catch {}
          matchDetails.push({
            condition: `序列模式: 事件B "${condition.eventB}" 匹配`,
            passed: hasTimer,
            reason: hasTimer
              ? '已找到对应的A事件, 序列匹配成功'
              : '未找到对应的A事件, 序列匹配失败',
          });
        } else {
          matchDetails.push({
            condition: `序列模式: 事件类型 "${eventType || '无'}" 不匹配A(${condition.eventA})或B(${condition.eventB})`,
            passed: false,
            reason: '事件的 event_type 标签不匹配序列模式中的任何事件',
          });
        }
        break;
      }

      case ConditionType.DSL: {
        if (!rule.dsl) {
          matchDetails.push({ condition: 'DSL规则', passed: false, reason: '规则未配置DSL' });
          break;
        }
        try {
          const parsed = this.parseDsl(rule.dsl);
          for (const whereCondition of parsed.where) {
            const labelValue = event.labels[whereCondition.label];
            if (!labelValue) {
              matchDetails.push({
                condition: `DSL WHERE: label.${whereCondition.label} ${whereCondition.operator} "${whereCondition.value}"`,
                passed: false,
                reason: `事件中不存在标签 "${whereCondition.label}"`,
              });
            } else if (!this.compareString(labelValue, whereCondition.operator, whereCondition.value)) {
              matchDetails.push({
                condition: `DSL WHERE: label.${whereCondition.label}=${labelValue} ${whereCondition.operator} "${whereCondition.value}"`,
                passed: false,
                reason: `标签值不匹配: ${labelValue} ${whereCondition.operator} ${whereCondition.value}`,
              });
            } else {
              matchDetails.push({
                condition: `DSL WHERE: label.${whereCondition.label}=${labelValue} ${whereCondition.operator} "${whereCondition.value}"`,
                passed: true,
                reason: '标签条件满足',
              });
            }
          }
          matched = matchDetails.every(d => d.passed);
        } catch (error: any) {
          matchDetails.push({ condition: 'DSL解析', passed: false, reason: `DSL解析错误: ${error.message}` });
        }
        break;
      }

      default:
        matchDetails.push({ condition: '未知条件类型', passed: false, reason: `不支持的条件类型: ${rule.conditionType}` });
    }

    return { matched, matchDetails, aggregationWindowStatus };
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
