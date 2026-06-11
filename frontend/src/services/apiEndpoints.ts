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

export const alertsApi = {
  getAlerts: (params?: any) => api.get<Alert[]>('/api/v1/alerts', { params }),
  getAlert: (id: string) => api.get<Alert>(`/api/v1/alerts/${id}`),
  getAlertHistory: (id: string) => api.get(`/api/v1/alerts/${id}/history`),
  acknowledge: (id: string, remark?: string) => 
    api.post<Alert>(`/api/v1/alerts/${id}/acknowledge`, { remark }),
  process: (id: string, remark?: string) => 
    api.post<Alert>(`/api/v1/alerts/${id}/process`, { remark }),
  resolve: (id: string, remark?: string, resolvedReason?: string) => 
    api.post<Alert>(`/api/v1/alerts/${id}/resolve`, { remark, resolvedReason }),
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
};

export const sourcesApi = {
  getEventSources: () => api.get('/api/v1/event-sources'),
  createEventSource: (data: any) => api.post('/api/v1/event-sources', data),
  getAgentConfigs: () => api.get('/api/v1/agent-configs'),
  createAgentConfig: (data: any) => api.post('/api/v1/agent-configs', data),
  updateAgentConfig: (id: string, data: any) => api.put(`/api/v1/agent-configs/${id}`, data),
  deleteAgentConfig: (id: string) => api.delete(`/api/v1/agent-configs/${id}`),
  getWebhookInfo: () => api.get('/api/v1/webhook/info'),
};

export const tenantsApi = {
  getCurrentTenant: () => api.get('/api/v1/tenants/me'),
  regenerateApiKey: (id: string) => api.post(`/api/v1/tenants/${id}/regenerate-api-key`),
};
