<template>
  <el-drawer
    :model-value="visible"
    title="版本历史"
    size="720px"
    :before-close="handleClose"
    class="version-history-drawer"
  >
    <div class="version-history">
      <div class="filter-bar">
        <el-date-picker
          v-model="filterTimeRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          size="small"
          format="YYYY-MM-DD HH:mm"
          value-format="YYYY-MM-DDTHH:mm:ssZ"
          @change="loadVersions"
        />
        <el-select
          v-model="filterCreatedBy"
          placeholder="操作人筛选"
          clearable
          size="small"
          style="width: 140px"
          @change="loadVersions"
        >
          <el-option
            v-for="creator in creators"
            :key="creator"
            :label="creator"
            :value="creator"
          />
        </el-select>
      </div>

      <div v-if="diffMode" class="diff-view">
        <div class="diff-header">
          <div class="diff-stats">
            <el-tag type="success" size="small">新增 {{ diffData?.diff?.added || 0 }} 项</el-tag>
            <el-tag type="danger" size="small">删除 {{ diffData?.diff?.removed || 0 }} 项</el-tag>
            <el-tag type="warning" size="small">修改 {{ diffData?.diff?.modified || 0 }} 项</el-tag>
          </div>
          <el-button size="small" @click="exitDiffMode">退出对比</el-button>
        </div>

        <div class="diff-columns">
          <div class="diff-col">
            <div class="diff-col-title">
              版本 {{ diffData?.versionA?.versionNumber }}
              <span class="diff-col-time">{{ formatTime(diffData?.versionA?.createdAt) }}</span>
            </div>
            <div class="diff-col-content">
              <template v-for="field in diffData?.diff?.fields || []" :key="field.field">
                <div
                  v-if="field.type === 'modified'"
                  class="diff-item diff-modified"
                >
                  <div class="diff-field-name">{{ getFieldLabel(field.field) }}</div>
                  <div class="diff-old-value">{{ formatFieldValue(field.oldValue) }}</div>
                </div>
                <div
                  v-if="field.type === 'removed'"
                  class="diff-item diff-removed"
                >
                  <div class="diff-field-name">{{ getFieldLabel(field.field) }}</div>
                  <div class="diff-old-value">{{ formatFieldValue(field.oldValue || field.removedItems) }}</div>
                </div>
              </template>
            </div>
          </div>
          <div class="diff-col">
            <div class="diff-col-title">
              版本 {{ diffData?.versionB?.versionNumber }}
              <span class="diff-col-time">{{ formatTime(diffData?.versionB?.createdAt) }}</span>
            </div>
            <div class="diff-col-content">
              <template v-for="field in diffData?.diff?.fields || []" :key="field.field + '-new'">
                <div
                  v-if="field.type === 'modified'"
                  class="diff-item diff-modified"
                >
                  <div class="diff-field-name">{{ getFieldLabel(field.field) }}</div>
                  <div class="diff-new-value">{{ formatFieldValue(field.newValue) }}</div>
                </div>
                <div
                  v-if="field.type === 'added'"
                  class="diff-item diff-added"
                >
                  <div class="diff-field-name">{{ getFieldLabel(field.field) }}</div>
                  <div class="diff-new-value">{{ formatFieldValue(field.newValue || field.addedItems) }}</div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="timeline-container">
        <div v-if="previewVersion" class="preview-panel">
          <div class="preview-header">
            <span>版本 {{ previewVersion.versionNumber }} 详情预览（只读）</span>
            <el-button size="small" text @click="previewVersion = null">关闭预览</el-button>
          </div>
          <div class="preview-content">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="名称">{{ previewVersion.snapshot.name }}</el-descriptions-item>
              <el-descriptions-item label="描述">{{ previewVersion.snapshot.description || '无' }}</el-descriptions-item>
              <el-descriptions-item label="严重程度">
                <el-tag :type="getSeverityType(previewVersion.snapshot.severity)" size="small">
                  {{ previewVersion.snapshot.severity?.toUpperCase() }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="条件类型">{{ getConditionTypeText(previewVersion.snapshot.conditionType) }}</el-descriptions-item>
              <el-descriptions-item label="优先级">{{ previewVersion.snapshot.priority }}</el-descriptions-item>
              <el-descriptions-item label="启用状态">
                <el-tag :type="previewVersion.snapshot.isEnabled ? 'success' : 'info'" size="small">
                  {{ previewVersion.snapshot.isEnabled ? '启用' : '禁用' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="窗口大小">{{ previewVersion.snapshot.windowSize }}秒</el-descriptions-item>
              <el-descriptions-item label="聚合标签">
                <el-tag v-for="tag in (previewVersion.snapshot.groupByLabels || [])" :key="tag" size="small" class="mr-5">{{ tag }}</el-tag>
                <span v-if="!previewVersion.snapshot.groupByLabels?.length" class="text-muted">无</span>
              </el-descriptions-item>
              <el-descriptions-item label="条件配置">
                <pre class="conditions-preview">{{ JSON.stringify(previewVersion.snapshot.conditions, null, 2) }}</pre>
              </el-descriptions-item>
              <el-descriptions-item v-if="previewVersion.snapshot.dsl" label="DSL">
                <pre class="dsl-preview">{{ previewVersion.snapshot.dsl }}</pre>
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </div>

        <div class="diff-select-bar" v-if="selectedForDiff.length > 0">
          <span>已选择 {{ selectedForDiff.length }}/2 个版本进行对比</span>
          <el-button
            type="primary"
            size="small"
            :disabled="selectedForDiff.length !== 2"
            @click="doDiff"
          >
            开始对比
          </el-button>
          <el-button size="small" @click="selectedForDiff = []">取消选择</el-button>
        </div>

        <div v-loading="loading" class="timeline-list">
          <div
            v-for="version in versions"
            :key="version.id"
            class="timeline-item"
            :class="{ 'selected-for-diff': isSelectedForDiff(version.id) }"
          >
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <div class="timeline-main">
                <div class="timeline-left">
                  <el-checkbox
                    :model-value="isSelectedForDiff(version.id)"
                    @change="(val) => toggleDiffSelection(version.id, val)"
                    size="small"
                  />
                  <span class="version-number">V{{ version.versionNumber }}</span>
                  <span class="change-summary">{{ version.changeSummary }}</span>
                </div>
                <div class="timeline-right">
                  <span class="version-meta">
                    <span v-if="version.createdBy" class="version-operator">{{ version.createdBy }}</span>
                    <span class="version-time">{{ formatTime(version.createdAt) }}</span>
                  </span>
                  <div class="version-actions">
                    <el-button size="small" text type="primary" @click="previewVersion = version">
                      预览
                    </el-button>
                    <el-button
                      size="small"
                      text
                      type="warning"
                      @click="confirmRollback(version)"
                    >
                      回滚到此版本
                    </el-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <el-empty v-if="!loading && versions.length === 0" description="暂无版本记录" />
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import dayjs from 'dayjs';
import {
  versionsApi,
  RuleVersion,
  VersionDiffResult,
} from '@/services/apiEndpoints';

const props = defineProps<{
  visible: boolean;
  ruleId: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'rolled-back'): void;
}>();

const loading = ref(false);
const versions = ref<RuleVersion[]>([]);
const creators = ref<string[]>([]);
const previewVersion = ref<RuleVersion | null>(null);
const selectedForDiff = ref<string[]>([]);
const diffMode = ref(false);
const diffData = ref<VersionDiffResult | null>(null);

const filterTimeRange = ref<[string, string] | null>(null);
const filterCreatedBy = ref<string>('');

function handleClose() {
  emit('update:visible', false);
  previewVersion.value = null;
  selectedForDiff.value = [];
  diffMode.value = false;
  diffData.value = null;
}

function formatTime(time?: string) {
  if (!time) return '';
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

function getFieldLabel(field: string): string {
  const map: Record<string, string> = {
    name: '规则名称',
    description: '描述',
    severity: '严重程度',
    conditionType: '条件类型',
    conditions: '条件配置',
    dsl: 'DSL规则',
    priority: '优先级',
    isEnabled: '启用状态',
    windowSize: '窗口大小',
    groupByLabels: '聚合标签',
    'conditions.operator': '条件逻辑运算符',
  };
  if (map[field]) return map[field];
  if (field.startsWith('conditions.conditions[')) {
    const match = field.match(/conditions\.conditions\[(\d+)\]\.?(\w*)?/);
    if (match) {
      const idx = parseInt(match[1]) + 1;
      const prop = match[2];
      const propMap: Record<string, string> = {
        type: '类型',
        metric: '指标',
        operator: '操作符',
        value: '阈值',
        label: '标签',
        labelValue: '标签值',
        aggregate: '聚合函数',
        threshold: '阈值',
        windowSize: '窗口大小',
        eventA: '前置事件',
        eventB: '后续事件',
        interval: '时间间隔',
      };
      return prop ? `条件${idx}.${propMap[prop] || prop}` : `条件${idx}`;
    }
  }
  return field;
}

function formatFieldValue(value: any): string {
  if (value === undefined || value === null) return '无';
  if (Array.isArray(value)) return value.join(', ') || '无';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function isSelectedForDiff(versionId: string): boolean {
  return selectedForDiff.value.includes(versionId);
}

function toggleDiffSelection(versionId: string, checked: boolean | string | number) {
  if (checked) {
    if (selectedForDiff.value.length < 2) {
      selectedForDiff.value.push(versionId);
    } else {
      selectedForDiff.value.shift();
      selectedForDiff.value.push(versionId);
    }
  } else {
    selectedForDiff.value = selectedForDiff.value.filter(id => id !== versionId);
  }
}

async function loadVersions() {
  if (!props.ruleId) return;
  loading.value = true;
  try {
    const params: any = {};
    if (filterTimeRange.value) {
      params.startTime = filterTimeRange.value[0];
      params.endTime = filterTimeRange.value[1];
    }
    if (filterCreatedBy.value) {
      params.createdBy = filterCreatedBy.value;
    }
    const response = await versionsApi.getVersions(props.ruleId, params);
    versions.value = response.data;
  } catch (error) {
    console.error('Failed to load versions:', error);
  } finally {
    loading.value = false;
  }
}

async function loadCreators() {
  if (!props.ruleId) return;
  try {
    const response = await versionsApi.getVersionCreators(props.ruleId);
    creators.value = response.data;
  } catch (error) {
    console.error('Failed to load creators:', error);
  }
}

async function doDiff() {
  if (selectedForDiff.value.length !== 2 || !props.ruleId) return;
  try {
    const response = await versionsApi.diffVersions(
      props.ruleId,
      selectedForDiff.value[0],
      selectedForDiff.value[1],
    );
    diffData.value = response.data;
    diffMode.value = true;
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '版本对比失败');
  }
}

function exitDiffMode() {
  diffMode.value = false;
  diffData.value = null;
  selectedForDiff.value = [];
}

async function confirmRollback(version: RuleVersion) {
  try {
    await ElMessageBox.confirm(
      `确定要将规则回滚到版本 ${version.versionNumber} 吗？回滚后将创建一条新的版本记录。`,
      '回滚确认',
      { type: 'warning', confirmButtonText: '确定回滚', cancelButtonText: '取消' },
    );

    await versionsApi.rollback(props.ruleId, version.id, 'current_user');
    ElMessage.success(`已回滚到版本 ${version.versionNumber}`);
    previewVersion.value = null;
    emit('rolled-back');
    loadVersions();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.message || '回滚失败');
    }
  }
}

watch(
  () => props.visible,
  (val) => {
    if (val && props.ruleId) {
      loadVersions();
      loadCreators();
      previewVersion.value = null;
      selectedForDiff.value = [];
      diffMode.value = false;
      diffData.value = null;
    }
  },
);
</script>

<style scoped>
.version-history {
  padding: 0 4px;
}

.filter-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.diff-view {
  height: 100%;
}

.diff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.diff-stats {
  display: flex;
  gap: 8px;
}

.diff-columns {
  display: flex;
  gap: 12px;
}

.diff-col {
  flex: 1;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  overflow: hidden;
}

.diff-col-title {
  padding: 8px 12px;
  background: #f5f7fa;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid #e4e7ed;
}

.diff-col-time {
  font-weight: normal;
  color: #909399;
  font-size: 12px;
  margin-left: 8px;
}

.diff-col-content {
  padding: 8px;
  max-height: calc(100vh - 260px);
  overflow-y: auto;
}

.diff-item {
  padding: 6px 10px;
  margin-bottom: 4px;
  border-radius: 4px;
  font-size: 13px;
}

.diff-field-name {
  font-weight: 600;
  color: #606266;
  margin-bottom: 4px;
  font-size: 12px;
}

.diff-modified {
  background: #fdf6ec;
  border-left: 3px solid #e6a23c;
}

.diff-removed {
  background: #fef0f0;
  border-left: 3px solid #f56c6c;
}

.diff-added {
  background: #f0f9eb;
  border-left: 3px solid #67c23a;
}

.diff-old-value {
  color: #f56c6c;
  text-decoration: line-through;
  word-break: break-all;
}

.diff-new-value {
  color: #67c23a;
  word-break: break-all;
}

.timeline-container {
  position: relative;
}

.preview-panel {
  margin-bottom: 16px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  overflow: hidden;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f5f7fa;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid #e4e7ed;
}

.preview-content {
  padding: 12px;
  max-height: 320px;
  overflow-y: auto;
}

.conditions-preview {
  background: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.dsl-preview {
  background: #282c34;
  color: #abb2bf;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.diff-select-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #ecf5ff;
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #409eff;
}

.timeline-list {
  position: relative;
  padding-left: 20px;
}

.timeline-item {
  position: relative;
  padding-left: 24px;
  padding-bottom: 16px;
  border-left: 2px solid #e4e7ed;
}

.timeline-item:last-child {
  border-left-color: transparent;
  padding-bottom: 0;
}

.timeline-item.selected-for-diff {
  border-left-color: #409eff;
}

.timeline-dot {
  position: absolute;
  left: -7px;
  top: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #c0c4cc;
  border: 2px solid #fff;
}

.timeline-item:first-child .timeline-dot {
  background: #409eff;
}

.timeline-item.selected-for-diff .timeline-dot {
  background: #409eff;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.2);
}

.timeline-content {
  background: #fff;
  border-radius: 6px;
}

.timeline-main {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.timeline-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.timeline-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.version-number {
  font-weight: 600;
  color: #409eff;
  font-size: 13px;
}

.change-summary {
  font-size: 13px;
  color: #303133;
}

.version-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #909399;
}

.version-operator {
  color: #606266;
}

.version-actions {
  display: flex;
  gap: 4px;
}

.text-muted {
  color: #909399;
}

.mr-5 {
  margin-right: 5px;
}
</style>
