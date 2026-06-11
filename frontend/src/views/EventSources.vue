<template>
  <div class="event-sources-page">
    <el-row :gutter="20">
      <el-col :span="12">
        <div class="card mb-20">
          <div class="flex justify-between items-center mb-20">
            <h3>Webhook 接入信息</h3>
            <el-button type="primary" size="small" @click="loadWebhookInfo">
              刷新
            </el-button>
          </div>
          
          <el-descriptions :column="1" border v-if="webhookInfo">
            <el-descriptions-item label="Webhook URL">
              <el-input :value="webhookUrl" readonly style="width: 400px" />
              <el-button type="primary" size="small" @click="copyUrl">
                复制
              </el-button>
            </el-descriptions-item>
            <el-descriptions-item label="Webhook Secret">
              <span class="monospace">{{ webhookInfo.secret }}</span>
            </el-descriptions-item>
          </el-descriptions>
          
          <div class="mt-20">
            <el-alert
              title="使用说明"
              type="info"
              :closable="false"
            >
              <p>POST JSON 数据到上述 URL，示例格式：</p>
              <pre class="mt-10">{{ webhookExample }}</pre>
            </el-alert>
          </div>
        </div>

        <div class="card">
          <div class="flex justify-between items-center mb-20">
            <h3>Agent 配置</h3>
            <el-button type="primary" size="small" @click="showAgentDialog = true">
              新增 Agent
            </el-button>
          </div>
          
          <el-table :data="agentConfigs" v-loading="loading">
            <el-table-column prop="name" label="名称" />
            <el-table-column prop="host" label="主机" />
            <el-table-column label="采集指标" width="200">
              <template #default="{ row }">
                <el-tag v-if="row.cpuEnabled" size="small" class="mr-5">CPU</el-tag>
                <el-tag v-if="row.memoryEnabled" size="small" class="mr-5">内存</el-tag>
                <el-tag v-if="row.diskEnabled" size="small" class="mr-5">磁盘</el-tag>
                <el-tag v-if="row.networkEnabled" size="small">网络</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="interval" label="间隔(秒)" width="100" />
            <el-table-column prop="lastHeartbeat" label="最后心跳">
              <template #default="{ row }">
                {{ row.lastHeartbeat ? formatTime(row.lastHeartbeat) : '从未' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <el-button size="small" @click="editAgent(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="deleteAgent(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>

      <el-col :span="12">
        <div class="card mb-20">
          <h3>Prometheus AlertManager 兼容</h3>
          <el-alert
            title="AlertManager Webhook URL"
            type="info"
            :closable="false"
            class="mb-20"
          >
            <p><code>{{ prometheusWebhookUrl }}</code></p>
          </el-alert>
          
          <p>在 AlertManager 配置中添加以下 receiver：</p>
          <pre class="mt-10">{{ alertmanagerConfigExample }}</pre>
        </div>

        <div class="card">
          <h3>事件源列表</h3>
          <el-table :data="eventSources">
            <el-table-column prop="name" label="名称" />
            <el-table-column prop="type" label="类型" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.isEnabled ? 'success' : 'info'">
                  {{ row.isEnabled ? '启用' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="创建时间">
              <template #default="{ row }">
                {{ formatTime(row.createdAt) }}
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>

    <el-dialog v-model="showAgentDialog" :title="editingAgent ? '编辑 Agent' : '新增 Agent'" width="500px">
      <el-form :model="agentForm" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="agentForm.name" />
        </el-form-item>
        <el-form-item label="主机" required>
          <el-input v-model="agentForm.host" placeholder="如: 192.168.1.100" />
        </el-form-item>
        <el-form-item label="采集间隔">
          <el-input-number v-model="agentForm.interval" :min="10" :max="3600" />
          <span class="ml-2">秒</span>
        </el-form-item>
        <el-form-item label="采集指标">
          <el-checkbox-group v-model="enabledMetrics">
            <el-checkbox label="cpu">CPU</el-checkbox>
            <el-checkbox label="memory">内存</el-checkbox>
            <el-checkbox label="disk">磁盘</el-checkbox>
            <el-checkbox label="network">网络</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="标签">
          <el-input
            v-model="agentTags"
            placeholder="key=value,多个用逗号分隔"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAgentDialog = false">取消</el-button>
        <el-button type="primary" @click="saveAgent">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import dayjs from 'dayjs';
import { sourcesApi } from '@/services/apiEndpoints';

const loading = ref(false);
const webhookInfo = ref<any>(null);
const eventSources = ref<any[]>([]);
const agentConfigs = ref<any[]>([]);
const showAgentDialog = ref(false);
const editingAgent = ref<any>(null);
const enabledMetrics = ref<string[]>(['cpu', 'memory', 'disk', 'network']);
const agentTags = ref('');

const agentForm = reactive({
  name: '',
  host: '',
  interval: 60,
});

const webhookUrl = computed(() => {
  if (!webhookInfo.value) return '';
  return `${window.location.origin}${webhookInfo.value.url}`;
});

const prometheusWebhookUrl = computed(() => {
  if (!webhookInfo.value) return '';
  const baseUrl = webhookInfo.value.url.replace(/\/$/, '');
  return `${window.location.origin}${baseUrl}/prometheus`;
});

const webhookExample = JSON.stringify({
  source: 'custom',
  timestamp: new Date().toISOString(),
  labels: {
    host: 'server-01',
    service: 'api',
    environment: 'prod',
  },
  metricName: 'error_count',
  value: 15,
  severity: 'warning',
  message: 'High error rate detected',
}, null, 2);

const alertmanagerConfigExample = `receivers:
- name: 'event-rule-webhook'
  webhook_configs:
  - url: '${prometheusWebhookUrl.value || 'YOUR_WEBHOOK_URL'}'
    send_resolved: true

route:
  receiver: 'event-rule-webhook'
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h`;

function formatTime(time: string) {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss');
}

function copyUrl() {
  navigator.clipboard.writeText(webhookUrl.value);
  ElMessage.success('已复制到剪贴板');
}

async function loadWebhookInfo() {
  try {
    const response = await sourcesApi.getWebhookInfo();
    webhookInfo.value = response.data;
  } catch (error) {
    console.error('Failed to load webhook info:', error);
  }
}

async function loadEventSources() {
  try {
    const response = await sourcesApi.getEventSources();
    eventSources.value = response.data;
  } catch (error) {
    console.error('Failed to load event sources:', error);
  }
}

async function loadAgentConfigs() {
  loading.value = true;
  try {
    const response = await sourcesApi.getAgentConfigs();
    agentConfigs.value = response.data;
  } catch (error) {
    console.error('Failed to load agent configs:', error);
  } finally {
    loading.value = false;
  }
}

function editAgent(agent: any) {
  editingAgent.value = agent;
  agentForm.name = agent.name;
  agentForm.host = agent.host;
  agentForm.interval = agent.interval;
  enabledMetrics.value = [];
  if (agent.cpuEnabled) enabledMetrics.value.push('cpu');
  if (agent.memoryEnabled) enabledMetrics.value.push('memory');
  if (agent.diskEnabled) enabledMetrics.value.push('disk');
  if (agent.networkEnabled) enabledMetrics.value.push('network');
  agentTags.value = agent.tags ? Object.entries(agent.tags).map(([k, v]) => `${k}=${v}`).join(',') : '';
  showAgentDialog.value = true;
}

async function saveAgent() {
  const tags: Record<string, string> = {};
  agentTags.value.split(',').forEach(t => {
    const [k, v] = t.split('=');
    if (k && v) tags[k.trim()] = v.trim();
  });

  const data = {
    name: agentForm.name,
    host: agentForm.host,
    interval: agentForm.interval,
    cpuEnabled: enabledMetrics.value.includes('cpu'),
    memoryEnabled: enabledMetrics.value.includes('memory'),
    diskEnabled: enabledMetrics.value.includes('disk'),
    networkEnabled: enabledMetrics.value.includes('network'),
    tags,
  };

  try {
    if (editingAgent.value) {
      await sourcesApi.updateAgentConfig(editingAgent.value.id, data);
      ElMessage.success('Agent 配置已更新');
    } else {
      await sourcesApi.createAgentConfig(data);
      ElMessage.success('Agent 配置已创建');
    }
    
    showAgentDialog.value = false;
    loadAgentConfigs();
    resetAgentForm();
  } catch (error) {
    console.error('Failed to save agent:', error);
  }
}

async function deleteAgent(agent: any) {
  try {
    await ElMessageBox.confirm(
      `确定要删除 Agent "${agent.name}" 吗?`,
      '删除确认',
      { type: 'warning' }
    );
    
    await sourcesApi.deleteAgentConfig(agent.id);
    ElMessage.success('Agent 已删除');
    loadAgentConfigs();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to delete agent:', error);
    }
  }
}

function resetAgentForm() {
  editingAgent.value = null;
  agentForm.name = '';
  agentForm.host = '';
  agentForm.interval = 60;
  enabledMetrics.value = ['cpu', 'memory', 'disk', 'network'];
  agentTags.value = '';
}

onMounted(() => {
  loadWebhookInfo();
  loadEventSources();
  loadAgentConfigs();
});
</script>

<style scoped>
.event-sources-page {
  padding: 0;
}

.card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.flex {
  display: flex;
}

.justify-between {
  justify-content: space-between;
}

.items-center {
  align-items: center;
}

.mb-20 {
  margin-bottom: 20px;
}

.mt-10 {
  margin-top: 10px;
}

.mr-5 {
  margin-right: 5px;
}

.ml-2 {
  margin-left: 8px;
}

h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

pre {
  background: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  font-family: 'Monaco', 'Menlo', monospace;
}

.monospace {
  font-family: 'Monaco', 'Menlo', monospace;
}
</style>
