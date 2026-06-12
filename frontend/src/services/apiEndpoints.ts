import { api } from './api';

export interface Alert {
  id: string;
  tenantId: string;
  ruleId?: string;
  fingerprint: string;
  name: string;
  severity: 'info' | 'warning' | 'critical' | 'fatal';
  status: 'pending' | 'acknowledged' | 'processing' | 'resolved';
  labels?: Record<string, string>;
  value?: number;
  count: number;
  firstTriggeredAt: string;
  lastTriggeredAt: string;
  acknowledgedAt?: string;
  processingAt?: string;
  resolvedAt?: string;
  resolvedReason?: string;
  escalationLevel: number;
}

export interface Rule {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  severity: 'info' | 'warning' | 'critical' | 'fatal';
  conditionType: string;
  conditions: any;
  dsl?: string;
  priority: number;
  isEnabled: boolean;
  windowSize: number;
  groupByLabels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RuleTemplate {
  id: string;
  tenantId?: string;
  type: 'system' | 'custom';
  name: string;
  description?: string;
  severity: 'info' | 'warning' | 'critical' | 'fatal';
  conditionType: string;
  conditions: any;
  dsl?: string;
  priority: number;
  windowSize: number;
  groupByLabels: string[];
  sceneTags: string[];
  suggestedThreshold?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportResult {
  success: number;
  skipped: number;
  failed: number;
  results: Array<{
    name: string;
    status: string;
    message?: string;
    newName?: string;
  }>;
}

export interface DashboardStats {
  activeAlerts: {
    total: number;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
  };
  metrics: {
    mtta: number;
    mttr: number;
  };
  notifications: {
    total: number;
    byChannel: Record<string, number>;
    successRate: number;
  };
  queue: {
    size: number;
    discarded: number;
  };
}

export interface RuleHitStats {
  ruleId: string;
  ruleName: string;
  hits: number;
  trend: Array<{ timestamp: string; count: number }>;
}

export interface AlertTimeline {
  id: string;
  name: string;
  severity: string;
  status: string;
  timestamp: string;
  count: number;
}

export interface AlertGroup {
  fingerprint: string;
  name: string;
  severity: 'info' | 'warning' | 'critical' | 'fatal';
  labels: Record<string, string>;
  alerts: Alert[];
  count: number;
  lastTriggeredAt: string;
}

export interface AlertHistoryItem {
  id: string;
  alertId: string;
  oldStatus?: string;
  newStatus: string;
  operatorId?: string;
  remark?: string;
  createdAt: string;
}

export interface SimulateResult {
  matched: boolean;
  matchDetails: Array<{ condition: string; passed: boolean; reason: string }>;
  aggregationWindowStatus?: { eventCount: number; aggregateResult?: number };
}

export interface NotificationItem {
  id: string;
  tenantId: string;
  alertId: string;
  channelId: string;
  channelType: string;
  recipient: string;
  content: string;
  status: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: string;
  errorMessage?: string;
  sentAt?: string;
  createdAt: string;
}

export interface InhibitRuleItem {
  id: string;
  tenantId: string;
  name: string;
  sourceMatchers: Array<{ label: string; value: string; type: string }>;
  targetMatchers: Array<{ label: string; value: string; type: string }>;
  equalLabels: string[];
  isEnabled: boolean;
  createdAt: string;
}

export interface RuleVersion {
  id: string;
  ruleId: string;
  versionNumber: number;
  snapshot: any;
  changeSummary: string;
  createdBy: string;
  createdAt: string;
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

export interface VersionDiffResult {
  versionA: RuleVersion;
  versionB: RuleVersion;
  diff: DiffResult;
}

export interface BatchRollbackResult {
  success: string[];
  failed: Array<{ ruleId: string; reason: string }>;
}

export interface LockCheckResult {
  lockedRuleIds: string[];
}

export const versionsApi = {
  getVersions: (ruleId: string, params?: { startTime?: string; endTime?: string; createdBy?: string }) =>
    api.get<RuleVersion[]>(`/api/v1/rules/${ruleId}/versions`, { params }),
  getVersion: (ruleId: string, versionId: string) =>
    api.get<RuleVersion>(`/api/v1/rules/${ruleId}/versions/${versionId}`),
  getVersionCreators: (ruleId: string) =>
    api.get<string[]>(`/api/v1/rules/${ruleId}/versions/creators`),
  diffVersions: (ruleId: string, versionIdA: string, versionIdB: string) =>
    api.post<VersionDiffResult>(`/api/v1/rules/${ruleId}/versions/diff`, { versionIdA, versionIdB }),
  rollback: (ruleId: string, versionId: string, rolledBackBy: string) =>
    api.post<Rule>(`/api/v1/rules/${ruleId}/versions/${versionId}/rollback`, { rolledBackBy }),
  batchRollback: (ruleIds: string[], rolledBackBy: string) =>
    api.post<BatchRollbackResult>('/api/v1/rule-versions/batch-rollback', { ruleIds, rolledBackBy }),
  checkLocks: (ruleIds: string[]) =>
    api.post<LockCheckResult>('/api/v1/rules/check-locks', { ruleIds }),
};

export const alertsApi = {
  getAlerts: (params?: any) => api.get<Alert[]>('/api/v1/alerts', { params }),
  getAlertsGrouped: (params?: any) => api.get<AlertGroup[]>('/api/v1/alerts/grouped', { params }),
  getAlert: (id: string) => api.get<Alert>(`/api/v1/alerts/${id}`),
  getAlertHistory: (id: string) => api.get<AlertHistoryItem[]>(`/api/v1/alerts/${id}/history`),
  acknowledge: (id: string, remark?: string) =>
    api.post<Alert>(`/api/v1/alerts/${id}/acknowledge`, { remark }),
  process: (id: string, remark?: string) =>
    api.post<Alert>(`/api/v1/alerts/${id}/process`, { remark }),
  resolve: (id: string, remark?: string, resolvedReason?: string) =>
    api.post<Alert>(`/api/v1/alerts/${id}/resolve`, { remark, resolvedReason }),
  batchAcknowledge: (ids: string[]) =>
    api.post<{ operated: number; skipped: number; details: Array<{ id: string; success: boolean; reason: string }> }>('/api/v1/alerts/batch/acknowledge', { ids }),
  batchResolve: (ids: string[], resolvedReason: string) =>
    api.post<{ operated: number; skipped: number; details: Array<{ id: string; success: boolean; reason: string }> }>('/api/v1/alerts/batch/resolve', { ids, resolvedReason }),
};

export const rulesApi = {
  getRules: () => api.get<Rule[]>('/api/v1/rules'),
  getRule: (id: string) => api.get<Rule>(`/api/v1/rules/${id}`),
  createRule: (data: Partial<Rule>) => api.post<Rule>('/api/v1/rules', data),
  updateRule: (id: string, data: Partial<Rule>) => api.put<Rule>(`/api/v1/rules/${id}`, data),
  deleteRule: (id: string) => api.delete(`/api/v1/rules/${id}`),
  enableRule: (id: string) => api.post<Rule>(`/api/v1/rules/${id}/enable`),
  disableRule: (id: string) => api.post<Rule>(`/api/v1/rules/${id}/disable`),
  parseDsl: (dsl: string) => api.post('/api/v1/rules/parse-dsl', { dsl }),
  exportRules: (ruleIds?: string[]) => api.post('/api/v1/rules/export', { ruleIds }, { responseType: 'blob' }),
  importRules: (rules: any[], conflictStrategy: 'skip' | 'overwrite' | 'rename') =>
    api.post<ImportResult>('/api/v1/rules/import', { rules, conflictStrategy }),
  simulateRule: (id: string, data: { metricName?: string; value?: number; labels?: Record<string, string>; timestamp?: string }) =>
    api.post<SimulateResult>(`/api/v1/rules/${id}/simulate`, data),
};

export const templatesApi = {
  getTemplates: (params?: { keyword?: string; sceneTag?: string; type?: string }) =>
    api.get<RuleTemplate[]>('/api/v1/rule-templates', { params }),
  getTemplate: (id: string) => api.get<RuleTemplate>(`/api/v1/rule-templates/${id}`),
  createTemplate: (data: Partial<RuleTemplate>) => api.post<RuleTemplate>('/api/v1/rule-templates', data),
  createTemplateFromRule: (ruleId: string, name: string, sceneTags?: string[]) =>
    api.post<RuleTemplate>(`/api/v1/rule-templates/from-rule/${ruleId}`, { name, sceneTags }),
  updateTemplate: (id: string, data: Partial<RuleTemplate>) =>
    api.put<RuleTemplate>(`/api/v1/rule-templates/${id}`, data),
  deleteTemplate: (id: string) => api.delete(`/api/v1/rule-templates/${id}`),
  getSceneTags: () => api.get<string[]>('/api/v1/rule-templates/scene-tags'),
};

export const dashboardApi = {
  getStats: (params?: any) => api.get<DashboardStats>('/api/v1/dashboard/stats', { params }),
  getRuleHits: (params?: any) => api.get<RuleHitStats[]>('/api/v1/dashboard/rule-hits', { params }),
  getAlertTimeline: (params?: any) => api.get<AlertTimeline[]>('/api/v1/dashboard/alert-timeline', { params }),
};

export const silencesApi = {
  getSilences: () => api.get('/api/v1/alerts/silences'),
  createSilence: (data: any) => api.post('/api/v1/alerts/silences', data),
  deleteSilence: (id: string) => api.delete(`/api/v1/alerts/silences/${id}`),
};

export const inhibitApi = {
  getInhibitRules: () => api.get('/api/v1/alerts/inhibit-rules'),
  createInhibitRule: (data: any) => api.post('/api/v1/alerts/inhibit-rules', data),
  deleteInhibitRule: (id: string) => api.delete(`/api/v1/alerts/inhibit-rules/${id}`),
  enableInhibitRule: (id: string) => api.post(`/api/v1/alerts/inhibit-rules/${id}/enable`),
  disableInhibitRule: (id: string) => api.post(`/api/v1/alerts/inhibit-rules/${id}/disable`),
};

export const channelsApi = {
  getChannels: () => api.get('/api/v1/channels'),
  createChannel: (data: any) => api.post('/api/v1/channels', data),
  updateChannel: (id: string, data: any) => api.put(`/api/v1/channels/${id}`, data),
  deleteChannel: (id: string) => api.delete(`/api/v1/channels/${id}`),
  enableChannel: (id: string) => api.post(`/api/v1/channels/${id}/enable`),
  disableChannel: (id: string) => api.post(`/api/v1/channels/${id}/disable`),
};

export const policiesApi = {
  getPolicies: () => api.get('/api/v1/policies'),
  createPolicy: (data: any) => api.post('/api/v1/policies', data),
  updatePolicy: (id: string, data: any) => api.put(`/api/v1/policies/${id}`, data),
  deletePolicy: (id: string) => api.delete(`/api/v1/policies/${id}`),
};

export const schedulesApi = {
  getSchedules: () => api.get('/api/v1/schedules'),
  getSchedule: (id: string) => api.get(`/api/v1/schedules/${id}`),
  getCurrentOnCall: (id: string) => api.get(`/api/v1/schedules/${id}/oncall`),
  createSchedule: (data: any) => api.post('/api/v1/schedules', data),
  updateSchedule: (id: string, data: any) => api.put(`/api/v1/schedules/${id}`, data),
  deleteSchedule: (id: string) => api.delete(`/api/v1/schedules/${id}`),
  enableSchedule: (id: string) => api.post(`/api/v1/schedules/${id}/enable`),
  disableSchedule: (id: string) => api.post(`/api/v1/schedules/${id}/disable`),
};

export const notificationsApi = {
  getNotifications: (params?: any) => api.get('/api/v1/notifications', { params }),
  getDeadLetters: () => api.get('/api/v1/dead-letters'),
  getNotificationsByAlertId: (alertId: string) => api.get<NotificationItem[]>(`/api/v1/notifications/alert/${alertId}`),
  retryNotification: (id: string) => api.post<NotificationItem>(`/api/v1/notifications/${id}/retry`),
};

export const sourcesApi = {
  getEventSources: () => api.get('/api/v1/event-sources'),
  createEventSource: (data: any) => api.post('/api/v1/event-sources', data),
  getAgentConfigs: () => api.get('/api/v1/agent-configs'),
  createAgentConfig: (data: any) => api.post('/api/v1/agent-configs', data),
  updateAgentConfig: (id: string, data: any) => api.put(`/api/v1/agent-configs/${id}`, data),
  deleteAgentConfig: (id: string) => api.delete(`/api/v1/agent-configs/${id}`),
  getWebhookInfo: () => api.get('/api/v1/webhook/info'),
  sendMetricEvent: (data: { metric_name: string; value: number; labels?: Record<string, string>; timestamp?: string }) =>
    api.post('/api/v1/events/metrics', data),
};

export interface ReplaySession {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  status: 'recording' | 'stopped' | 'archived';
  createdAt: string;
}

export interface ReplayEventItem {
  id: string;
  sessionId: string;
  tenantId: string;
  eventSource: string;
  eventPayload: any;
  originalMatchedRuleIds: string[];
  originalTimestamp: string;
  recordedAt: string;
}

export interface ReplayResultItem {
  id: string;
  sessionId: string;
  eventId: string;
  ruleId?: string;
  matched: boolean;
  matchDetail?: any;
  replayedAt: string;
}

export interface ReplayProgress {
  sessionId: string;
  totalEvents: number;
  replayedCount: number;
  matchedCount: number;
  hitRate: number;
  currentEvent?: ReplayEventItem;
  currentMatchResults?: ReplayResultItem[];
  currentCustomMatchResults?: Array<{ ruleId: string; ruleName: string; matched: boolean; matchDetail?: any }>;
  isPaused: boolean;
  pauseReason?: string;
  breakpointTriggeredEvent?: ReplayEventItem;
  breakpointRuleMatches?: Array<{
    ruleId: string;
    ruleName: string;
    matched: boolean;
    reason: string;
  }>;
  speedMultiplier: number;
}

export interface CustomRuleSnapshot {
  id?: string;
  name: string;
  conditionType: string;
  conditions: any;
  priority?: number;
  isEnabled?: boolean;
  severity?: string;
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

export interface HotSwapDiffReport {
  hasCustomRules: boolean;
  totalEvents: number;
  missedCount: number;
  falsePositiveCount: number;
  ruleChangedCount: number;
  consistentCount: number;
  missedEvents: HotSwapDiffItem[];
  falsePositiveEvents: HotSwapDiffItem[];
  ruleChangedEvents: HotSwapDiffItem[];
}

export interface ReplayBookmark {
  id: string;
  sessionId: string;
  tenantId: string;
  name: string;
  eventIndex: number;
  progressSnapshot: any;
  createdAt: string;
}

export interface BreakpointCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
  value: string | number;
}

export interface ComparisonDiffItem {
  eventId: string;
  eventPayload: any;
  originalMatchedRuleIds: string[];
  replayedMatchedRuleIds: string[];
  originalMatchDetails?: any;
  replayedMatchDetails?: any;
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
}

export type ReplayMode = 'real_time' | 'accelerated' | 'single_step';

export const replayApi = {
  listSessions: (params?: { page?: number; pageSize?: number; keyword?: string }) =>
    api.get<{ items: ReplaySession[]; total: number; page: number; pageSize: number }>('/api/v1/replay/sessions', { params }),
  getSession: (id: string) => api.get<ReplaySession>(`/api/v1/replay/sessions/${id}`),
  startRecording: (data: { name: string; description?: string }) =>
    api.post<ReplaySession>('/api/v1/replay/sessions', data),
  stopRecording: (id: string) => api.post<ReplaySession>(`/api/v1/replay/sessions/${id}/stop`),
  archiveSession: (id: string) => api.post<ReplaySession>(`/api/v1/replay/sessions/${id}/archive`),
  deleteSession: (id: string) => api.delete(`/api/v1/replay/sessions/${id}`),
  getSessionEvents: (id: string, params?: { page?: number; pageSize?: number }) =>
    api.get<{ items: ReplayEventItem[]; total: number }>(`/api/v1/replay/sessions/${id}/events`, { params }),
  startReplay: (id: string, data: { mode: ReplayMode; speedMultiplier?: number; breakpoints?: BreakpointCondition[]; breakpointLogicalOp?: 'AND' | 'OR'; customRules?: CustomRuleSnapshot[]; startEventIndex?: number }) =>
    api.post<ReplayProgress>(`/api/v1/replay/sessions/${id}/replay/start`, data),
  setReplaySpeed: (id: string, speedMultiplier: number) =>
    api.post<ReplayProgress>(`/api/v1/replay/sessions/${id}/replay/speed`, { speedMultiplier }),
  singleStepNext: (id: string) => api.post<ReplayProgress>(`/api/v1/replay/sessions/${id}/replay/step`),
  pauseReplay: (id: string) => api.post<ReplayProgress>(`/api/v1/replay/sessions/${id}/replay/pause`),
  resumeReplay: (id: string) => api.post<ReplayProgress>(`/api/v1/replay/sessions/${id}/replay/resume`),
  stopReplay: (id: string) => api.post(`/api/v1/replay/sessions/${id}/replay/stop`),
  getProgress: (id: string) => api.get<ReplayProgress>(`/api/v1/replay/sessions/${id}/replay/progress`),
  setBreakpoints: (id: string, data: { conditions: BreakpointCondition[]; logicalOp?: 'AND' | 'OR' }) =>
    api.post(`/api/v1/replay/sessions/${id}/replay/breakpoints`, data),
  getComparisonReport: (id: string) => api.get<ComparisonReport>(`/api/v1/replay/sessions/${id}/comparison`),
  getHotSwapComparison: (id: string) => api.get<HotSwapDiffReport>(`/api/v1/replay/sessions/${id}/comparison/hot-swap`),
  exportReportJson: (id: string) =>
    api.get(`/api/v1/replay/sessions/${id}/export/json`, { responseType: 'blob' }),
  exportReportCsv: (id: string) =>
    api.get(`/api/v1/replay/sessions/${id}/export/csv`, { responseType: 'blob' }),
  listBookmarks: (id: string) => api.get<ReplayBookmark[]>(`/api/v1/replay/sessions/${id}/bookmarks`),
  createBookmark: (id: string, data: { name: string; eventIndex: number; progressSnapshot: any }) =>
    api.post<ReplayBookmark>(`/api/v1/replay/sessions/${id}/bookmarks`, data),
  updateBookmark: (id: string, bookmarkId: string, data: { name?: string }) =>
    api.put<ReplayBookmark>(`/api/v1/replay/sessions/${id}/bookmarks/${bookmarkId}`, data),
  deleteBookmark: (id: string, bookmarkId: string) =>
    api.delete(`/api/v1/replay/sessions/${id}/bookmarks/${bookmarkId}`),
  getBookmark: (id: string, bookmarkId: string) =>
    api.get<ReplayBookmark>(`/api/v1/replay/sessions/${id}/bookmarks/${bookmarkId}`),
};

export const tenantsApi = {
  getCurrentTenant: () => api.get('/api/v1/tenants/me'),
  regenerateApiKey: (id: string) => api.post(`/api/v1/tenants/${id}/regenerate-api-key`),
};
