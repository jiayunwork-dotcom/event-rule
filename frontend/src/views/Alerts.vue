<template>
  <div class="alerts-page">
    <div class="filter-bar card">
      <el-form :inline="true" :model="filters" size="default">
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

    <div class="card">
      <el-table :data="alerts" v-loading="loading" stripe>
        <el-table-column width="60" type="index" />
        
        <el-table-column prop="severity" label="级别" width="100" fixed="left">
          <template #default="{ row }">
            <el-tag :type="getSeverityType(row.severity)" effect="dark">
              {{ row.severity.toUpperCase() }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column prop="name" label="告警名称" min-width="180" show-overflow-tooltip />
        
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
            {{ row.value !== undefined ? row.value.toFixed(2) : '-' }}
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
            <el-button size="small" @click="showHistory(row)">
              历史
            </el-button>
          </template>
        </el-table-column>
      </el-table>
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
        </el-timeline-item>
      </el-timeline>
    </el-dialog>

    <el-dialog v-model="resolveDialogVisible" title="解决告警" width="500px">
      <el-form :model="resolveForm" label-width="80px">
        <el-form-item label="备注">
          <el-input v-model="resolveForm.remark" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="解决原因">
          <el-input v-model="resolveForm.resolvedReason" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resolveDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmResolve">确认解决</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import dayjs from 'dayjs';
import { alertsApi, Alert } from '@/services/apiEndpoints';
import { Search } from '@element-plus/icons-vue';

const loading = ref(false);
const alerts = ref<Alert[]>([]);
const alertHistory = ref<any[]>([]);
const historyDialogVisible = ref(false);
const resolveDialogVisible = ref(false);
const currentAlert = ref<Alert | null>(null);

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
    
    const response = await alertsApi.getAlerts(params);
    
    if (filters.labelFilter) {
      const [key, value] = filters.labelFilter.split('=');
      alerts.value = response.data.filter(a => a.labels?.[key] === value);
    } else {
      alerts.value = response.data;
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

async function acknowledgeAlert(alert: Alert) {
  try {
    await ElMessageBox.prompt('请输入备注信息', '确认告警', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      inputPlaceholder: '可选',
    });
    
    await alertsApi.acknowledge(alert.id);
    ElMessage.success('告警已确认');
    loadAlerts();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to acknowledge alert:', error);
    }
  }
}

async function processAlert(alert: Alert) {
  try {
    await ElMessageBox.prompt('请输入备注信息', '开始处理', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      inputPlaceholder: '可选',
    });
    
    await alertsApi.process(alert.id);
    ElMessage.success('开始处理告警');
    loadAlerts();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to process alert:', error);
    }
  }
}

async function resolveAlert(alert: Alert) {
  currentAlert.value = alert;
  resolveForm.remark = '';
  resolveForm.resolvedReason = '';
  resolveDialogVisible.value = true;
}

async function confirmResolve() {
  if (!currentAlert.value) return;
  
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
  }
}

async function showHistory(alert: Alert) {
  try {
    const response = await alertsApi.getAlertHistory(alert.id);
    alertHistory.value = response.data;
    historyDialogVisible.value = true;
  } catch (error) {
    console.error('Failed to load alert history:', error);
  }
}

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
</style>
