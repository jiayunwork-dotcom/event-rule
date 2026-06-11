<template>
  <div class="silences-page">
    <div class="page-header card">
      <div class="flex justify-between items-center">
        <h2>静默规则</h2>
        <el-button type="primary" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          创建静默
        </el-button>
      </div>
    </div>

    <div class="card">
      <el-table :data="silences" v-loading="loading" stripe>
        <el-table-column prop="name" label="名称" />
        <el-table-column label="匹配条件" min-width="300">
          <template #default="{ row }">
            <el-tag
              v-for="m in row.matchers"
              :key="m.label"
              size="small"
              class="mr-5 mb-5"
            >
              {{ m.label }} {{ m.type === 'regex' ? '~' : '=' }} {{ m.value }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="startsAt" label="开始时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.startsAt) }}
          </template>
        </el-table-column>
        <el-table-column prop="endsAt" label="结束时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.endsAt) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row)">
              {{ getStatusText(row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="comment" label="备注" show-overflow-tooltip />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button type="danger" size="small" @click="deleteSilence(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" title="创建静默规则" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        
        <el-form-item label="匹配条件" required>
          <div v-for="(m, index) in form.matchers" :key="index" class="matcher-row mb-10">
            <el-input v-model="m.label" placeholder="标签名" style="width: 120px" />
            <el-select v-model="m.type" style="width: 80px" class="ml-10">
              <el-option label="等于" value="eq" />
              <el-option label="正则" value="regex" />
            </el-select>
            <el-input v-model="m.value" placeholder="标签值" style="width: 150px" class="ml-10" />
            <el-button
              v-if="form.matchers.length > 1"
              type="danger"
              size="small"
              class="ml-10"
              @click="removeMatcher(index)"
            >
              删除
            </el-button>
          </div>
          <el-button type="success" size="small" @click="addMatcher">
            + 添加条件
          </el-button>
        </el-form-item>
        
        <el-form-item label="时间范围" required>
          <el-date-picker
            v-model="form.dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            value-format="YYYY-MM-DDTHH:mm:ss"
          />
        </el-form-item>
        
        <el-form-item label="备注">
          <el-input v-model="form.comment" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="createSilence">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import dayjs from 'dayjs';
import { silencesApi } from '@/services/apiEndpoints';
import { Plus } from '@element-plus/icons-vue';

const loading = ref(false);
const silences = ref<any[]>([]);
const showCreateDialog = ref(false);

const form = reactive({
  name: '',
  matchers: [{ label: '', type: 'eq' as const, value: '' }],
  dateRange: [] as string[],
  comment: '',
});

function formatTime(time: string) {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss');
}

function getStatusType(silence: any) {
  const now = new Date();
  const start = new Date(silence.startsAt);
  const end = new Date(silence.endsAt);
  
  if (!silence.isActive) return 'info';
  if (now < start) return 'warning';
  if (now > end) return 'info';
  return 'success';
}

function getStatusText(silence: any) {
  const now = new Date();
  const start = new Date(silence.startsAt);
  const end = new Date(silence.endsAt);
  
  if (!silence.isActive) return '已失效';
  if (now < start) return '未开始';
  if (now > end) return '已过期';
  return '生效中';
}

function addMatcher() {
  form.matchers.push({ label: '', type: 'eq' as const, value: '' });
}

function removeMatcher(index: number) {
  form.matchers.splice(index, 1);
}

async function loadSilences() {
  loading.value = true;
  try {
    const response = await silencesApi.getSilences();
    silences.value = response.data;
  } catch (error) {
    console.error('Failed to load silences:', error);
  } finally {
    loading.value = false;
  }
}

async function createSilence() {
  if (!form.name || form.matchers.some(m => !m.label || !m.value) || form.dateRange.length !== 2) {
    ElMessage.warning('请填写完整信息');
    return;
  }
  
  try {
    await silencesApi.createSilence({
      name: form.name,
      matchers: form.matchers,
      startsAt: new Date(form.dateRange[0]),
      endsAt: new Date(form.dateRange[1]),
      comment: form.comment,
    });
    
    ElMessage.success('静默规则创建成功');
    showCreateDialog.value = false;
    resetForm();
    loadSilences();
  } catch (error) {
    console.error('Failed to create silence:', error);
  }
}

async function deleteSilence(silence: any) {
  try {
    await ElMessageBox.confirm(
      `确定要删除静默规则 "${silence.name}" 吗?`,
      '删除确认',
      { type: 'warning' }
    );
    
    await silencesApi.deleteSilence(silence.id);
    ElMessage.success('静默规则已删除');
    loadSilences();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to delete silence:', error);
    }
  }
}

function resetForm() {
  form.name = '';
  form.matchers = [{ label: '', type: 'eq' as const, value: '' }];
  form.dateRange = [];
  form.comment = '';
}

onMounted(() => {
  loadSilences();
});
</script>

<style scoped>
.silences-page {
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

.matcher-row {
  display: flex;
  align-items: center;
}

.ml-10 {
  margin-left: 10px;
}

.mr-5 {
  margin-right: 5px;
}

.mb-5 {
  margin-bottom: 5px;
}

.mb-10 {
  margin-bottom: 10px;
}

h2 {
  margin: 0;
  font-size: 18px;
}
</style>
