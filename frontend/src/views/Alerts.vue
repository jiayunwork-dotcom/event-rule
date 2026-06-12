<template>
  <div class="alerts-page">
    <div class="filter-bar card">
      <el-form :inline="true" :model="filters" size="default">
        <el-form-item label="视图">
          <el-radio-group v-model="viewMode">
            <el-radio-button value="list">列表视图</el-radio-button>
            <el-radio-button value="grouped">分组视图</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="状态">
          <el-select v-model="filters.status" multiple placeholder="全部" clearable style="width: 200px">
            <el-option label="待确认" value="pending" />
            <el-option label="已确认" value="acknowledged" />
            <el-option label="处理中" value="processing" />
            <el-option label="已解决" value="resolved" />
          </el-select>
        </el-form-item>

        <el-form-item label="严重程度">
          <el-select v-model="filters.severity" multiple placeholder="全部" clearable style="width: 200px">
            <el-option label="FATAL" value="fatal" />
            <el-option label="CRITICAL" value="critical" />
            <el-option label="WARNING" value="warning" />
            <el-option label="INFO" value="info" />
          </el-select>
        </el-form-item>

        <el-form-item label="时间范围">
          <el-date-picker
            v-model="filters.dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            value-format="YYYY-MM-DDTHH:mm:ss"
          />
        </el-form-item>

        <el-form-item label="标签过滤">
          <el-input
            v-model="filters.labelFilter"
            placeholder="key=value"
            clearable
            style="width: 150px"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="loadAlerts">
            <el-icon><Search /></el-icon>
            查询
          </el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div v-if="selectedAlertIds.length > 0" class="batch-bar card">
      <div class="batch-bar-inner">
        <span class="batch-count">已选择 <strong>{{ selectedAlertIds.length }}</strong> 条告警</span>
        <div class="batch-actions">
          <el-button type="primary" @click="batchAcknowledge" :disabled="!hasPendingSelected">
            批量确认
          </el-button>
          <el-button type="warning" @click="openBatchResolveDialog" :disabled="!hasProcessingSelected">
            批量解决
          </el-button>
          <el-button @click="clearSelection">取消选择</el-button>
        </div>
      </div>
    </div>

    <div class="card">
      <template v-if="viewMode === 'list'">
        <el-table
          ref="alertTableRef"
          :data="filteredAlerts"
          v-loading="loading"
          stripe
          row-key="id"
          @expand-change="onExpandChange"
          @selection-change="handleAlertSelectionChange"
        >
          <el-table-column type="selection" width="45" />
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="history-expand">
                <el-tabs v-model="expandedTab[row.id]" @tab-change="(tab: any) => onExpandTabChange(row.id, tab)">
                  <el-tab-pane label="状态变更历史" name="history">
                    <div v-if="expandedHistory[row.id]?.loading" class="history-loading">
                      <el-icon class="is-loading"><Loading /></el-icon>
                      加载中...
                    </div>
                    <el-timeline v-else-if="expandedHistory[row.id]?.data?.length">
                      <el-timeline-item
                        v-for="item in expandedHistory[row.id].data"
                        :key="item.id"
                        :timestamp="formatTime(item.createdAt)"
                        :type="getHistoryType(item.newStatus)"
                        size="large"
                      >
                        <h4>{{ getStatusText(item.newStatus) }}</h4>
                        <p v-if="item.remark">{{ item.remark }}</p>
                        <p class="text-muted" v-if="item.operatorId">
                          操作人: {{ item.operatorId }}
                        </p>
                        <p class="text-muted" v-if="item.oldStatus">
                          从 {{ getStatusText(item.oldStatus) }} 变更
                        </p>
                      </el-timeline-item>
                    </el-timeline>
                    <el-empty v-else description="暂无历史记录" :image-size="60" />
                  </el-tab-pane>
                  <el-tab-pane label="通知记录" name="notifications">
                    <div v-if="expandedNotifications[row.id]?.loading" class="history-loading">
                      <el-icon class="is-loading"><Loading /></el-icon>
                      加载中...
                    </div>
                    <div v-else-if="expandedNotifications[row.id]?.data?.length" class="notification-list">
                      <div
                        v-for="notif in expandedNotifications[row.id].data"
                        :key="notif.id"
                        :class="['notification-item', `status-${notif.status}`]"
                      >
                        <div class="notification-header">
                          <el-tag size="small" :type="getNotificationStatusType(notif.status)">
                            {{ getNotificationStatusText(notif.status) }}
                          </el-tag>
                          <span class="notification-channel">{{ getChannelTypeText(notif.channelType) }}</span>
                          <span class="notification-recipient">{{ notif.recipient || '-' }}</span>
                          <span class="notification-time">{{ formatTime(notif.createdAt) }}</span>
                        </div>
                        <div v-if="notif.errorMessage" class="notification-error">
                          <el-icon color="#f56c6c"><CircleCloseFilled /></el-icon>
                          <span>{{ notif.errorMessage }}</span>
                          <el-button type="primary" size="small" @click="retryNotification(row.id, notif.id)" :loading="retryingNotifId === notif.id">
                            重试
                          </el-button>
                        </div>
                        <div v-if="notif.status === 'failed' && !notif.errorMessage" class="notification-error">
                          <el-button type="primary" size="small" @click="retryNotification(row.id, notif.id)" :loading="retryingNotifId === notif.id">
                            重试
                          </el-button>
                        </div>
                      </div>
                    </div>
                    <el-empty v-else description="暂无通知记录" :image-size="60" />
                  </el-tab-pane>
                </el-tabs>
              </div>
            </template>
          </el-table-column>

          <el-table-column width="60" type="index" />

          <el-table-column prop="severity" label="级别" width="100" fixed="left">
            <template #default="{ row }">
              <el-tag :type="getSeverityType(row.severity)" effect="dark">
                {{ row.severity.toUpperCase() }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column prop="name" label="告警名称" min-width="180" show-overflow-tooltip />

          <el-table-column prop="escalationLevel" label="升级级别" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.escalationLevel > 0" type="danger" size="small">
                L{{ row.escalationLevel }}
              </el-tag>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>

          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="getStatusType(row.status)">
                {{ getStatusText(row.status) }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column prop="labels" label="标签" min-width="200">
            <template #default="{ row }">
              <div class="labels-container">
                <el-tag
                  v-for="(value, key) in row.labels"
                  :key="key"
                  size="small"
                  class="label-tag"
                >
                  {{ key }}: {{ value }}
                </el-tag>
              </div>
            </template>
          </el-table-column>

          <el-table-column prop="value" label="指标值" width="100">
            <template #default="{ row }">
              {{ row.value !== undefined && row.value !== null ? Number(row.value).toFixed(2) : '-' }}
            </template>
          </el-table-column>

          <el-table-column prop="count" label="触发次数" width="100" />

          <el-table-column prop="firstTriggeredAt" label="首次触发" width="170">
            <template #default="{ row }">
              {{ formatTime(row.firstTriggeredAt) }}
            </template>
          </el-table-column>

          <el-table-column prop="lastTriggeredAt" label="最近触发" width="170">
            <template #default="{ row }">
              {{ formatTime(row.lastTriggeredAt) }}
            </template>
          </el-table-column>

          <el-table-column label="操作" width="280" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === 'pending'">
                <el-button type="primary" size="small" @click="acknowledgeAlert(row)">
                  确认
                </el-button>
              </template>
              <template v-else-if="row.status === 'acknowledged'">
                <el-button type="success" size="small" @click="processAlert(row)">
                  处理
                </el-button>
              </template>
              <template v-else-if="row.status === 'processing'">
                <el-button type="warning" size="small" @click="resolveAlert(row)">
                  解决
                </el-button>
              </template>
              <el-button size="small" @click="showHistoryDialog(row)">
                历史
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <template v-else>
        <el-table :data="filteredGroups" v-loading="loading" stripe row-key="fingerprint">
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="group-expand">
                <h4 class="group-title">包含告警 ({{ row.alerts.length }})</h4>
                <el-table :data="row.alerts" size="small" row-key="id">
                  <el-table-column width="50" type="index" />
                  <el-table-column prop="status" label="状态" width="100">
                    <template #default="{ row: innerRow }">
                      <el-tag :type="getStatusType(innerRow.status)" size="small">
                        {{ getStatusText(innerRow.status) }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="escalationLevel" label="升级" width="70">
                    <template #default="{ row: innerRow }">
                      <el-tag v-if="innerRow.escalationLevel > 0" type="danger" size="small">
                        L{{ innerRow.escalationLevel }}
                      </el-tag>
                      <span v-else>-</span>
                    </template>
                  </el-table-column>
                  <el-table-column prop="value" label="指标值" width="90">
                    <template #default="{ row: innerRow }">
                      {{ innerRow.value !== undefined && innerRow.value !== null ? Number(innerRow.value).toFixed(2) : '-' }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="count" label="次数" width="70" />
                  <el-table-column prop="firstTriggeredAt" label="首次触发" width="160">
                    <template #default="{ row: innerRow }">
                      {{ formatTime(innerRow.firstTriggeredAt) }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="lastTriggeredAt" label="最近触发" width="160">
                    <template #default="{ row: innerRow }">
                      {{ formatTime(innerRow.lastTriggeredAt) }}
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="200">
                    <template #default="{ row: innerRow }">
                      <template v-if="innerRow.status === 'pending'">
                        <el-button type="primary" size="small" @click="acknowledgeAlert(innerRow)">
                          确认
                        </el-button>
                      </template>
                      <template v-else-if="innerRow.status === 'acknowledged'">
                        <el-button type="success" size="small" @click="processAlert(innerRow)">
                          处理
                        </el-button>
                      </template>
                      <template v-else-if="innerRow.status === 'processing'">
                        <el-button type="warning" size="small" @click="resolveAlert(innerRow)">
                          解决
                        </el-button>
                      </template>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </template>
          </el-table-column>

          <el-table-column width="60" type="index" />

          <el-table-column prop="severity" label="级别" width="100">
            <template #default="{ row }">
              <el-tag :type="getSeverityType(row.severity)" effect="dark">
                {{ row.severity.toUpperCase() }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column prop="name" label="告警名称" min-width="180" show-overflow-tooltip />

          <el-table-column prop="labels" label="分组标签" min-width="200">
            <template #default="{ row }">
              <div class="labels-container">
                <el-tag
                  v-for="(value, key) in row.labels"
                  :key="key"
                  size="small"
                  class="label-tag"
                  type="info"
                >
                  {{ key }}: {{ value }}
                </el-tag>
              </div>
            </template>
          </el-table-column>

          <el-table-column prop="alerts.length" label="告警数" width="80" />

          <el-table-column prop="count" label="总触发次数" width="100" />

          <el-table-column prop="lastTriggeredAt" label="最近触发" width="170">
            <template #default="{ row }">
              {{ formatTime(row.lastTriggeredAt) }}
            </template>
          </el-table-column>
        </el-table>
      </template>
    </div>

    <el-dialog v-model="historyDialogVisible" title="告警历史" width="600px">
      <el-timeline>
        <el-timeline-item
          v-for="item in alertHistory"
          :key="item.id"
          :timestamp="formatTime(item.createdAt)"
          :type="getHistoryType(item.newStatus)"
          size="large"
        >
          <h4>{{ getStatusText(item.newStatus) }}</h4>
          <p v-if="item.remark">{{ item.remark }}</p>
          <p class="text-muted" v-if="item.operatorId">
            操作人: {{ item.operatorId }}
          </p>
          <p class="text-muted" v-if="item.oldStatus">
            从 {{ getStatusText(item.oldStatus) }} 变更
          </p>
        </el-timeline-item>
      </el-timeline>
    </el-dialog>

    <el-dialog v-model="resolveDialogVisible" title="解决告警" width="500px">
      <el-form :model="resolveForm" label-width="80px">
        <el-form-item label="备注">
          <el-input v-model="resolveForm.remark" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="解决原因" required>
          <el-input v-model="resolveForm.resolvedReason" type="textarea" :rows="3" placeholder="请填写解决原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resolveDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmResolve" :disabled="!resolveForm.resolvedReason">确认解决</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchResolveDialogVisible" title="批量解决告警" width="500px">
      <el-form :model="batchResolveForm" label-width="80px">
        <el-form-item label="解决原因" required>
          <el-input v-model="batchResolveForm.resolvedReason" type="textarea" :rows="3" placeholder="请填写统一解决原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchResolveDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="doBatchResolve" :disabled="!batchResolveForm.resolvedReason" :loading="batchOperating">
          确认解决
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import dayjs from 'dayjs';
import {
  alertsApi,
  notificationsApi,
  Alert,
  AlertGroup,
  AlertHistoryItem,
  NotificationItem,
} from '@/services/apiEndpoints';
import { Search, Loading, CircleCloseFilled } from '@element-plus/icons-vue';

const loading = ref(false);
const viewMode = ref<'list' | 'grouped'>('list');
const alerts = ref<Alert[]>([]);
const alertGroups = ref<AlertGroup[]>([]);
const alertHistory = ref<AlertHistoryItem[]>([]);
const historyDialogVisible = ref(false);
const resolveDialogVisible = ref(false);
const currentAlert = ref<Alert | null>(null);
const expandedHistory = reactive<Record<string, { loading: boolean; data: AlertHistoryItem[] }>>({});
const expandedNotifications = reactive<Record<string, { loading: boolean; data: NotificationItem[] }>>({});
const expandedTab = reactive<Record<string, string>>({});
const retryingNotifId = ref<string | null>(null);

const alertTableRef = ref<any>(null);
const selectedAlertIds = ref<string[]>([]);
const selectedAlerts = ref<Alert[]>([]);

const batchResolveDialogVisible = ref(false);
const batchOperating = ref(false);
const batchResolveForm = reactive({
  resolvedReason: '',
});

const resolveForm = reactive({
  remark: '',
  resolvedReason: '',
});

const filters = reactive({
  status: [] as string[],
  severity: [] as string[],
  dateRange: [] as string[],
  labelFilter: '',
});

const hasPendingSelected = computed(() => {
  return selectedAlerts.value.some(a => a.status === 'pending');
});

const hasProcessingSelected = computed(() => {
  return selectedAlerts.value.some(a => a.status === 'processing');
});

const filteredAlerts = computed(() => {
  if (!filters.labelFilter) return alerts.value;
  const [key, value] = filters.labelFilter.split('=');
  if (!key) return alerts.value;
  return alerts.value.filter(a => a.labels?.[key] === value);
});

const filteredGroups = computed(() => {
  if (!filters.labelFilter) return alertGroups.value;
  const [key, value] = filters.labelFilter.split('=');
  if (!key) return alertGroups.value;
  return alertGroups.value.filter(g => g.labels?.[key] === value);
});

function formatTime(time: string) {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss');
}

function getSeverityType(severity: string) {
  const map: Record<string, string> = {
    fatal: 'danger',
    critical: 'warning',
    warning: 'warning',
    info: 'info',
  };
  return map[severity] || 'info';
}

function getStatusType(status: string) {
  const map: Record<string, string> = {
    pending: 'danger',
    acknowledged: 'warning',
    processing: 'primary',
    resolved: 'success',
  };
  return map[status] || 'info';
}

function getStatusText(status: string) {
  const map: Record<string, string> = {
    pending: '待确认',
    acknowledged: '已确认',
    processing: '处理中',
    resolved: '已解决',
  };
  return map[status] || status;
}

function getHistoryType(status: string) {
  return getStatusType(status);
}

function getNotificationStatusType(status: string) {
  const map: Record<string, string> = {
    pending: 'info',
    sending: 'warning',
    sent: 'success',
    failed: 'danger',
    dead_letter: 'danger',
  };
  return map[status] || 'info';
}

function getNotificationStatusText(status: string) {
  const map: Record<string, string> = {
    pending: '待发送',
    sending: '发送中',
    sent: '发送成功',
    failed: '发送失败',
    dead_letter: '死信',
  };
  return map[status] || status;
}

function getChannelTypeText(type: string) {
  const map: Record<string, string> = {
    email: '邮件',
    slack: 'Slack',
    wechat: '企业微信',
    webhook: 'Webhook',
  };
  return map[type] || type;
}

async function loadAlerts() {
  loading.value = true;
  try {
    const params: any = {};
    if (filters.status.length > 0) params.status = filters.status;
    if (filters.severity.length > 0) params.severity = filters.severity;
    if (filters.dateRange.length === 2) {
      params.startDate = filters.dateRange[0];
      params.endDate = filters.dateRange[1];
    }

    if (viewMode.value === 'list') {
      const response = await alertsApi.getAlerts(params);
      alerts.value = response.data;
    } else {
      const response = await alertsApi.getAlertsGrouped(params);
      alertGroups.value = response.data;
    }
  } catch (error) {
    console.error('Failed to load alerts:', error);
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  filters.status = [];
  filters.severity = [];
  filters.dateRange = [];
  filters.labelFilter = '';
  loadAlerts();
}

async function loadAlertHistory(alertId: string) {
  if (expandedHistory[alertId]) return;
  expandedHistory[alertId] = { loading: true, data: [] };
  try {
    const response = await alertsApi.getAlertHistory(alertId);
    expandedHistory[alertId] = { loading: false, data: response.data };
  } catch (error) {
    console.error('Failed to load alert history:', error);
    expandedHistory[alertId] = { loading: false, data: [] };
  }
}

async function loadAlertNotifications(alertId: string) {
  if (expandedNotifications[alertId]) return;
  expandedNotifications[alertId] = { loading: true, data: [] };
  try {
    const response = await notificationsApi.getNotificationsByAlertId(alertId);
    expandedNotifications[alertId] = { loading: false, data: response.data };
  } catch (error) {
    console.error('Failed to load alert notifications:', error);
    expandedNotifications[alertId] = { loading: false, data: [] };
  }
}

function onExpandChange(row: Alert, expandedRows: Alert[]) {
  if (expandedRows.includes(row)) {
    if (!expandedTab[row.id]) {
      expandedTab[row.id] = 'history';
    }
    loadAlertHistory(row.id);
  }
}

function onExpandTabChange(alertId: string, tab: string) {
  expandedTab[alertId] = tab;
  if (tab === 'notifications') {
    loadAlertNotifications(alertId);
  } else if (tab === 'history') {
    loadAlertHistory(alertId);
  }
}

function handleAlertSelectionChange(selection: Alert[]) {
  selectedAlertIds.value = selection.map(a => a.id);
  selectedAlerts.value = selection;
}

function clearSelection() {
  selectedAlertIds.value = [];
  selectedAlerts.value = [];
  if (alertTableRef.value) {
    alertTableRef.value.clearSelection();
  }
}

async function batchAcknowledge() {
  const pendingIds = selectedAlerts.value
    .filter(a => a.status === 'pending')
    .map(a => a.id);

  if (pendingIds.length === 0) {
    ElMessage.warning('没有可确认的待确认告警');
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确认批量确认 ${pendingIds.length} 条待确认告警?`,
      '批量确认',
      { type: 'warning' }
    );

    batchOperating.value = true;
    const response = await alertsApi.batchAcknowledge(pendingIds);
    const { operated, skipped } = response.data;
    let msg = `${operated} 条已操作`;
    if (skipped > 0) {
      msg += `，${skipped} 条因状态不符已跳过`;
    }
    ElMessage.success(msg);
    clearSelection();
    loadAlerts();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to batch acknowledge:', error);
      ElMessage.error((error as any)?.response?.data?.message || '批量确认失败');
    }
  } finally {
    batchOperating.value = false;
  }
}

function openBatchResolveDialog() {
  batchResolveForm.resolvedReason = '';
  batchResolveDialogVisible.value = true;
}

async function doBatchResolve() {
  const processingIds = selectedAlerts.value
    .filter(a => a.status === 'processing')
    .map(a => a.id);

  if (processingIds.length === 0) {
    ElMessage.warning('没有可解决的处于处理中状态的告警');
    return;
  }

  if (!batchResolveForm.resolvedReason) {
    ElMessage.warning('请填写解决原因');
    return;
  }

  batchOperating.value = true;
  try {
    const response = await alertsApi.batchResolve(processingIds, batchResolveForm.resolvedReason);
    const { operated, skipped } = response.data;
    let msg = `${operated} 条已操作`;
    if (skipped > 0) {
      msg += `，${skipped} 条因状态不符已跳过`;
    }
    ElMessage.success(msg);
    batchResolveDialogVisible.value = false;
    clearSelection();
    loadAlerts();
  } catch (error) {
    console.error('Failed to batch resolve:', error);
    ElMessage.error((error as any)?.response?.data?.message || '批量解决失败');
  } finally {
    batchOperating.value = false;
  }
}

async function retryNotification(alertId: string, notificationId: string) {
  retryingNotifId.value = notificationId;
  try {
    await notificationsApi.retryNotification(notificationId);
    ElMessage.success('通知已重新发送');
    expandedNotifications[alertId] = { loading: true, data: [] };
    await loadAlertNotifications(alertId);
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '重试失败');
  } finally {
    retryingNotifId.value = null;
  }
}

async function acknowledgeAlert(alert: Alert) {
  try {
    const { value: remark } = await ElMessageBox.prompt('请输入备注信息', '确认告警', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      inputPlaceholder: '可选',
    });

    await alertsApi.acknowledge(alert.id, remark as string);
    ElMessage.success('告警已确认');
    loadAlerts();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to acknowledge alert:', error);
      ElMessage.error((error as any)?.response?.data?.message || '确认告警失败');
    }
  }
}

async function processAlert(alert: Alert) {
  try {
    const { value: remark } = await ElMessageBox.prompt('请输入备注信息', '开始处理', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      inputPlaceholder: '可选',
    });

    await alertsApi.process(alert.id, remark as string);
    ElMessage.success('开始处理告警');
    loadAlerts();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to process alert:', error);
      ElMessage.error((error as any)?.response?.data?.message || '处理告警失败');
    }
  }
}

function resolveAlert(alert: Alert) {
  currentAlert.value = alert;
  resolveForm.remark = '';
  resolveForm.resolvedReason = '';
  resolveDialogVisible.value = true;
}

async function confirmResolve() {
  if (!currentAlert.value || !resolveForm.resolvedReason) return;

  try {
    await alertsApi.resolve(
      currentAlert.value.id,
      resolveForm.remark,
      resolveForm.resolvedReason
    );
    ElMessage.success('告警已解决');
    resolveDialogVisible.value = false;
    loadAlerts();
  } catch (error) {
    console.error('Failed to resolve alert:', error);
    ElMessage.error((error as any)?.response?.data?.message || '解决告警失败');
  }
}

async function showHistoryDialog(alert: Alert) {
  try {
    const response = await alertsApi.getAlertHistory(alert.id);
    alertHistory.value = response.data;
    historyDialogVisible.value = true;
  } catch (error) {
    console.error('Failed to load alert history:', error);
  }
}

watch(viewMode, () => {
  loadAlerts();
});

onMounted(() => {
  loadAlerts();
});
</script>

<style scoped>
.alerts-page {
  padding: 0;
}

.filter-bar {
  margin-bottom: 20px;
}

.card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.batch-bar {
  margin-bottom: 12px;
  padding: 12px 20px;
}

.batch-bar-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.batch-count {
  font-size: 14px;
  color: #606266;
}

.batch-actions {
  display: flex;
  gap: 8px;
}

.labels-container {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.label-tag {
  margin-right: 4px;
  margin-bottom: 4px;
}

.text-muted {
  color: #909399;
  font-size: 12px;
}

.history-expand,
.group-expand {
  padding: 10px 40px;
  background: #fafafa;
  border-radius: 4px;
}

.history-title,
.group-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.history-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #909399;
  padding: 20px 0;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notification-item {
  padding: 12px 16px;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
}

.notification-item.status-sent {
  border-left: 3px solid #67c23a;
}

.notification-item.status-failed,
.notification-item.status-dead_letter {
  border-left: 3px solid #f56c6c;
}

.notification-item.status-pending,
.notification-item.status-sending {
  border-left: 3px solid #e6a23c;
}

.notification-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.notification-channel {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}

.notification-recipient {
  font-size: 12px;
  color: #606266;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-time {
  font-size: 12px;
  color: #909399;
  margin-left: auto;
}

.notification-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  color: #f56c6c;
}
</style>
