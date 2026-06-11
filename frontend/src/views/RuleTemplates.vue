<template>
  <div class="rule-templates-page">
    <div class="page-header card">
      <div class="flex justify-between items-center">
        <h2>规则模板</h2>
        <div class="header-actions">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索模板名称或描述"
            style="width: 250px"
            clearable
            @input="onSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select
            v-model="selectedTag"
            placeholder="按场景筛选"
            style="width: 180px; margin-left: 12px"
            clearable
            @change="loadTemplates"
          >
            <el-option
              v-for="tag in sceneTags"
              :key="tag"
              :label="tag"
              :value="tag"
            />
          </el-select>
          <el-select
            v-model="templateType"
            placeholder="模板类型"
            style="width: 140px; margin-left: 12px"
            clearable
            @change="loadTemplates"
          >
            <el-option label="系统模板" value="system" />
            <el-option label="自定义模板" value="custom" />
          </el-select>
        </div>
      </div>
    </div>

    <div class="card">
      <div v-loading="loading" class="templates-grid">
        <div
          v-for="template in templates"
          :key="template.id"
          class="template-card"
          @click="openCreateFromTemplate(template)"
        >
          <div class="template-card-header">
            <div class="template-title">
              <el-icon class="template-icon" :class="template.type">
                <Promotion v-if="template.type === 'system'" />
                <Document v-else />
              </el-icon>
              <span class="template-name">{{ template.name }}</span>
            </div>
            <el-tag :type="getSeverityType(template.severity)" size="small" effect="dark">
              {{ template.severity.toUpperCase() }}
            </el-tag>
          </div>

          <div class="template-card-body">
            <p class="template-desc">{{ template.description }}</p>

            <div class="template-info">
              <div class="info-item">
                <span class="info-label">条件类型：</span>
                <span class="info-value">{{ getConditionTypeText(template.conditionType) }}</span>
              </div>
              <div class="info-item" v-if="template.suggestedThreshold">
                <span class="info-label">建议阈值：</span>
                <span class="info-value highlight">{{ template.suggestedThreshold }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">优先级：</span>
                <span class="info-value">{{ template.priority }}</span>
              </div>
            </div>

            <div class="template-tags">
              <el-tag
                v-for="tag in template.sceneTags"
                :key="tag"
                size="small"
                type="info"
                effect="plain"
              >
                {{ tag }}
              </el-tag>
            </div>
          </div>

          <div class="template-card-footer">
            <el-tag size="small" :type="template.type === 'system' ? 'success' : 'primary'" effect="light">
              {{ template.type === 'system' ? '系统模板' : '自定义模板' }}
            </el-tag>
            <div class="card-actions" @click.stop>
              <el-button
                v-if="template.type === 'custom'"
                type="danger"
                size="small"
                text
                @click="deleteTemplate(template)"
              >
                删除
              </el-button>
              <el-button type="primary" size="small" @click="openCreateFromTemplate(template)">
                使用模板
              </el-button>
            </div>
          </div>
        </div>

        <el-empty v-if="templates.length === 0 && !loading" description="暂无模板数据" />
      </div>
    </div>

    <el-dialog
      v-model="createDialogVisible"
      title="从模板创建规则"
      width="600px"
      :close-on-click-modal="false"
    >
      <div v-if="selectedTemplate" class="create-from-template">
        <el-alert
          :title="`模板：${selectedTemplate.name}`"
          type="info"
          :closable="false"
          class="mb-20"
        >
          <template #default>
            <p>{{ selectedTemplate.description }}</p>
          </template>
        </el-alert>

        <el-form :model="ruleForm" label-width="100px">
          <el-form-item label="规则名称" required>
            <el-input v-model="ruleForm.name" placeholder="请输入规则名称" />
          </el-form-item>

          <el-form-item label="描述">
            <el-input
              v-model="ruleForm.description"
              type="textarea"
              :rows="2"
              placeholder="请输入规则描述"
            />
          </el-form-item>

          <el-form-item label="严重程度">
            <el-select v-model="ruleForm.severity" style="width: 200px">
              <el-option label="FATAL" value="fatal" />
              <el-option label="CRITICAL" value="critical" />
              <el-option label="WARNING" value="warning" />
              <el-option label="INFO" value="info" />
            </el-select>
          </el-form-item>

          <el-form-item label="优先级">
            <el-input-number v-model="ruleForm.priority" :min="0" :max="100" />
          </el-form-item>

          <el-form-item label="是否启用">
            <el-switch v-model="ruleForm.isEnabled" />
          </el-form-item>
        </el-form>

        <div class="tip">
          <el-icon><InfoFilled /></el-icon>
          <span>创建后可在规则编辑页进行更详细的配置调整</span>
        </div>
      </div>

      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createRuleFromTemplate">
          创建并编辑
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Search,
  Promotion,
  Document,
  InfoFilled,
} from '@element-plus/icons-vue';
import { templatesApi, rulesApi, RuleTemplate } from '@/services/apiEndpoints';

