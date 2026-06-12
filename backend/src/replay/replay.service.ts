import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ReplaySession, ReplaySessionStatus } from './replay-session.entity';
import { ReplayEvent } from './replay-event.entity';
import { ReplayResult } from './replay-result.entity';
import { ReplayBookmark } from './replay-bookmark.entity';
import { Event } from '../common/types/event.type';
import { Rule, ConditionType } from '../rules/rule.entity';
import { RuleCondition, Condition } from '../rules/rules.service';
import { RedisService } from '../common/services/redis.service';

export interface CreateSessionDto {
  name: string;
  description?: string;
}

export enum ReplayMode {
  REAL_TIME = 'real_time',
  ACCELERATED = 'accelerated',
  SINGLE_STEP = 'single_step',
}

export interface CustomRuleSnapshot {
  id?: string;
  name: string;
  conditionType: ConditionType;
  conditions: RuleCondition;
  priority?: number;
  isEnabled?: boolean;
  severity?: string;
}

export interface StartReplayDto {
  mode: ReplayMode;
  speedMultiplier?: number;
  breakpoints?: BreakpointCondition[];
  breakpointLogicalOp?: 'AND' | 'OR';
  customRules?: CustomRuleSnapshot[];
  startEventIndex?: number;
}

export interface BreakpointCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
  value: string | number;
}

export interface SetBreakpointsDto {
  conditions: BreakpointCondition[];
  logicalOp?: 'AND' | 'OR';
}

export interface ReplayProgress {
  sessionId: string;
  totalEvents: number;
  replayedCount: number;
  matchedCount: number;
  hitRate: number;
  currentEvent?: ReplayEvent;
  currentMatchResults?: ReplayResult[];
  currentCustomMatchResults?: Array<{ ruleId: string; ruleName: string; matched: boolean; matchDetail?: any }>;
  isPaused: boolean;
  pauseReason?: string;
  breakpointTriggeredEvent?: ReplayEvent;
  breakpointRuleMatches?: Array<{
    ruleId: string;
    ruleName: string;
    matched: boolean;
    reason: string;
  }>;
  speedMultiplier: number;
}

export interface ComparisonDiffItem {
  eventId: string;
  eventPayload: any;
  eventSource?: string;
  eventTimestamp?: string;
  originalMatchedRuleIds: string[];
  replayedMatchedRuleIds: string[];
  originalMatchDetails?: any;
  replayedMatchDetails?: any;
  diffType: 'missed' | 'false_positive' | 'rule_changed';
}

export interface HotSwapDiffItem {
  eventId: string;
  eventPayload: any;
  eventSource?: string;
  eventTimestamp?: string;
  currentRuleIds: string[];
  customRuleIds: string[];
  currentMatchDetails?: any;
  customMatchDetails?: any;
  diffType: 'missed' | 'false_positive' | 'rule_changed';
}

export interface ComparisonReport {
  sessionId: string;
  totalEvents: number;
  missedCount: number;
  falsePositiveCount: number;
  ruleChangedCount: number;
  consistentCount: number;
  missedEvents: ComparisonDiffItem[];
  falsePositiveEvents: ComparisonDiffItem[];
  ruleChangedEvents: ComparisonDiffItem[];
  hotSwapDiff?: {
    hasCustomRules: boolean;
    totalEvents: number;
    missedCount: number;
    falsePositiveCount: number;
    ruleChangedCount: number;
    consistentCount: number;
    missedEvents: HotSwapDiffItem[];
    falsePositiveEvents: HotSwapDiffItem[];
    ruleChangedEvents: HotSwapDiffItem[];
  };
}

export interface CreateBookmarkDto {
  name: string;
  eventIndex: number;
  progressSnapshot: any;
}

export interface UpdateBookmarkDto {
  name?: string;
}

interface ActiveReplayState {
  mode: ReplayMode;
  speedMultiplier: number;
  events: ReplayEvent[];
  currentIndex: number;
  isPaused: boolean;
  breakpoints: BreakpointCondition[];
  breakpointLogicalOp: 'AND' | 'OR';
  timer?: NodeJS.Timeout;
  customRules?: CustomRuleSnapshot[];
  customResults?: Map<string, Array<{ ruleId: string; ruleName: string; matched: boolean; matchDetail?: any }>>;
  tenantId?: string;
}

@Injectable()
export class ReplayService {
  private readonly logger = new Logger(ReplayService.name);
  private readonly recordingSessionsKey = 'replay:recording:';
  private readonly progressKey = 'replay:progress:';
  private readonly hotSwapKey = 'replay:hot_swap:';
  private activeReplays: Map<string, ActiveReplayState> = new Map();

  constructor(
    @InjectRepository(ReplaySession)
    private readonly sessionRepository: Repository<ReplaySession>,
    @InjectRepository(ReplayEvent)
    private readonly eventRepository: Repository<ReplayEvent>,
    @InjectRepository(ReplayResult)
    private readonly resultRepository: Repository<ReplayResult>,
    @InjectRepository(ReplayBookmark)
    private readonly bookmarkRepository: Repository<ReplayBookmark>,
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,
    private readonly eventEmitter: EventEmitter2,
    private readonly redisService: RedisService,
  ) {}

