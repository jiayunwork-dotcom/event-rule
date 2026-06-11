<template>
  <div class="notifications-page">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="通知记录" name="notifications">
        <div class="filter-bar card mb-20">
          <el-form :inline="true" :model="filters" size="default">
            <el-form-item label="渠道类型">
              <el-select v-model="filters.channelType" clearable placeholder="全部" style="width: 150px">
                <el-option label="邮件" value="email" />
                <el-option label="Slack" value="slack" />
                <el-option label="企业微信" value="wechat" />
                <el-option label="Webhook" value="webhook" />
              </el-select>
            </el-form-item>
            
            <el-form-item label="状态">
              <el-select v-model="filters.status" clearable placeholder="全部" style="width: 150px">
                <el-option label="待发送" value="pending" />
                <el-option label="发送中" value="sending" />
                <el-option label="已发送" value="sent" />
                <el-option label="发送失败" value="failed" />
                <el-option label="死信" value="dead_letter" />
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
            
            <el-form-item>
              <el-button type="primary" @click="loadNotifications">查询</el-button>
              <el-button @click="resetFilters">重置</el-button>
            </el-form-item>
          </el-form>
        </div>

        <div class="card">
          <el-table :data="notifications" v-loading="loading" stripe>
            <el-table-column width="60" type="index" />
            <el-table-column prop="channelType" label="渠道" width="100">
              <template #default="{ row }">
                <el-tag :type="getChannelTypeColor(row.channelType)">
                  {{ getChannelTypeText(row.channelType) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="recipient" label="接收人" min-width="200" show-overflow-tooltip />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)">
                  {{ getStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="retryCount" label="重试次数" width="100" />
            <el-table-column prop="sentAt" label="发送时间" width="170">
              <template #default="{ row }">
                {{ row.sentAt ? formatTime(row.sentAt) : '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="创建时间" width="170">
              <template #default="{ row }">
                {{ formatTime(row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column prop="errorMessage" label="错误信息" min-width="200" show-overflow-tooltip />
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="死信队列" name="dead-letters">
        <div class="card">
          <el-table :data="deadLetters" v-loading="loading" stripe>
            <el-table-column width="60" type="index" />
            <el-table-column prop="notificationId" label="通知ID" width="200" show-overflow-tooltip />
            <el-table-column label="原始数据" min-width="300">
              <template #default="{ row }">
                <el-button type="primary" size="small" @click="showRawData(row)">
                  查看
                </el-button>
              </template>
            </el-table-column>
            <el-table-column prop="errorMessage" label="错误信息" min-width="200" show-overflow-tooltip />
            <el-table-column prop="createdAt" label="创建时间" width="170">
              <template #default="{ row }">
                {{ formatTime(row.createdAt) }}
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showRawDataDialog" title="原始数据" width="600px">
      <pre class="raw-data">{{ JSON.stringify(rawData, null, 2) }}</pre>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import dayjs from 'dayjs';
import { notificationsApi } from '@/services/apiEndpoints';

const loading = ref(false);
const activeTab = ref('notifications');
const notifications = ref<any[]>([]);
const deadLetters = ref<any[]>([]);
const showRawDataDialog = ref(false);
const rawData = ref<any>(null);

const filters = reactive({
  channelType: '',
  status: '',
  dateRange: [] as string[],
});

function formatTime(time: string) {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss');
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

function getChannelTypeColor(type: string) {
  const map: Record<string, string> = {
    email: 'primary',
    slack: 'success',
    wechat: 'warning',
    webhook: 'info',
  };
  return map[type] || '';
}

function getStatusType(status: string) {
  const map: Record<string, string> = {
    pending: 'info',
    sending: 'warning',
    sent: 'success',
    failed: 'danger',
    dead_letter: 'danger',
  };
  return map[status] || '';
}

function getStatusText(status: string) {
  const map: Record<string, string> = {
    pending: '待发送',
    sending: '发送中',
    sent: '已发送',
    failed: '发送失败',
    dead_letter: '死信',
  };
  return map[status] || status;
}

function showRawData(row: any) {
  rawData.value = row.originalData;
  showRawDataDialog.value = true;
}

async function loadNotifications() {
  loading.value = true;
  try {
    const params: any = {};
    if (filters.channelType) params.channelType = filters.channelType;
    if (filters.status) params.status = filters.status;
    if (filters.dateRange.length === 2) {
      params.startDate = filters.dateRange[0];
      params.endDate = filters.dateRange[1];
    }
    
    const response = await notificationsApi.getNotifications(params);
    notifications.value = response.data;
  } catch (error) {
    console.error('Failed to load notifications:', error);
  } finally {
    loading.value = false;
  }
}

async function loadDeadLetters() {
  try {
    const response = await notificationsApi.getDeadLetters();
    deadLetters.value = response.data;
  } catch (error) {
    console.error('Failed to load dead letters:', error);
  }
}

function resetFilters() {
  filters.channelType = '';
  filters.status = '';
  filters.dateRange = [];
  loadNotifications();
}

onMounted(() => {
  loadNotifications();
  loadDeadLetters();
});
</script>

<style scoped>
.notifications-page {
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

.raw-data {
  background: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.mb-20 {
  margin-bottom: 20px;
}
</style>
