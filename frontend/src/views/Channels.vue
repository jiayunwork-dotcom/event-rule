<template>
  <div class="channels-page">
    <div class="page-header card">
      <div class="flex justify-between items-center">
        <h2>通知渠道</h2>
        <el-button type="primary" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          创建渠道
        </el-button>
      </div>
    </div>

    <div class="card">
      <el-table :data="channels" v-loading="loading" stripe>
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="type" label="类型" width="120">
          <template #default="{ row }">
            <el-tag :type="getTypeColor(row.type)">
              {{ getTypeText(row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="配置" min-width="300">
          <template #default="{ row }">
            <template v-if="row.type === 'email'">
              <span>SMTP: {{ row.config?.to || '未配置' }}</span>
            </template>
            <template v-else-if="row.type === 'slack' || row.type === 'wechat' || row.type === 'webhook'">
              <span>URL: {{ row.config?.webhookUrl || row.config?.url || '未配置' }}</span>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-switch
              :model-value="row.isEnabled"
              @change="(val) => toggleChannel(row, val)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" @click="editChannel(row)">编辑</el-button>
            <el-button type="danger" size="small" @click="deleteChannel(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" :title="editingChannel ? '编辑渠道' : '创建渠道'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="渠道类型" required>
          <el-select v-model="form.type" style="width: 200px" @change="onTypeChange">
            <el-option label="邮件" value="email" />
            <el-option label="Slack" value="slack" />
            <el-option label="企业微信" value="wechat" />
            <el-option label="自定义Webhook" value="webhook" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        
        <template v-if="form.type === 'email'">
          <el-form-item label="收件人" required>
            <el-input v-model="form.config.to" placeholder="多个邮箱用逗号分隔" />
          </el-form-item>
        </template>
        
        <template v-else-if="form.type === 'slack' || form.type === 'wechat'">
          <el-form-item label="Webhook URL" required>
            <el-input v-model="form.config.webhookUrl" placeholder="https://hooks.slack.com/..." />
          </el-form-item>
        </template>
        
        <template v-else-if="form.type === 'webhook'">
          <el-form-item label="Webhook URL" required>
            <el-input v-model="form.config.url" placeholder="https://example.com/webhook" />
          </el-form-item>
          <el-form-item label="请求方法">
            <el-select v-model="form.config.method" style="width: 150px">
              <el-option label="POST" value="POST" />
              <el-option label="PUT" value="PUT" />
            </el-select>
          </el-form-item>
          <el-form-item label="请求头">
            <el-input
              v-model="configHeaders"
              type="textarea"
              :rows="3"
              placeholder='{"Content-Type": "application/json"}'
            />
          </el-form-item>
        </template>
        
        <el-form-item label="消息模板">
          <el-input
            v-model="form.template"
            type="textarea"
            :rows="6"
            placeholder="支持变量: {{alert_name}}, {{severity}}, {{labels.host}}, {{value}}, {{count}}等"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="saveChannel">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { channelsApi } from '@/services/apiEndpoints';
import { Plus } from '@element-plus/icons-vue';

const loading = ref(false);
const channels = ref<any[]>([]);
const showCreateDialog = ref(false);
const editingChannel = ref<any>(null);
const configHeaders = ref('');

const form = reactive<any>({
  name: '',
  type: 'email',
  config: {},
  template: '',
});

watch(() => form.config, (val) => {
  if (val?.headers) {
    configHeaders.value = JSON.stringify(val.headers, null, 2);
  }
}, { deep: true });

function getTypeText(type: string) {
  const map: Record<string, string> = {
    email: '邮件',
    slack: 'Slack',
    wechat: '企业微信',
    webhook: 'Webhook',
  };
  return map[type] || type;
}

function getTypeColor(type: string) {
  const map: Record<string, string> = {
    email: 'primary',
    slack: 'success',
    wechat: 'warning',
    webhook: 'info',
  };
  return map[type] || '';
}

function onTypeChange() {
  form.config = {};
  configHeaders.value = '';
}

async function loadChannels() {
  loading.value = true;
  try {
    const response = await channelsApi.getChannels();
    channels.value = response.data;
  } catch (error) {
    console.error('Failed to load channels:', error);
  } finally {
    loading.value = false;
  }
}

function editChannel(channel: any) {
  editingChannel.value = channel;
  form.name = channel.name;
  form.type = channel.type;
  form.config = { ...channel.config };
  form.template = channel.template || '';
  configHeaders.value = channel.config?.headers ? JSON.stringify(channel.config.headers, null, 2) : '';
  showCreateDialog.value = true;
}

async function toggleChannel(channel: any, isEnabled: boolean) {
  try {
    if (isEnabled) {
      await channelsApi.enableChannel(channel.id);
    } else {
      await channelsApi.disableChannel(channel.id);
    }
    ElMessage.success('渠道状态已更新');
    loadChannels();
  } catch (error) {
    console.error('Failed to toggle channel:', error);
  }
}

async function saveChannel() {
  if (!form.name || !form.type) {
    ElMessage.warning('请填写完整信息');
    return;
  }
  
  if (configHeaders.value) {
    try {
      form.config.headers = JSON.parse(configHeaders.value);
    } catch {
      ElMessage.warning('请求头格式不正确');
      return;
    }
  }
  
  try {
    if (editingChannel.value) {
      await channelsApi.updateChannel(editingChannel.value.id, {
        name: form.name,
        type: form.type,
        config: form.config,
        template: form.template,
      });
      ElMessage.success('渠道已更新');
    } else {
      await channelsApi.createChannel({
        name: form.name,
        type: form.type,
        config: form.config,
        template: form.template,
      });
      ElMessage.success('渠道已创建');
    }
    
    showCreateDialog.value = false;
    resetForm();
    loadChannels();
  } catch (error) {
    console.error('Failed to save channel:', error);
  }
}

async function deleteChannel(channel: any) {
  try {
    await ElMessageBox.confirm(
      `确定要删除渠道 "${channel.name}" 吗?`,
      '删除确认',
      { type: 'warning' }
    );
    
    await channelsApi.deleteChannel(channel.id);
    ElMessage.success('渠道已删除');
    loadChannels();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to delete channel:', error);
    }
  }
}

function resetForm() {
  editingChannel.value = null;
  form.name = '';
  form.type = 'email';
  form.config = {};
  form.template = '';
  configHeaders.value = '';
}

onMounted(() => {
  loadChannels();
});
</script>

<style scoped>
.channels-page {
  padding: 0;
}

.page-header {
  margin-bottom: 20px;
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

h2 {
  margin: 0;
  font-size: 18px;
}
</style>