  async listSessions(
    tenantId: string,
    page: number = 1,
    pageSize: number = 20,
    keyword?: string,
  ): Promise<{ items: ReplaySession[]; total: number; page: number; pageSize: number }> {
    const where: any = { tenantId };
    if (keyword) {
      where.name = Like(`%${keyword}%`);
    }
    const [items, total] = await this.sessionRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total, page, pageSize };
  }

  async getSession(tenantId: string, sessionId: string): Promise<ReplaySession> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId, tenantId } });
    if (!session) {
      throw new NotFoundException('录制会话不存在');
    }
    return session;
  }

  async startRecording(tenantId: string, dto: CreateSessionDto): Promise<ReplaySession> {
    const session = this.sessionRepository.create({
      tenantId,
      name: dto.name,
      description: dto.description,
      status: ReplaySessionStatus.RECORDING,
      startTime: new Date(),
    });
    const saved = await this.sessionRepository.save(session);
    await this.redisService.set(`${this.recordingSessionsKey}${tenantId}`, saved.id, 86400);
    this.logger.log(`Started recording session: ${saved.id} for tenant: ${tenantId}`);
    return saved;
  }

  async stopRecording(tenantId: string, sessionId: string): Promise<ReplaySession> {
    const session = await this.getSession(tenantId, sessionId);
    if (session.status !== ReplaySessionStatus.RECORDING) {
      throw new BadRequestException('该会话当前未在录制中');
    }
    session.status = ReplaySessionStatus.STOPPED;
    session.endTime = new Date();
    const saved = await this.sessionRepository.save(session);
    const currentRecordingId = await this.redisService.get(`${this.recordingSessionsKey}${tenantId}`);
    if (currentRecordingId === sessionId) {
      await this.redisService.del(`${this.recordingSessionsKey}${tenantId}`);
    }
    this.logger.log(`Stopped recording session: ${sessionId} for tenant: ${tenantId}`);
    return saved;
  }

  async getSessionEvents(
    tenantId: string,
    sessionId: string,
    page: number = 1,
    pageSize: number = 100,
  ): Promise<{ items: ReplayEvent[]; total: number }> {
    await this.getSession(tenantId, sessionId);
    const [items, total] = await this.eventRepository.findAndCount({
      where: { sessionId, tenantId },
      order: { recordedAt: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total };
  }

  @OnEvent('event.received')
  async handleEventForRecording(payload: { tenantId: string; event: Event }) {
    try {
      const { tenantId, event } = payload;
      const recordingSessionId = await this.redisService.get(`${this.recordingSessionsKey}${tenantId}`);
      if (!recordingSessionId) return;

      const matchedRules: string[] = [];
      const rules = await this.ruleRepository.find({
        where: { tenantId, isEnabled: true },
        order: { priority: 'DESC' },
      });
      for (const rule of rules) {
        const matched = await this.evaluateRuleQuiet(rule, event);
        if (matched) {
          matchedRules.push(rule.id);
        }
      }

      const replayEvent = this.eventRepository.create({
        sessionId: recordingSessionId,
        tenantId,
        eventSource: event.source,
        eventPayload: { ...event, timestamp: event.timestamp },
        originalMatchedRuleIds: matchedRules,
        originalTimestamp: event.timestamp,
      });
      await this.eventRepository.save(replayEvent);
    } catch (error) {
      this.logger.error('Error recording event for replay', error);
    }
  }

  private async evaluateRuleQuiet(rule: Rule | CustomRuleSnapshot, event: Event): Promise<boolean> {
    try {
      const ruleConditions = rule.conditions as RuleCondition;
      switch (rule.conditionType) {
        case ConditionType.SINGLE_THRESHOLD: {
          const condition = ruleConditions.conditions[0];
          if (!condition || !event.metricName || event.value === undefined) return false;
          if (event.metricName !== condition.metric) return false;
          return this.compareValue(event.value, condition.operator!, condition.value as number);
        }
        case ConditionType.MULTI_CONDITION: {
          const results = ruleConditions.conditions.map((condition) => {
            if (condition.type === 'threshold') {
              if (event.metricName !== condition.metric) return false;
              return event.value !== undefined && this.compareValue(event.value, condition.operator!, condition.value as number);
            } else if (condition.type === 'label') {
              const labelValue = event.labels?.[condition.label!];
              if (!labelValue) return false;
              return this.compareString(labelValue, condition.operator!, condition.labelValue!);
            }
            return false;
          });
          return ruleConditions.operator === 'AND' ? results.every((r) => r) : results.some((r) => r);
        }
        case ConditionType.LABEL_MATCH: {
          const condition = ruleConditions.conditions[0];
          if (!condition) return false;
          const labelValue = event.labels?.[condition.label!];
          if (!labelValue) return false;
          return this.compareString(labelValue, condition.operator!, condition.labelValue!);
        }
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  private compareValue(a: number, operator: string, b: number): boolean {
    switch (operator) {
      case 'gt':
        return a > b;
      case 'lt':
        return a < b;
      case 'gte':
        return a >= b;
      case 'lte':
        return a <= b;
      case 'eq':
        return a === b;
      case 'ne':
        return a !== b;
      default:
        return false;
    }
  }

  private compareString(a: string, operator: string, b: string): boolean {
    switch (operator) {
      case 'eq':
        return a === b;
      case 'ne':
        return a !== b;
      case 'contains':
        return a.includes(b);
      default:
        return false;
    }
  }

  async startReplay(tenantId: string, sessionId: string, dto: StartReplayDto): Promise<ReplayProgress> {
    const session = await this.getSession(tenantId, sessionId);
    if (session.status !== ReplaySessionStatus.STOPPED) {
      throw new BadRequestException('只能回放已停止的录制会话');
    }

    const existingState = this.activeReplays.get(sessionId);
    if (existingState) {
      if (existingState.timer) {
        clearTimeout(existingState.timer);
      }
      this.activeReplays.delete(sessionId);
    }

    const events = await this.eventRepository.find({
      where: { sessionId, tenantId },
      order: { recordedAt: 'ASC' },
    });

    if (events.length === 0) {
      throw new BadRequestException('该会话没有录制的事件');
    }

    await this.resultRepository.delete({ sessionId, tenantId });
    await this.redisService.del(`${this.hotSwapKey}${sessionId}`);

    const startIndex = dto.startEventIndex || 0;
    if (startIndex < 0 || startIndex >= events.length) {
      throw new BadRequestException('起始事件索引无效');
    }

    const customRules = dto.customRules?.length ? dto.customRules : undefined;

    const state: ActiveReplayState = {
      mode: dto.mode,
      speedMultiplier: dto.speedMultiplier || 1,
      events,
      currentIndex: startIndex,
      isPaused: false,
      breakpoints: dto.breakpoints || [],
      breakpointLogicalOp: dto.breakpointLogicalOp || 'OR',
      customRules,
      customResults: customRules ? new Map() : undefined,
      tenantId,
    };
    this.activeReplays.set(sessionId, state);

    const progress: ReplayProgress = {
      sessionId,
      totalEvents: events.length,
      replayedCount: startIndex,
      matchedCount: 0,
      hitRate: 0,
      isPaused: false,
      speedMultiplier: state.speedMultiplier,
    };
    await this.saveProgress(sessionId, progress);

    if (dto.mode !== ReplayMode.SINGLE_STEP) {
      this.scheduleNextEvent(sessionId, tenantId);
    }

    return progress;
  }

  async setSpeed(sessionId: string, speedMultiplier: number): Promise<ReplayProgress> {
    const state = this.activeReplays.get(sessionId);
    if (!state) {
      throw new BadRequestException('该会话没有进行中的回放');
    }
    if (state.mode === ReplayMode.SINGLE_STEP) {
      throw new BadRequestException('单步模式不支持调节速度');
    }
    if (speedMultiplier < 0.5 || speedMultiplier > 20) {
      throw new BadRequestException('速度倍速范围: 0.5x ~ 20x');
    }

    state.speedMultiplier = speedMultiplier;

    if (state.timer && !state.isPaused) {
      clearTimeout(state.timer);
      this.scheduleNextEvent(sessionId, state.tenantId!);
    }

    const progress = await this.getProgress(sessionId);
    progress.speedMultiplier = speedMultiplier;
    await this.saveProgress(sessionId, progress);
    return progress;
  }

  private scheduleNextEvent(sessionId: string, tenantId: string) {
    const state = this.activeReplays.get(sessionId);
    if (!state || state.isPaused) return;
    if (state.currentIndex >= state.events.length) {
      this.finishReplay(sessionId);
      return;
    }

    let delay = 0;
    if (state.mode === ReplayMode.REAL_TIME && state.currentIndex > 0) {
      const prevEvent = state.events[state.currentIndex - 1];
      const currEvent = state.events[state.currentIndex];
      delay = Math.max(0, currEvent.originalTimestamp.getTime() - prevEvent.originalTimestamp.getTime());
      delay = Math.floor(delay / state.speedMultiplier);
    } else if (state.mode === ReplayMode.ACCELERATED) {
      delay = Math.floor(1000 / state.speedMultiplier);
    }

    state.timer = setTimeout(() => {
      this.processNextEvent(sessionId, tenantId).catch((err) =>
        this.logger.error('Error processing replay event', err),
      );
    }, delay);
  }

  private async processNextEvent(sessionId: string, tenantId: string) {
    const state = this.activeReplays.get(sessionId);
    if (!state || state.isPaused) return;
    if (state.currentIndex >= state.events.length) {
      this.finishReplay(sessionId);
      return;
    }

    const event = state.events[state.currentIndex];

    if (state.breakpoints.length > 0 && this.checkBreakpoints(event, state.breakpoints, state.breakpointLogicalOp)) {
      state.isPaused = true;
      const breakpointRuleMatches = await this.getAllRuleMatchesForEvent(tenantId, event);
      const progress = await this.getProgress(sessionId);
      progress.isPaused = true;
      progress.pauseReason = 'breakpoint';
      progress.breakpointTriggeredEvent = event;
      progress.breakpointRuleMatches = breakpointRuleMatches;
      await this.saveProgress(sessionId, progress);
      this.eventEmitter.emit(`replay.paused.${sessionId}`, progress);
      return;
    }

    await this.replaySingleEvent(tenantId, sessionId, event);
    state.currentIndex++;

    if (state.currentIndex >= state.events.length) {
      this.finishReplay(sessionId);
    } else {
      this.scheduleNextEvent(sessionId, tenantId);
    }
  }

  private checkBreakpoints(
    event: ReplayEvent,
    breakpoints: BreakpointCondition[],
    logicalOp: 'AND' | 'OR',
  ): boolean {
    const results = breakpoints.map((bp) => {
      const value = this.getNestedField(event.eventPayload, bp.field);
      if (value === undefined || value === null) return false;
      const numValue = typeof value === 'number' ? value : parseFloat(String(value));
      const bpNumValue = typeof bp.value === 'number' ? bp.value : parseFloat(String(bp.value));

      switch (bp.operator) {
        case 'eq':
          return String(value) === String(bp.value);
        case 'ne':
          return String(value) !== String(bp.value);
        case 'gt':
          return !isNaN(numValue) && !isNaN(bpNumValue) && numValue > bpNumValue;
        case 'lt':
          return !isNaN(numValue) && !isNaN(bpNumValue) && numValue < bpNumValue;
        case 'gte':
          return !isNaN(numValue) && !isNaN(bpNumValue) && numValue >= bpNumValue;
        case 'lte':
          return !isNaN(numValue) && !isNaN(bpNumValue) && numValue <= bpNumValue;
        case 'contains':
          return String(value).includes(String(bp.value));
        default:
          return false;
      }
    });

    return logicalOp === 'AND' ? results.every((r) => r) : results.some((r) => r);
  }

  private getNestedField(obj: any, path: string): any {
    return path.split('.').reduce((o, key) => (o === undefined || o === null ? undefined : o[key]), obj);
  }

  private async getAllRuleMatchesForEvent(
    tenantId: string,
    event: ReplayEvent,
  ): Promise<Array<{ ruleId: string; ruleName: string; matched: boolean; reason: string }>> {
    const rules = await this.ruleRepository.find({
      where: { tenantId, isEnabled: true },
      order: { priority: 'DESC' },
    });
    const eventObj = event.eventPayload as Event;
    const results = [];
    for (const rule of rules) {
      try {
        const matched = await this.evaluateRuleQuiet(rule, eventObj);
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          matched,
          reason: matched ? '规则条件匹配成功' : '规则条件不匹配',
        });
      } catch (err: any) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          matched: false,
          reason: `评估错误: ${err.message}`,
        });
      }
    }
    return results;
  }

  private evaluateCustomRules(event: Event, customRules: CustomRuleSnapshot[]): Array<{ ruleId: string; ruleName: string; matched: boolean; matchDetail?: any }> {
    const results: Array<{ ruleId: string; ruleName: string; matched: boolean; matchDetail?: any }> = [];

    for (const rule of customRules) {
      const matchDetails: Array<{ condition: string; passed: boolean; reason: string }> = [];
      let matched = false;
      try {
        const ruleConditions = rule.conditions as RuleCondition;
        switch (rule.conditionType) {
          case ConditionType.SINGLE_THRESHOLD: {
            const condition = ruleConditions.conditions[0];
            if (!condition || !event.metricName || event.value === undefined) {
              matchDetails.push({ condition: '单指标阈值', passed: false, reason: '事件缺少必要字段' });
            } else if (event.metricName !== condition.metric) {
              matchDetails.push({
                condition: `指标名称: ${event.metricName} vs ${condition.metric}`,
                passed: false,
                reason: '指标名称不匹配',
              });
            } else {
              const valueMatched = this.compareValue(event.value, condition.operator!, condition.value as number);
              matchDetails.push({
                condition: `阈值比较: ${event.value} ${condition.operator} ${condition.value}`,
                passed: valueMatched,
                reason: valueMatched ? '阈值满足' : '阈值不满足',
              });
              matched = valueMatched;
            }
            break;
          }
          case ConditionType.MULTI_CONDITION: {
            for (let i = 0; i < ruleConditions.conditions.length; i++) {
              const cond = ruleConditions.conditions[i];
              if (cond.type === 'threshold') {
                if (event.metricName !== cond.metric) {
                  matchDetails.push({
                    condition: `[${i + 1}] 指标匹配`,
                    passed: false,
                    reason: `${event.metricName} ≠ ${cond.metric}`,
                  });
                } else {
                  const vm = event.value !== undefined && this.compareValue(event.value, cond.operator!, cond.value as number);
                  matchDetails.push({
                    condition: `[${i + 1}] 阈值: ${event.value} ${cond.operator} ${cond.value}`,
                    passed: vm,
                    reason: vm ? '满足' : '不满足',
                  });
                }
              } else if (cond.type === 'label') {
                const lv = event.labels?.[cond.label!];
                if (!lv) {
                  matchDetails.push({ condition: `[${i + 1}] 标签: ${cond.label}`, passed: false, reason: '标签不存在' });
                } else {
                  const lm = this.compareString(lv, cond.operator!, cond.labelValue!);
                  matchDetails.push({
                    condition: `[${i + 1}] 标签: ${cond.label}=${lv} ${cond.operator} ${cond.labelValue}`,
                    passed: lm,
                    reason: lm ? '满足' : '不满足',
                  });
                }
              }
            }
            matched =
              ruleConditions.operator === 'AND' ? matchDetails.every((d) => d.passed) : matchDetails.some((d) => d.passed);
            break;
          }
          case ConditionType.LABEL_MATCH: {
            const condition = ruleConditions.conditions[0];
            if (!condition) {
              matchDetails.push({ condition: '标签匹配', passed: false, reason: '规则未配置' });
            } else {
              const lv = event.labels?.[condition.label!];
              if (!lv) {
                matchDetails.push({ condition: `标签: ${condition.label}`, passed: false, reason: '标签不存在' });
              } else {
                const lm = this.compareString(lv, condition.operator!, condition.labelValue!);
                matchDetails.push({
                  condition: `标签: ${condition.label}=${lv} ${condition.operator} ${condition.labelValue}`,
                  passed: lm,
                  reason: lm ? '满足' : '不满足',
                });
                matched = lm;
              }
            }
            break;
          }
          default: {
            matchDetails.push({
              condition: `条件类型: ${rule.conditionType}`,
              passed: false,
              reason: '回放模式暂不支持该条件类型的完整评估',
            });
          }
        }
      } catch (err: any) {
        matchDetails.push({ condition: '异常', passed: false, reason: err.message });
      }

      results.push({
        ruleId: rule.id || `custom_${rule.name}`,
        ruleName: rule.name,
        matched,
        matchDetail: { conditions: matchDetails },
      });
    }

    return results;
  }

  private async replaySingleEvent(tenantId: string, sessionId: string, event: ReplayEvent) {
    const state = this.activeReplays.get(sessionId);
    const rules = await this.ruleRepository.find({
      where: { tenantId, isEnabled: true },
      order: { priority: 'DESC' },
    });
    const eventObj = event.eventPayload as Event;
    const savedResults: ReplayResult[] = [];

    for (const rule of rules) {
      const matchDetails: Array<{ condition: string; passed: boolean; reason: string }> = [];
      let matched = false;
      try {
        switch (rule.conditionType) {
          case ConditionType.SINGLE_THRESHOLD: {
            const condition = (rule.conditions as RuleCondition).conditions[0];
            if (!condition || !eventObj.metricName || eventObj.value === undefined) {
              matchDetails.push({ condition: '单指标阈值', passed: false, reason: '事件缺少必要字段' });
            } else if (eventObj.metricName !== condition.metric) {
              matchDetails.push({
                condition: `指标名称: ${eventObj.metricName} vs ${condition.metric}`,
                passed: false,
                reason: '指标名称不匹配',
              });
            } else {
              const valueMatched = this.compareValue(eventObj.value, condition.operator!, condition.value as number);
              matchDetails.push({
                condition: `阈值比较: ${eventObj.value} ${condition.operator} ${condition.value}`,
                passed: valueMatched,
                reason: valueMatched ? '阈值满足' : '阈值不满足',
              });
              matched = valueMatched;
            }
            break;
          }
          case ConditionType.MULTI_CONDITION: {
            const ruleCondition = rule.conditions as RuleCondition;
            for (let i = 0; i < ruleCondition.conditions.length; i++) {
              const cond = ruleCondition.conditions[i];
              if (cond.type === 'threshold') {
                if (eventObj.metricName !== cond.metric) {
                  matchDetails.push({
                    condition: `[${i + 1}] 指标匹配`,
                    passed: false,
                    reason: `${eventObj.metricName} ≠ ${cond.metric}`,
                  });
                } else {
                  const vm = eventObj.value !== undefined && this.compareValue(eventObj.value, cond.operator!, cond.value as number);
                  matchDetails.push({
                    condition: `[${i + 1}] 阈值: ${eventObj.value} ${cond.operator} ${cond.value}`,
                    passed: vm,
                    reason: vm ? '满足' : '不满足',
                  });
                }
              } else if (cond.type === 'label') {
                const lv = eventObj.labels?.[cond.label!];
                if (!lv) {
                  matchDetails.push({ condition: `[${i + 1}] 标签: ${cond.label}`, passed: false, reason: '标签不存在' });
                } else {
                  const lm = this.compareString(lv, cond.operator!, cond.labelValue!);
                  matchDetails.push({
                    condition: `[${i + 1}] 标签: ${cond.label}=${lv} ${cond.operator} ${cond.labelValue}`,
                    passed: lm,
                    reason: lm ? '满足' : '不满足',
                  });
                }
              }
            }
            matched =
              ruleCondition.operator === 'AND' ? matchDetails.every((d) => d.passed) : matchDetails.some((d) => d.passed);
            break;
          }
          case ConditionType.LABEL_MATCH: {
            const condition = (rule.conditions as RuleCondition).conditions[0];
            if (!condition) {
              matchDetails.push({ condition: '标签匹配', passed: false, reason: '规则未配置' });
            } else {
              const lv = eventObj.labels?.[condition.label!];
              if (!lv) {
                matchDetails.push({ condition: `标签: ${condition.label}`, passed: false, reason: '标签不存在' });
              } else {
                const lm = this.compareString(lv, condition.operator!, condition.labelValue!);
                matchDetails.push({
                  condition: `标签: ${condition.label}=${lv} ${condition.operator} ${condition.labelValue}`,
                  passed: lm,
                  reason: lm ? '满足' : '不满足',
                });
                matched = lm;
              }
            }
            break;
          }
          default: {
            matchDetails.push({
              condition: `条件类型: ${rule.conditionType}`,
              passed: false,
              reason: '回放模式暂不支持该条件类型的完整评估',
            });
          }
        }
      } catch (err: any) {
        matchDetails.push({ condition: '异常', passed: false, reason: err.message });
      }

      const result = this.resultRepository.create({
        sessionId,
        tenantId,
        eventId: event.id,
        ruleId: rule.id,
        matched,
        matchDetail: { conditions: matchDetails },
      });
      savedResults.push(await this.resultRepository.save(result));
    }

    let customMatchResults: Array<{ ruleId: string; ruleName: string; matched: boolean; matchDetail?: any }> | undefined;
    if (state?.customRules?.length) {
      customMatchResults = this.evaluateCustomRules(eventObj, state.customRules);
      state.customResults!.set(event.id, customMatchResults);
    }

    const progress = await this.getProgress(sessionId);
    progress.replayedCount++;
    if (savedResults.some((r) => r.matched)) {
      progress.matchedCount++;
    }
    progress.hitRate = progress.totalEvents > 0 ? progress.matchedCount / progress.replayedCount : 0;
    progress.currentEvent = event;
    progress.currentMatchResults = savedResults.filter((r) => r.matched);
    if (customMatchResults) {
      progress.currentCustomMatchResults = customMatchResults.filter((r) => r.matched);
    }
    progress.speedMultiplier = state?.speedMultiplier || 1;
    await this.saveProgress(sessionId, progress);
    this.eventEmitter.emit(`replay.progress.${sessionId}`, progress);
  }

  private async finishReplay(sessionId: string) {
    const state = this.activeReplays.get(sessionId);
    if (state?.timer) {
      clearTimeout(state.timer);
    }

    if (state?.customRules?.length && state.customResults && state.tenantId) {
      try {
        const hotSwapResult = await this.computeHotSwapComparisonFromState(sessionId, state);
        await this.redisService.set(
          `${this.hotSwapKey}${sessionId}`,
          JSON.stringify(hotSwapResult),
          86400,
        );
      } catch (err) {
        this.logger.error('Failed to save hot swap result to redis', err);
      }
    }

    this.activeReplays.delete(sessionId);
    this.eventEmitter.emit(`replay.finished.${sessionId}`, { sessionId });
    this.logger.log(`Replay finished for session: ${sessionId}`);
  }

  private async saveProgress(sessionId: string, progress: ReplayProgress) {
    await this.redisService.set(`${this.progressKey}${sessionId}`, JSON.stringify(progress), 3600);
  }

  async getProgress(sessionId: string): Promise<ReplayProgress> {
    const cached = await this.redisService.get(`${this.progressKey}${sessionId}`);
    if (cached) {
      return JSON.parse(cached);
    }
    const totalEvents = await this.eventRepository.count({ where: { sessionId } });
    const replayedCount = await this.resultRepository
      .createQueryBuilder('r')
      .select('COUNT(DISTINCT r.event_id)', 'count')
      .where('r.session_id = :sessionId', { sessionId })
      .getRawOne();
    const matchedCount = await this.resultRepository.count({ where: { sessionId, matched: true } });
    return {
      sessionId,
      totalEvents,
      replayedCount: parseInt(replayedCount?.count || '0', 10),
      matchedCount,
      hitRate: totalEvents > 0 ? matchedCount / parseInt(replayedCount?.count || '1', 10) : 0,
      isPaused: false,
      speedMultiplier: 1,
    };
  }

  async singleStepNext(tenantId: string, sessionId: string): Promise<ReplayProgress> {
    const state = this.activeReplays.get(sessionId);
    if (!state) {
      throw new BadRequestException('该会话没有进行中的回放，请先启动回放');
    }
    if (state.mode !== ReplayMode.SINGLE_STEP && !state.isPaused) {
      throw new BadRequestException('仅单步模式或已暂停的回放可以手动步进');
    }
    if (state.currentIndex >= state.events.length) {
      throw new BadRequestException('所有事件已回放完毕');
    }
    state.isPaused = false;
    const event = state.events[state.currentIndex];
    await this.replaySingleEvent(tenantId, sessionId, event);
    state.currentIndex++;
    if (state.currentIndex >= state.events.length) {
      this.finishReplay(sessionId);
    }
    state.isPaused = state.mode === ReplayMode.SINGLE_STEP;
    return this.getProgress(sessionId);
  }

  async pauseReplay(sessionId: string): Promise<ReplayProgress> {
    const state = this.activeReplays.get(sessionId);
    if (!state) {
      throw new BadRequestException('该会话没有进行中的回放');
    }
    state.isPaused = true;
    if (state.timer) {
      clearTimeout(state.timer);
    }
    const progress = await this.getProgress(sessionId);
    progress.isPaused = true;
    progress.pauseReason = 'manual';
    await this.saveProgress(sessionId, progress);
    return progress;
  }

  async resumeReplay(tenantId: string, sessionId: string): Promise<ReplayProgress> {
    const state = this.activeReplays.get(sessionId);
    if (!state) {
      throw new BadRequestException('该会话没有进行中的回放');
    }
    if (!state.isPaused) {
      throw new BadRequestException('该回放未处于暂停状态');
    }
    state.isPaused = false;
    const progress = await this.getProgress(sessionId);
    progress.isPaused = false;
    progress.pauseReason = undefined;
    progress.breakpointTriggeredEvent = undefined;
    progress.breakpointRuleMatches = undefined;
    await this.saveProgress(sessionId, progress);
    if (state.mode !== ReplayMode.SINGLE_STEP) {
      this.scheduleNextEvent(sessionId, tenantId);
    }
    return progress;
  }

  async stopReplay(sessionId: string): Promise<void> {
    const state = this.activeReplays.get(sessionId);
    if (state?.timer) {
      clearTimeout(state.timer);
    }
    this.activeReplays.delete(sessionId);
    await this.redisService.del(`${this.progressKey}${sessionId}`);
  }

  async setBreakpoints(sessionId: string, dto: SetBreakpointsDto): Promise<void> {
    const state = this.activeReplays.get(sessionId);
    if (!state) {
      throw new BadRequestException('该会话没有进行中的回放');
    }
    state.breakpoints = dto.conditions || [];
    state.breakpointLogicalOp = dto.logicalOp || 'OR';
  }

  async getComparisonReport(tenantId: string, sessionId: string): Promise<ComparisonReport> {
    await this.getSession(tenantId, sessionId);
    const events = await this.eventRepository.find({
      where: { sessionId, tenantId },
      order: { recordedAt: 'ASC' },
    });
    const replayedEventIds = await this.resultRepository
      .createQueryBuilder('r')
      .select('DISTINCT r.event_id', 'eventId')
      .where('r.session_id = :sessionId', { sessionId })
      .getRawMany()
      .then((rows) => rows.map((r) => r.eventId));

    const replayedEvents = events.filter((e) => replayedEventIds.includes(e.id));

    const missedEvents: ComparisonDiffItem[] = [];
    const falsePositiveEvents: ComparisonDiffItem[] = [];
    const ruleChangedEvents: ComparisonDiffItem[] = [];
    let consistentCount = 0;

    for (const event of replayedEvents) {
      const replayResults = await this.resultRepository.find({
        where: { eventId: event.id, matched: true },
      });
      const replayedMatchedRuleIds = replayResults.map((r) => r.ruleId).sort();
      const originalMatchedRuleIds = [...event.originalMatchedRuleIds].sort();

      const originalStr = originalMatchedRuleIds.join(',');
      const replayedStr = replayedMatchedRuleIds.join(',');
      const replayedMatchDetails = replayResults.map((r) => ({
        ruleId: r.ruleId,
        matchDetail: r.matchDetail,
      }));

      if (originalStr === replayedStr) {
        consistentCount++;
        continue;
      }

      const diffItem: ComparisonDiffItem = {
        eventId: event.id,
        eventPayload: event.eventPayload,
        eventSource: event.eventSource,
        eventTimestamp: event.originalTimestamp.toISOString(),
        originalMatchedRuleIds,
        replayedMatchedRuleIds,
        replayedMatchDetails,
        diffType: 'rule_changed',
      };

      const originallyHadMatches = originalMatchedRuleIds.length > 0;
      const replayedHasMatches = replayedMatchedRuleIds.length > 0;

      if (originallyHadMatches && !replayedHasMatches) {
        diffItem.diffType = 'missed';
        missedEvents.push(diffItem);
      } else if (!originallyHadMatches && replayedHasMatches) {
        diffItem.diffType = 'false_positive';
        falsePositiveEvents.push(diffItem);
      } else {
        ruleChangedEvents.push(diffItem);
      }
    }

    const report: ComparisonReport = {
      sessionId,
      totalEvents: replayedEvents.length,
      missedCount: missedEvents.length,
      falsePositiveCount: falsePositiveEvents.length,
      ruleChangedCount: ruleChangedEvents.length,
      consistentCount,
      missedEvents,
      falsePositiveEvents,
      ruleChangedEvents,
    };

    return report;
  }

  async getHotSwapComparison(tenantId: string, sessionId: string): Promise<ComparisonReport['hotSwapDiff']> {
    const cached = await this.redisService.get(`${this.hotSwapKey}${sessionId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    const state = this.activeReplays.get(sessionId);
    if (!state?.customRules?.length || !state.customResults) {
      return {
        hasCustomRules: false,
        totalEvents: 0,
        missedCount: 0,
        falsePositiveCount: 0,
        ruleChangedCount: 0,
        consistentCount: 0,
        missedEvents: [],
        falsePositiveEvents: [],
        ruleChangedEvents: [],
      };
    }

    return this.computeHotSwapComparisonFromState(sessionId, state);
  }

  private async computeHotSwapComparisonFromState(
    sessionId: string,
    state: ActiveReplayState,
  ): Promise<NonNullable<ComparisonReport['hotSwapDiff']>> {
    const events = state.events.slice(0, state.currentIndex);
    const missedEvents: HotSwapDiffItem[] = [];
    const falsePositiveEvents: HotSwapDiffItem[] = [];
    const ruleChangedEvents: HotSwapDiffItem[] = [];
    let consistentCount = 0;

    for (const event of events) {
      const currentResults = await this.resultRepository.find({
        where: { eventId: event.id, matched: true },
      });
      const currentRuleIds = currentResults.map((r) => r.ruleId).sort();
      const currentMatchDetails = currentResults.map((r) => ({
        ruleId: r.ruleId,
        matchDetail: r.matchDetail,
      }));

      const customResults = state.customResults!.get(event.id) || [];
      const customRuleIds = customResults.filter((r) => r.matched).map((r) => r.ruleId).sort();
      const customMatchDetails = customResults.map((r) => ({
        ruleId: r.ruleId,
        matchDetail: r.matchDetail,
      }));

      const currentStr = currentRuleIds.join(',');
      const customStr = customRuleIds.join(',');

      if (currentStr === customStr) {
        consistentCount++;
        continue;
      }

      const diffItem: HotSwapDiffItem = {
        eventId: event.id,
        eventPayload: event.eventPayload,
        eventSource: event.eventSource,
        eventTimestamp: event.originalTimestamp.toISOString(),
        currentRuleIds,
        customRuleIds,
        currentMatchDetails,
        customMatchDetails,
        diffType: 'rule_changed',
      };

      const currentHasMatches = currentRuleIds.length > 0;
      const customHasMatches = customRuleIds.length > 0;

      if (currentHasMatches && !customHasMatches) {
        diffItem.diffType = 'missed';
        missedEvents.push(diffItem);
      } else if (!currentHasMatches && customHasMatches) {
        diffItem.diffType = 'false_positive';
        falsePositiveEvents.push(diffItem);
      } else {
        ruleChangedEvents.push(diffItem);
      }
    }

    return {
      hasCustomRules: true,
      totalEvents: events.length,
      missedCount: missedEvents.length,
      falsePositiveCount: falsePositiveEvents.length,
      ruleChangedCount: ruleChangedEvents.length,
      consistentCount,
      missedEvents,
      falsePositiveEvents,
      ruleChangedEvents,
    };
  }

  async exportReportJson(tenantId: string, sessionId: string): Promise<any> {
    const report = await this.getComparisonReport(tenantId, sessionId);
    const hotSwap = await this.getHotSwapComparison(tenantId, sessionId);
    return {
      ...report,
      hotSwapDiff: hotSwap,
      exportedAt: new Date().toISOString(),
    };
  }

  async exportReportCsv(tenantId: string, sessionId: string): Promise<string> {
    const report = await this.getComparisonReport(tenantId, sessionId);
    const allDiffs = [
      ...report.missedEvents.map((e) => ({ ...e, diffType: '漏报' as const })),
      ...report.falsePositiveEvents.map((e) => ({ ...e, diffType: '误报' as const })),
      ...report.ruleChangedEvents.map((e) => ({ ...e, diffType: '规则变更' as const })),
    ];

    const headers = ['事件ID', '事件源', '差异类型', '原始命中规则', '回放命中规则', '时间戳'];
    const rows = allDiffs.map((item) => [
      item.eventId,
      item.eventSource || '',
      item.diffType,
      item.originalMatchedRuleIds.join('; '),
      item.replayedMatchedRuleIds.join('; '),
      item.eventTimestamp || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
  }

  async listBookmarks(tenantId: string, sessionId: string): Promise<ReplayBookmark[]> {
    await this.getSession(tenantId, sessionId);
    return this.bookmarkRepository.find({
      where: { sessionId, tenantId },
      order: { createdAt: 'ASC' },
    });
  }

  async createBookmark(tenantId: string, sessionId: string, dto: CreateBookmarkDto): Promise<ReplayBookmark> {
    await this.getSession(tenantId, sessionId);
    const bookmark = this.bookmarkRepository.create({
      sessionId,
      tenantId,
      name: dto.name,
      eventIndex: dto.eventIndex,
      progressSnapshot: dto.progressSnapshot,
    });
    return this.bookmarkRepository.save(bookmark);
  }

  async updateBookmark(tenantId: string, sessionId: string, bookmarkId: string, dto: UpdateBookmarkDto): Promise<ReplayBookmark> {
    const bookmark = await this.bookmarkRepository.findOne({
      where: { id: bookmarkId, sessionId, tenantId },
    });
    if (!bookmark) {
      throw new NotFoundException('书签不存在');
    }
    if (dto.name !== undefined) {
      bookmark.name = dto.name;
    }
    return this.bookmarkRepository.save(bookmark);
  }

  async deleteBookmark(tenantId: string, sessionId: string, bookmarkId: string): Promise<void> {
    const bookmark = await this.bookmarkRepository.findOne({
      where: { id: bookmarkId, sessionId, tenantId },
    });
    if (!bookmark) {
      throw new NotFoundException('书签不存在');
    }
    await this.bookmarkRepository.remove(bookmark);
  }

  async getBookmark(tenantId: string, sessionId: string, bookmarkId: string): Promise<ReplayBookmark> {
    const bookmark = await this.bookmarkRepository.findOne({
      where: { id: bookmarkId, sessionId, tenantId },
    });
    if (!bookmark) {
      throw new NotFoundException('书签不存在');
    }
    return bookmark;
  }

  async archiveSession(tenantId: string, sessionId: string): Promise<ReplaySession> {
    const session = await this.getSession(tenantId, sessionId);
    if (session.status === ReplaySessionStatus.RECORDING) {
      throw new BadRequestException('请先停止录制再归档');
    }
    session.status = ReplaySessionStatus.ARCHIVED;
    return this.sessionRepository.save(session);
  }

  async deleteSession(tenantId: string, sessionId: string): Promise<void> {
    await this.getSession(tenantId, sessionId);
    await this.stopReplay(sessionId);
    await this.bookmarkRepository.delete({ sessionId, tenantId });
    await this.resultRepository.delete({ sessionId, tenantId });
    await this.eventRepository.delete({ sessionId, tenantId });
    await this.sessionRepository.delete({ id: sessionId, tenantId });
  }
}
