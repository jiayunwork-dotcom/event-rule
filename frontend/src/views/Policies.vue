<template>
  <div class="policies-page">
    <div class="page-header card">
      <div class="flex justify-between items-center">
        <h2>通知策略</h2>
        <el-button type="primary" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          创建策略
        </el-button>
      </div>
    </div>

    <div class="card">
      <el-table :data="policies" v-loading="loading" stripe>
        <el-table-column prop="name" label="名称" />
        <el-table-column label="严重程度" width="200">
          <template #default="{ row }">
            <el-tag
              v-for="s in row.severityLevels"
              :key="s"
              :type="getSeverityType(s)"
              size="small"
              class="mr-5"
            >
              {{ s.toUpperCase() }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="通知渠道" min-width="200">
          <template #default="{ row }">
            <el-tag
              v-for="id in row.channelIds"
              :key="id"
              type="info"
              size="small"
              class="mr-5"
            >
              {{ getChannelName(id) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="值班表" width="150">
          <template #default="{ row }">
            {{ getScheduleName(row.scheduleId) || '无' }}
          </template>
        </el-table-column>
        <el-table-column label="默认" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.isDefault" type="success" size="small">是</el-tag>
            <el-tag v-else type="info" size="small">否</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.isEnabled ? 'success' : 'info'" size="small">
              {{ row.isEnabled ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" @click="editPolicy(row)">编辑</el-button>
            <el-button type="danger" size="small" @click="deletePolicy(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" :title="editingPolicy ? '编辑策略' : '创建策略'" width="600px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="策略名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        
        <el-form-item label="严重程度" required>
          <el-select v-model="form.severityLevels" multiple style="width: 100%">
            <el-option label="FATAL" value="fatal" />
            <el-option label="CRITICAL" value="critical" />
            <el-option label="WARNING" value="warning" />
            <el-option label="INFO" value="info" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="通知渠道" required>
          <el-select v-model="form.channelIds" multiple style="width: 100%">
            <el-option
              v-for="channel in channels"
              :key="channel.id"
              :label="channel.name"
              :value="channel.id"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="关联值班表">
          <el-select v-model="form.scheduleId" clearable style="width: 100%">
            <el-option
              v-for="schedule in schedules"
              :key="schedule.id"
              :label="schedule.name"
              :value="schedule.id"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="设为默认">
          <el-switch v-model="form.isDefault" />
        </el-form-item>
        
        <el-form-item label="启用状态">
          <el-switch v-model="form.isEnabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="savePolicy">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { policiesApi, channelsApi, schedulesApi } from '@/services/apiEndpoints';
import { Plus } from '@element-plus/icons-vue';

const loading = ref(false);
const policies = ref<any[]>([]);
const channels = ref<any[]>([]);
const schedules = ref<any[]>([]);
const showCreateDialog = ref(false);
const editingPolicy = ref<any>(null);

const form = reactive({
  name: '',
  severityLevels: [] as string[],
  channelIds: [] as string[],
  scheduleId: '',
  isDefault: false,
  isEnabled: true,
});

function getSeverityType(severity: string) {
  const map: Record<string, string> = {
    fatal: 'danger',
    critical: 'warning',
    warning: 'warning',
    info: 'info',
  };
  return map[severity] || 'info';
}

function getChannelName(id: string) {
  return channels.value.find(c => c.id === id)?.name || id;
}

function getScheduleName(id: string) {
  return schedules.value.find(s => s.id === id)?.name || '';
}

async function loadPolicies() {
  loading.value = true;
  try {
    const response = await policiesApi.getPolicies();
    policies.value = response.data;
  } catch (error) {
    console.error('Failed to load policies:', error);
  } finally {
    loading.value = false;
  }
}

async function loadChannels() {
  try {
    const response = await channelsApi.getChannels();
    channels.value = response.data;
  } catch (error) {
    console.error('Failed to load channels:', error);
  }
}

async function loadSchedules() {
  try {
    const response = await schedulesApi.getSchedules();
    schedules.value = response.data;
  } catch (error) {
    console.error('Failed to load schedules:', error);
  }
}

function editPolicy(policy: any) {
  editingPolicy.value = policy;
  form.name = policy.name;
  form.severityLevels = policy.severityLevels || [];
  form.channelIds = policy.channelIds || [];
  form.scheduleId = policy.scheduleId || '';
  form.isDefault = policy.isDefault;
  form.isEnabled = policy.isEnabled;
  showCreateDialog.value = true;
}

async function savePolicy() {
  if (!form.name || form.severityLevels.length === 0 || form.channelIds.length === 0) {
    ElMessage.warning('请填写完整信息');
    return;
  }
  
  try {
    if (editingPolicy.value) {
      await policiesApi.updatePolicy(editingPolicy.value.id, form);
      ElMessage.success('策略已更新');
    } else {
      await policiesApi.createPolicy(form);
      ElMessage.success('策略已创建');
    }
    
    showCreateDialog.value = false;
    resetForm();
    loadPolicies();
  } catch (error) {
    console.error('Failed to save policy:', error);
  }
}

async function deletePolicy(policy: any) {
  try {
    await ElMessageBox.confirm(
      `确定要删除策略 "${policy.name}" 吗?`,
      '删除确认',
      { type: 'warning' }
    );
    
    await policiesApi.deletePolicy(policy.id);
    ElMessage.success('策略已删除');
    loadPolicies();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to delete policy:', error);
    }
  }
}

function resetForm() {
  editingPolicy.value = null;
  form.name = '';
  form.severityLevels = [];
  form.channelIds = [];
  form.scheduleId = '';
  form.isDefault = false;
  form.isEnabled = true;
}

onMounted(() => {
  loadPolicies();
  loadChannels();
  loadSchedules();
});
</script>

<style scoped>
.policies-page {
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

.mr-5 {
  margin-right: 5px;
}

h2 {
  margin: 0;
  font-size: 18px;
}
</style>
