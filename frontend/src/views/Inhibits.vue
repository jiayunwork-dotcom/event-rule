<template>
  <div class="inhibits-page">
    <div class="page-header card">
      <div class="flex justify-between items-center">
        <h2>抑制规则</h2>
        <el-button type="primary" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          创建抑制规则
        </el-button>
      </div>
    </div>

    <div class="card">
      <el-table :data="rules" v-loading="loading" stripe>
        <el-table-column prop="name" label="名称" />
        <el-table-column label="源告警匹配" min-width="250">
          <template #default="{ row }">
            <el-tag
              v-for="m in row.sourceMatchers"
              :key="m.label"
              type="danger"
              size="small"
              class="mr-5 mb-5"
            >
              {{ m.label }} {{ m.type === 'regex' ? '~' : '=' }} {{ m.value }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="目标告警匹配" min-width="250">
          <template #default="{ row }">
            <el-tag
              v-for="m in row.targetMatchers"
              :key="m.label"
              type="warning"
              size="small"
              class="mr-5 mb-5"
            >
              {{ m.label }} {{ m.type === 'regex' ? '~' : '=' }} {{ m.value }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="相等标签" width="150">
          <template #default="{ row }">
            <el-tag v-for="label in row.equalLabels" :key="label" size="small" class="mr-5">
              {{ label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-switch
              :model-value="row.isEnabled"
              @change="(val) => toggleRule(row, val)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button type="danger" size="small" @click="deleteRule(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" title="创建抑制规则" width="600px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        
        <el-form-item label="源告警匹配" required>
          <div v-for="(m, index) in form.sourceMatchers" :key="index" class="matcher-row mb-10">
            <el-input v-model="m.label" placeholder="标签名" style="width: 120px" />
            <el-select v-model="m.type" style="width: 80px" class="ml-10">
              <el-option label="等于" value="eq" />
              <el-option label="正则" value="regex" />
            </el-select>
            <el-input v-model="m.value" placeholder="标签值" style="width: 150px" class="ml-10" />
            <el-button
              v-if="form.sourceMatchers.length > 1"
              type="danger"
              size="small"
              class="ml-10"
              @click="removeSourceMatcher(index)"
            >
              删除
            </el-button>
          </div>
          <el-button type="success" size="small" @click="addSourceMatcher">
            + 添加条件
          </el-button>
        </el-form-item>
        
        <el-form-item label="目标告警匹配" required>
          <div v-for="(m, index) in form.targetMatchers" :key="index" class="matcher-row mb-10">
            <el-input v-model="m.label" placeholder="标签名" style="width: 120px" />
            <el-select v-model="m.type" style="width: 80px" class="ml-10">
              <el-option label="等于" value="eq" />
              <el-option label="正则" value="regex" />
            </el-select>
            <el-input v-model="m.value" placeholder="标签值" style="width: 150px" class="ml-10" />
            <el-button
              v-if="form.targetMatchers.length > 1"
              type="danger"
              size="small"
              class="ml-10"
              @click="removeTargetMatcher(index)"
            >
              删除
            </el-button>
          </div>
          <el-button type="success" size="small" @click="addTargetMatcher">
            + 添加条件
          </el-button>
        </el-form-item>
        
        <el-form-item label="相等标签">
          <el-select
            v-model="form.equalLabels"
            multiple
            filterable
            allow-create
            placeholder="选择标签"
            style="width: 100%"
          >
            <el-option label="host" value="host" />
            <el-option label="service" value="service" />
            <el-option label="instance" value="instance" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="createRule">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { inhibitApi } from '@/services/apiEndpoints';
import { Plus } from '@element-plus/icons-vue';

const loading = ref(false);
const rules = ref<any[]>([]);
const showCreateDialog = ref(false);

const form = reactive({
  name: '',
  sourceMatchers: [{ label: '', type: 'eq' as const, value: '' }],
  targetMatchers: [{ label: '', type: 'eq' as const, value: '' }],
  equalLabels: [] as string[],
});

function addSourceMatcher() {
  form.sourceMatchers.push({ label: '', type: 'eq' as const, value: '' });
}

function removeSourceMatcher(index: number) {
  form.sourceMatchers.splice(index, 1);
}

function addTargetMatcher() {
  form.targetMatchers.push({ label: '', type: 'eq' as const, value: '' });
}

function removeTargetMatcher(index: number) {
  form.targetMatchers.splice(index, 1);
}

async function loadRules() {
  loading.value = true;
  try {
    const response = await inhibitApi.getInhibitRules();
    rules.value = response.data;
  } catch (error) {
    console.error('Failed to load inhibit rules:', error);
  } finally {
    loading.value = false;
  }
}

async function toggleRule(rule: any, isEnabled: boolean) {
  try {
    if (isEnabled) {
      await inhibitApi.enableInhibitRule(rule.id);
    } else {
      await inhibitApi.disableInhibitRule(rule.id);
    }
    ElMessage.success('规则状态已更新');
  } catch (error) {
    console.error('Failed to toggle rule:', error);
  }
}

async function createRule() {
  if (!form.name || 
      form.sourceMatchers.some(m => !m.label || !m.value) ||
      form.targetMatchers.some(m => !m.label || !m.value)) {
    ElMessage.warning('请填写完整信息');
    return;
  }
  
  try {
    await inhibitApi.createInhibitRule({
      name: form.name,
      sourceMatchers: form.sourceMatchers,
      targetMatchers: form.targetMatchers,
      equalLabels: form.equalLabels,
    });
    
    ElMessage.success('抑制规则创建成功');
    showCreateDialog.value = false;
    resetForm();
    loadRules();
  } catch (error) {
    console.error('Failed to create inhibit rule:', error);
  }
}

async function deleteRule(rule: any) {
  try {
    await ElMessageBox.confirm(
      `确定要删除抑制规则 "${rule.name}" 吗?`,
      '删除确认',
      { type: 'warning' }
    );
    
    await inhibitApi.deleteInhibitRule(rule.id);
    ElMessage.success('抑制规则已删除');
    loadRules();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to delete inhibit rule:', error);
    }
  }
}

function resetForm() {
  form.name = '';
  form.sourceMatchers = [{ label: '', type: 'eq' as const, value: '' }];
  form.targetMatchers = [{ label: '', type: 'eq' as const, value: '' }];
  form.equalLabels = [];
}

onMounted(() => {
  loadRules();
});
</script>

<style scoped>
.inhibits-page {
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
