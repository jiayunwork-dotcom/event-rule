<template>
  <div class="rules-page">
    <div class="page-header card">
      <div class="flex justify-between items-center">
        <h2>规则管理</h2>
        <div>
          <el-button type="primary" @click="goToCreate">
            <el-icon><Plus /></el-icon>
            创建规则
          </el-button>
        </div>
      </div>
    </div>

    <div class="card">
      <el-table :data="rules" v-loading="loading" stripe>
        <el-table-column width="60" type="index" />
        
        <el-table-column prop="name" label="规则名称" min-width="150" show-overflow-tooltip />
        
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        
        <el-table-column prop="severity" label="严重程度" width="100">
          <template #default="{ row }">
            <el-tag :type="getSeverityType(row.severity)" effect="dark">
              {{ row.severity.toUpperCase() }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column prop="conditionType" label="条件类型" width="130">
          <template #default="{ row }">
            {{ getConditionTypeText(row.conditionType) }}
          </template>
        </el-table-column>
        
        <el-table-column prop="priority" label="优先级" width="80" />
        
        <el-table-column prop="isEnabled" label="状态" width="90">
          <template #default="{ row }">
            <el-switch
              :model-value="row.isEnabled"
              @change="(val) => toggleRule(row, val)"
              active-text="启用"
              inactive-text="禁用"
            />
          </template>
        </el-table-column>
        
        <el-table-column prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="editRule(row)">
              编辑
            </el-button>
            <el-button type="danger" size="small" @click="deleteRule(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import dayjs from 'dayjs';
import { rulesApi, Rule } from '@/services/apiEndpoints';
import { Plus } from '@element-plus/icons-vue';

const router = useRouter();
const loading = ref(false);
const rules = ref<Rule[]>([]);

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

function getConditionTypeText(type: string) {
  const map: Record<string, string> = {
    single_threshold: '单指标阈值',
    multi_condition: '多指标组合',
    window_aggregate: '时间窗口聚合',
    frequency: '频率条件',
    label_match: '标签匹配',
    sequence_pattern: '序列模式',
    dsl: 'DSL规则',
  };
  return map[type] || type;
}

async function loadRules() {
  loading.value = true;
  try {
    const response = await rulesApi.getRules();
    rules.value = response.data.sort((a, b) => b.priority - a.priority);
  } catch (error) {
    console.error('Failed to load rules:', error);
  } finally {
    loading.value = false;
  }
}

async function toggleRule(rule: Rule, isEnabled: boolean) {
  try {
    if (isEnabled) {
      await rulesApi.enableRule(rule.id);
      ElMessage.success('规则已启用');
    } else {
      await rulesApi.disableRule(rule.id);
      ElMessage.success('规则已禁用');
    }
    loadRules();
  } catch (error) {
    console.error('Failed to toggle rule:', error);
  }
}

async function deleteRule(rule: Rule) {
  try {
    await ElMessageBox.confirm(
      `确定要删除规则 "${rule.name}" 吗?`,
      '删除确认',
      { type: 'warning' }
    );
    
    await rulesApi.deleteRule(rule.id);
    ElMessage.success('规则已删除');
    loadRules();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to delete rule:', error);
    }
  }
}

function goToCreate() {
  router.push('/rules/new');
}

function editRule(rule: Rule) {
  router.push(`/rules/${rule.id}/edit`);
}

onMounted(() => {
  loadRules();
});
</script>

<style scoped>
.rules-page {
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