const router = useRouter();
const loading = ref(false);
const templates = ref<RuleTemplate[]>([]);
const sceneTags = ref<string[]>([]);
const searchKeyword = ref('');
const selectedTag = ref('');
const templateType = ref('');

const createDialogVisible = ref(false);
const selectedTemplate = ref<RuleTemplate | null>(null);
const creating = ref(false);

const ruleForm = reactive({
  name: '',
  description: '',
  severity: 'warning' as 'info' | 'warning' | 'critical' | 'fatal',
  priority: 0,
  isEnabled: true,
});

let searchTimer: ReturnType<typeof setTimeout> | null = null;

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

async function loadTemplates() {
  loading.value = true;
  try {
    const params: Record<string, string> = {};
    if (searchKeyword.value) params.keyword = searchKeyword.value;
    if (selectedTag.value) params.sceneTag = selectedTag.value;
    if (templateType.value) params.type = templateType.value;

    const response = await templatesApi.getTemplates(params);
    templates.value = response.data;
  } catch (error) {
    console.error('Failed to load templates:', error);
  } finally {
    loading.value = false;
  }
}

async function loadSceneTags() {
  try {
    const response = await templatesApi.getSceneTags();
    sceneTags.value = response.data;
  } catch (error) {
    console.error('Failed to load scene tags:', error);
  }
}

function onSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    loadTemplates();
  }, 300);
}

function openCreateFromTemplate(template: RuleTemplate) {
  selectedTemplate.value = template;
  ruleForm.name = template.name + ' - 副本';
  ruleForm.description = template.description || '';
  ruleForm.severity = template.severity;
  ruleForm.priority = template.priority;
  ruleForm.isEnabled = true;
  createDialogVisible.value = true;
}

async function createRuleFromTemplate() {
  if (!selectedTemplate.value || !ruleForm.name) {
    ElMessage.warning('请输入规则名称');
    return;
  }

  creating.value = true;
  try {
    const template = selectedTemplate.value;
    const newRule = {
      name: ruleForm.name,
      description: ruleForm.description,
      severity: ruleForm.severity,
      conditionType: template.conditionType,
      conditions: template.conditions,
      dsl: template.dsl,
      priority: ruleForm.priority,
      isEnabled: ruleForm.isEnabled,
      windowSize: template.windowSize,
      groupByLabels: template.groupByLabels || [],
    };

    const response = await rulesApi.createRule(newRule);
    ElMessage.success('规则创建成功');
    createDialogVisible.value = false;
    router.push(`/rules/${response.data.id}/edit`);
  } catch (error) {
    console.error('Failed to create rule from template:', error);
  } finally {
    creating.value = false;
  }
}

async function deleteTemplate(template: RuleTemplate) {
  try {
    await ElMessageBox.confirm(
      `确定要删除模板 "${template.name}" 吗?`,
      '删除确认',
      { type: 'warning' }
    );

    await templatesApi.deleteTemplate(template.id);
    ElMessage.success('模板已删除');
    loadTemplates();
    loadSceneTags();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to delete template:', error);
    }
  }
}

onMounted(() => {
  loadTemplates();
  loadSceneTags();
});
</script>

<style scoped>
.rule-templates-page {
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

.header-actions {
  display: flex;
  align-items: center;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.template-card {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
}

.template-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  border-color: #409eff;
}

.template-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.template-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.template-icon {
  font-size: 20px;
}

.template-icon.system {
  color: #67c23a;
}

.template-icon.custom {
  color: #409eff;
}

.template-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.template-card-body {
  flex: 1;
}

.template-desc {
  color: #606266;
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 12px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.template-info {
  margin-bottom: 12px;
}

.info-item {
  display: flex;
  font-size: 13px;
  margin-bottom: 6px;
}

.info-label {
  color: #909399;
  margin-right: 8px;
}

.info-value {
  color: #606266;
}

.info-value.highlight {
  color: #409eff;
  font-weight: 600;
}

.template-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.template-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
  margin-top: 12px;
}

.card-actions {
  display: flex;
  gap: 8px;
}

.create-from-template {
  padding: 10px 0;
}

.mb-20 {
  margin-bottom: 20px;
}

.tip {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #909399;
  font-size: 13px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
  margin-top: 16px;
}

h2 {
  margin: 0;
  font-size: 18px;
}
</style>
