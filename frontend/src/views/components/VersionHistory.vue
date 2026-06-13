<template>
  <el-drawer
    :model-value="visible"
    title="版本历史"
    size="860px"
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
        <el-select
          v-model="filterTag"
          placeholder="标签筛选"
          clearable
          size="small"
          style="width: 140px"
          @change="loadVersions"
        >
          <el-option
            v-for="tag in allTags"
            :key="tag"
            :label="tag"
            :value="tag"
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
          <div class="diff-mode-toggle">
            <el-radio-group v-model="diffViewMode" size="small">
              <el-radio-button value="field">字段对比</el-radio-button>
              <el-radio-button value="tree">条件树对比</el-radio-button>
            </el-radio-group>
          </div>
          <el-button size="small" @click="exitDiffMode">退出对比</el-button>
        </div>

        <div v-if="diffViewMode === 'field'" class="diff-columns">
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

        <div v-else class="condition-tree-diff">
          <div class="tree-diff-columns">
            <div class="tree-diff-col">
              <div class="diff-col-title">
                版本 {{ diffData?.versionA?.versionNumber }}
                <span class="diff-col-time">{{ formatTime(diffData?.versionA?.createdAt) }}</span>
              </div>
              <div class="tree-diff-content">
                <ConditionTreeNode
                  :node="diffData?.conditionTreeDiff?.leftTree"
                  :side="'left'"
                  :mappings="diffData?.conditionTreeDiff?.mappings || []"
                />
              </div>
            </div>
            <div class="tree-diff-col">
              <div class="diff-col-title">
                版本 {{ diffData?.versionB?.versionNumber }}
                <span class="diff-col-time">{{ formatTime(diffData?.versionB?.createdAt) }}</span>
              </div>
              <div class="tree-diff-content">
                <ConditionTreeNode
                  :node="diffData?.conditionTreeDiff?.rightTree"
                  :side="'right'"
                  :mappings="diffData?.conditionTreeDiff?.mappings || []"
                />
              </div>
            </div>
          </div>
          <div v-if="hasStructuralChanges" class="structural-change-hint">
            <el-icon><Warning /></el-icon>
            条件树结构发生了变化（如AND/OR切换或嵌套层级变化），虚线连接表示对应映射关系
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
            :class="{
              'selected-for-diff': isSelectedForDiff(version.id),
              'is-favorite': version.isFavorite,
              'batch-selected': batchSelectedIds.includes(version.id),
            }"
          >
            <div class="timeline-dot" :class="{ 'favorite-dot': version.isFavorite }"></div>
            <div class="timeline-content">
              <div class="timeline-main">
                <div class="timeline-left">
                  <el-checkbox
                    v-if="batchMode"
                    :model-value="batchSelectedIds.includes(version.id)"
                    @change="(val: boolean | string | number) => toggleBatchSelection(version.id, val)"
                    size="small"
                  />
                  <el-checkbox
                    v-else
                    :model-value="isSelectedForDiff(version.id)"
                    @change="(val: boolean | string | number) => toggleDiffSelection(version.id, val)"
                    size="small"
                  />
                  <el-icon
                    class="favorite-star"
                    :class="{ 'is-starred': version.isFavorite }"
                    @click="handleToggleFavorite(version)"
                  >
                    <StarFilled v-if="version.isFavorite" />
                    <Star v-else />
                  </el-icon>
                  <span class="version-number">V{{ version.versionNumber }}</span>
                  <div class="tag-badges">
                    <el-tag
                      v-for="tag in (version.tags || [])"
                      :key="tag"
                      size="small"
                      type="info"
                      closable
                      @close="handleRemoveTag(version, tag)"
                      class="tag-badge"
                    >
                      {{ tag }}
                    </el-tag>
                    <el-button
                      size="small"
                      text
                      type="primary"
                      @click="openAddTagDialog(version)"
                      class="add-tag-btn"
                    >
                      +标签
                    </el-button>
                  </div>
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
                      @click="openRollbackPreview(version)"
                    >
                      回滚到此版本
                    </el-button>
                  </div>
                </div>
              </div>
              <div class="change-summary-row">
                <div
                  class="structured-summary"
                  :class="{ collapsed: !expandedSummaries[version.id] }"
                  @click="toggleSummaryExpand(version.id)"
                >
                  <template v-if="isStructuredSummary(version.changeSummary)">
                    <div
                      v-for="(item, idx) in (version.changeSummary as ChangeSummaryItem[])"
                      :key="idx"
                      class="summary-item"
                      :class="{ 'status-change': item.isStatusChange, 'status-enabled': item.statusChangeType === 'enabled', 'status-disabled': item.statusChangeType === 'disabled' }"
                    >
                      <span v-if="item.isStatusChange" class="status-icon">{{ item.statusChangeType === 'enabled' ? '⚠️' : '⚠️' }}</span>
                      <span class="summary-text">{{ item.displayText }}</span>
                      <span v-if="item.oldValue !== undefined && item.newValue !== undefined && !item.isStatusChange" class="summary-detail">
                        ({{ formatFieldValue(item.oldValue) }} → {{ formatFieldValue(item.newValue) }})
                      </span>
                    </div>
                  </template>
                  <template v-else>
                    <div class="summary-item">{{ version.changeSummary }}</div>
                  </template>
                </div>
                <el-icon class="expand-icon" @click="toggleSummaryExpand(version.id)">
                  <ArrowUp v-if="expandedSummaries[version.id]" />
                  <ArrowDown v-else />
                </el-icon>
              </div>
            </div>
          </div>
          <el-empty v-if="!loading && versions.length === 0" description="暂无版本记录" />
        </div>
      </div>

      <div v-if="batchMode && !diffMode" class="batch-action-bar">
        <div class="batch-info">
          已选择 <strong>{{ batchSelectedIds.length }}</strong> 个版本
          <span v-if="hasFavoriteInBatch" class="batch-warning">（含收藏版本，删除操作将跳过收藏版本）</span>
        </div>
        <div class="batch-actions">
          <el-button
            type="danger"
            size="small"
            :disabled="batchSelectedIds.length === 0 || hasFavoriteInBatch"
            @click="handleBatchDelete"
          >
            批量删除
          </el-button>
          <el-tooltip v-if="hasFavoriteInBatch" content="选中版本中包含收藏版本，不可批量删除" placement="top">
            <el-icon class="disabled-hint"><Warning /></el-icon>
          </el-tooltip>
          <el-button
            size="small"
            :disabled="batchSelectedIds.length === 0"
            @click="handleBatchExport"
          >
            批量导出JSON
          </el-button>
          <el-button
            type="primary"
            size="small"
            :disabled="batchSelectedIds.length === 0"
            @click="openBatchTagDialog"
          >
            批量打标签
          </el-button>
          <el-button size="small" @click="exitBatchMode">退出多选</el-button>
        </div>
      </div>

      <div v-if="!diffMode && !batchMode" class="batch-mode-trigger">
        <el-button size="small" text type="primary" @click="enterBatchMode">多选操作</el-button>
      </div>
    </div>

    <el-dialog
      v-model="addTagDialogVisible"
      title="添加标签"
      width="400px"
      append-to-body
    >
      <el-input
        v-model="newTagInput"
        placeholder="输入标签名称，多个标签用逗号分隔"
        @keyup.enter="handleAddTag"
      />
      <div v-if="allTags.length > 0" class="existing-tags">
        <span class="existing-tags-label">已有标签：</span>
        <el-tag
          v-for="tag in allTags"
          :key="tag"
          size="small"
          class="mr-5 cursor-pointer"
          @click="selectExistingTag(tag)"
        >
          {{ tag }}
        </el-tag>
      </div>
      <template #footer>
        <el-button @click="addTagDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleAddTag">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="batchTagDialogVisible"
      title="批量打标签"
      width="400px"
      append-to-body
    >
      <el-input
        v-model="batchTagInput"
        placeholder="输入标签名称，多个标签用逗号分隔"
        @keyup.enter="handleBatchTag"
      />
      <div v-if="allTags.length > 0" class="existing-tags">
        <span class="existing-tags-label">已有标签：</span>
        <el-tag
          v-for="tag in allTags"
          :key="tag"
          size="small"
          class="mr-5 cursor-pointer"
          @click="batchTagInput = batchTagInput ? batchTagInput + ',' + tag : tag"
        >
          {{ tag }}
        </el-tag>
      </div>
      <template #footer>
        <el-button @click="batchTagDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleBatchTag">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="rollbackPreviewVisible"
      title="回滚预览"
      width="900px"
      append-to-body
      :close-on-click-modal="false"
    >
      <div v-if="rollbackPreviewData" class="rollback-preview-content">
        <div class="rollback-preview-stats">
          <el-tag type="success" size="small">新增 {{ rollbackPreviewData.diff?.added || 0 }} 项</el-tag>
          <el-tag type="danger" size="small">删除 {{ rollbackPreviewData.diff?.removed || 0 }} 项</el-tag>
          <el-tag type="warning" size="small">修改 {{ rollbackPreviewData.diff?.modified || 0 }} 项</el-tag>
        </div>
        <div class="rollback-diff-columns">
          <div class="diff-col">
            <div class="diff-col-title">
              回滚目标：版本 {{ rollbackPreviewData.targetVersion?.versionNumber }}
            </div>
            <div class="diff-col-content">
              <template v-for="field in rollbackPreviewData.diff?.fields || []" :key="'rb-' + field.field">
                <div
                  v-if="field.type === 'modified'"
                  class="diff-item diff-modified"
                >
                  <div class="diff-field-name">{{ getFieldLabel(field.field) }}</div>
                  <div class="diff-new-value">{{ formatFieldValue(field.newValue) }}</div>
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
              当前配置
            </div>
            <div class="diff-col-content">
              <template v-for="field in rollbackPreviewData.diff?.fields || []" :key="'rb-new-' + field.field">
                <div
                  v-if="field.type === 'modified'"
                  class="diff-item diff-modified"
                >
                  <div class="diff-field-name">{{ getFieldLabel(field.field) }}</div>
                  <div class="diff-old-value">{{ formatFieldValue(field.oldValue) }}</div>
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
      <div class="rollback-reason-form">
        <el-form ref="rollbackReasonFormRef" :model="rollbackReasonForm" :rules="rollbackReasonRules">
          <el-form-item label="回滚原因" prop="reason">
            <el-input
              v-model="rollbackReasonForm.reason"
              type="textarea"
              :rows="3"
              placeholder="请输入回滚原因（必填）"
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="rollbackPreviewVisible = false">取消</el-button>
        <el-button type="warning" @click="confirmRollbackFromPreview">确认回滚</el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch, computed, h, defineComponent } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Star, StarFilled, ArrowDown, ArrowUp, Warning } from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import {
  versionsApi,
  RuleVersion,
  VersionDiffResult,
  ChangeSummaryItem,
  ConditionTreeDiffResult,
  ConditionTreeNode as ConditionTreeNodeType,
  RollbackPreviewResult,
} from '@/services/apiEndpoints';

const ConditionTreeNode = defineComponent({
  name: 'ConditionTreeNode',
  props: {
    node: { type: Object as () => ConditionTreeNodeType | null, default: null },
    side: { type: String as () => 'left' | 'right', default: 'left' },
    mappings: { type: Array as () => any[], default: () => [] },
    depth: { type: Number, default: 0 },
  },
  setup(props) {
    const getDiffClass = (diffType?: string) => {
      switch (diffType) {
        case 'added': return 'tree-node-added';
        case 'removed': return 'tree-node-removed';
        case 'modified': return 'tree-node-modified';
        default: return 'tree-node-unchanged';
      }
    };

    const getMappingType = (nodeId: string) => {
      const mapping = props.mappings.find(
        (m: any) => (props.side === 'left' ? m.leftId === nodeId : m.rightId === nodeId)
      );
      return mapping?.type || null;
    };

    const isStructuralChange = (nodeId: string) => {
      return getMappingType(nodeId) === 'structural_change';
    };

    const describeCondition = (cond: any): string => {
      if (!cond) return '';
      switch (cond.type) {
        case 'threshold':
          return `${cond.metric || ''} ${cond.operator || ''} ${cond.value ?? ''}`;
        case 'label':
          return `${cond.label || ''} ${cond.operator || ''} ${cond.labelValue || ''}`;
        case 'window':
          return `${cond.metric || ''} ${cond.aggregate || ''} ${cond.operator || ''} ${cond.threshold ?? ''}`;
        case 'frequency':
          return `${cond.metric || ''} ${cond.windowSize || ''}s内超${cond.threshold ?? ''}次`;
        case 'sequence':
          return `${cond.eventA || ''} → ${cond.eventB || ''}`;
        default:
          return JSON.stringify(cond);
      }
    };

    return () => {
      if (!props.node) return h('div', { class: 'tree-node-empty' }, '无条件');
      const node = props.node;
      const indent = props.depth * 20;
      const mappingType = getMappingType(node.id);
      const structural = isStructuralChange(node.id);

      if (node.type === 'operator') {
        return h('div', { class: ['tree-node', 'tree-operator', getDiffClass(node.diffType), structural ? 'structural-change' : ''], style: { marginLeft: `${indent}px` } }, [
          h('div', { class: 'operator-badge' }, [
            h('span', { class: 'operator-label' }, node.operator || 'AND'),
            structural ? h('span', { class: 'structural-indicator' }, '⚠ 结构变更') : null,
          ]),
          ...(node.children || []).map((child: any, idx: number) =>
            h(ConditionTreeNode, { node: child, side: props.side, mappings: props.mappings, depth: props.depth + 1, key: child.id || idx })
          ),
        ]);
      }

      const conditionText = describeCondition(node.condition);
      const hoverDetail = node.diffType === 'modified' && node.oldCondition && node.newCondition
        ? `旧值: ${describeCondition(node.oldCondition)}\n新值: ${describeCondition(node.newCondition)}`
        : '';

      return h('div', {
        class: ['tree-node', 'tree-condition', getDiffClass(node.diffType), structural ? 'structural-change' : ''],
        style: { marginLeft: `${indent}px` },
        title: hoverDetail,
      }, [
        h('span', { class: 'condition-text' }, conditionText),
        node.diffType === 'modified' ? h('span', { class: 'modified-hint' }, '（已修改，hover查看详情）') : null,
        structural ? h('span', { class: 'structural-indicator' }, '⚡') : null,
      ]);
    };
  },
});

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
const allTags = ref<string[]>([]);
const previewVersion = ref<RuleVersion | null>(null);
const selectedForDiff = ref<string[]>([]);
const diffMode = ref(false);
const diffViewMode = ref<'field' | 'tree'>('field');
const diffData = ref<VersionDiffResult | null>(null);
const expandedSummaries = ref<Record<string, boolean>>({});

const filterTimeRange = ref<[string, string] | null>(null);
const filterCreatedBy = ref<string>('');
const filterTag = ref<string>('');

const batchMode = ref(false);
const batchSelectedIds = ref<string[]>([]);

const addTagDialogVisible = ref(false);
const newTagInput = ref('');
const addingTagVersion = ref<RuleVersion | null>(null);

const batchTagDialogVisible = ref(false);
const batchTagInput = ref('');

const rollbackPreviewVisible = ref(false);
const rollbackPreviewData = ref<RollbackPreviewResult | null>(null);
const rollbackTargetVersion = ref<RuleVersion | null>(null);
const rollbackReasonForm = ref({ reason: '' });
const rollbackReasonFormRef = ref();
const rollbackReasonRules = { reason: [{ required: true, message: '请输入回滚原因', trigger: 'blur' }] };

const hasStructuralChanges = computed(() => {
  const mappings = diffData.value?.conditionTreeDiff?.mappings || [];
  return mappings.some(m => m.type === 'structural_change');
});

const hasFavoriteInBatch = computed(() => {
  return batchSelectedIds.value.some(id => {
    const v = versions.value.find(ver => ver.id === id);
    return v?.isFavorite;
  });
});

function handleClose() {
  emit('update:visible', false);
  previewVersion.value = null;
  selectedForDiff.value = [];
  diffMode.value = false;
  diffData.value = null;
  batchMode.value = false;
  batchSelectedIds.value = [];
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

function isStructuredSummary(summary: any): summary is ChangeSummaryItem[] {
  return Array.isArray(summary) && summary.length > 0 && summary[0]?.field !== undefined && summary[0]?.displayText !== undefined;
}

function toggleSummaryExpand(versionId: string) {
  expandedSummaries.value[versionId] = !expandedSummaries.value[versionId];
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

function toggleBatchSelection(versionId: string, checked: boolean | string | number) {
  if (checked) {
    if (!batchSelectedIds.value.includes(versionId)) {
      batchSelectedIds.value.push(versionId);
    }
  } else {
    batchSelectedIds.value = batchSelectedIds.value.filter(id => id !== versionId);
  }
}

function enterBatchMode() {
  batchMode.value = true;
  batchSelectedIds.value = [];
  selectedForDiff.value = [];
}

function exitBatchMode() {
  batchMode.value = false;
  batchSelectedIds.value = [];
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
    if (filterTag.value) {
      params.tag = filterTag.value;
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

async function loadTags() {
  if (!props.ruleId) return;
  try {
    const response = await versionsApi.getVersionTags(props.ruleId);
    allTags.value = response.data;
  } catch (error) {
    console.error('Failed to load tags:', error);
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
    diffViewMode.value = 'field';
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '版本对比失败');
  }
}

function exitDiffMode() {
  diffMode.value = false;
  diffData.value = null;
  selectedForDiff.value = [];
}

async function handleToggleFavorite(version: RuleVersion) {
  try {
    await versionsApi.toggleFavorite(props.ruleId, version.id);
    version.isFavorite = !version.isFavorite;
    ElMessage.success(version.isFavorite ? '已收藏' : '已取消收藏');
    loadVersions();
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '操作失败');
  }
}

function openAddTagDialog(version: RuleVersion) {
  addingTagVersion.value = version;
  newTagInput.value = '';
  addTagDialogVisible.value = true;
}

function selectExistingTag(tag: string) {
  if (newTagInput.value) {
    newTagInput.value += ',' + tag;
  } else {
    newTagInput.value = tag;
  }
}

async function handleAddTag() {
  if (!addingTagVersion.value || !newTagInput.value.trim()) return;
  const tags = newTagInput.value.split(',').map(t => t.trim()).filter(Boolean);
  try {
    await versionsApi.addTags(props.ruleId, addingTagVersion.value.id, tags);
    ElMessage.success('标签已添加');
    addTagDialogVisible.value = false;
    loadVersions();
    loadTags();
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '添加标签失败');
  }
}

async function handleRemoveTag(version: RuleVersion, tag: string) {
  try {
    await versionsApi.removeTag(props.ruleId, version.id, tag);
    ElMessage.success('标签已移除');
    loadVersions();
    loadTags();
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '移除标签失败');
  }
}

async function openRollbackPreview(version: RuleVersion) {
  try {
    const response = await versionsApi.rollbackPreview(props.ruleId, version.id);
    rollbackPreviewData.value = response.data;
    rollbackTargetVersion.value = version;
    rollbackReasonForm.value.reason = '';
    rollbackPreviewVisible.value = true;
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '获取回滚预览失败');
  }
}

async function confirmRollbackFromPreview() {
  if (!rollbackTargetVersion.value) return;
  try {
    await rollbackReasonFormRef.value?.validate();
  } catch {
    return;
  }

  try {
    await versionsApi.rollback(
      props.ruleId,
      rollbackTargetVersion.value.id,
      'current_user',
      rollbackReasonForm.value.reason,
    );
    ElMessage.success(`已回滚到版本 ${rollbackTargetVersion.value.versionNumber}`);
    rollbackPreviewVisible.value = false;
    previewVersion.value = null;
    emit('rolled-back');
    loadVersions();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.message || '回滚失败');
    }
  }
}

async function handleBatchDelete() {
  if (batchSelectedIds.value.length === 0) return;
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${batchSelectedIds.value.length} 个版本吗？收藏版本将被跳过。`,
      '批量删除确认',
      { type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消' },
    );
    const result = await versionsApi.batchDelete(props.ruleId, batchSelectedIds.value);
    ElMessage.success(`已删除 ${result.data.deleted} 个版本${result.data.skipped > 0 ? `，跳过 ${result.data.skipped} 个收藏版本` : ''}`);
    batchSelectedIds.value = [];
    loadVersions();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.message || '批量删除失败');
    }
  }
}

async function handleBatchExport() {
  if (batchSelectedIds.value.length === 0) return;
  try {
    const response = await versionsApi.batchExport(props.ruleId, batchSelectedIds.value);
    const blob = new Blob([response.data], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const disposition = response.headers?.['content-disposition'];
    const filename = disposition
      ? disposition.split('filename=')[1]?.replace(/"/g, '')
      : `versions_${new Date().toISOString().slice(0, 10)}.json`;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
    ElMessage.success('导出成功');
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '批量导出失败');
  }
}

function openBatchTagDialog() {
  batchTagInput.value = '';
  batchTagDialogVisible.value = true;
}

async function handleBatchTag() {
  if (!batchTagInput.value.trim() || batchSelectedIds.value.length === 0) return;
  const tags = batchTagInput.value.split(',').map(t => t.trim()).filter(Boolean);
  try {
    await versionsApi.batchAddTags(props.ruleId, batchSelectedIds.value, tags);
    ElMessage.success('标签已批量添加');
    batchTagDialogVisible.value = false;
    loadVersions();
    loadTags();
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '批量打标签失败');
  }
}

watch(
  () => props.visible,
  (val) => {
    if (val && props.ruleId) {
      loadVersions();
      loadCreators();
      loadTags();
      previewVersion.value = null;
      selectedForDiff.value = [];
      diffMode.value = false;
      diffData.value = null;
      batchMode.value = false;
      batchSelectedIds.value = [];
      expandedSummaries.value = {};
    }
  },
);
</script>

<style scoped>
.version-history {
  padding: 0 4px;
  padding-bottom: 60px;
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
  gap: 12px;
}

.diff-stats {
  display: flex;
  gap: 8px;
}

.diff-mode-toggle {
  flex-shrink: 0;
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
  max-height: calc(100vh - 320px);
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

.condition-tree-diff {
  margin-top: 0;
}

.tree-diff-columns {
  display: flex;
  gap: 12px;
}

.tree-diff-col {
  flex: 1;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  overflow: hidden;
}

.tree-diff-content {
  padding: 12px;
  max-height: calc(100vh - 380px);
  overflow-y: auto;
  font-size: 13px;
}

.structural-change-hint {
  margin-top: 12px;
  padding: 8px 12px;
  background: #fdf6ec;
  border-radius: 4px;
  font-size: 12px;
  color: #e6a23c;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tree-node {
  margin: 4px 0;
}

.tree-operator {
  border-left: 2px solid #dcdfe6;
  padding-left: 8px;
}

.operator-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  background: #ecf5ff;
  border-radius: 4px;
  font-weight: 600;
  color: #409eff;
  margin-bottom: 4px;
  font-size: 12px;
}

.operator-label {
  font-size: 12px;
}

.tree-condition {
  padding: 4px 8px;
  border-radius: 4px;
  margin: 2px 0;
  cursor: default;
}

.tree-node-unchanged {
  background: #f5f7fa;
  color: #606266;
}

.tree-node-added {
  background: #f0f9eb;
  border-left: 3px solid #67c23a;
  color: #67c23a;
}

.tree-node-removed {
  background: #fef0f0;
  border-left: 3px solid #f56c6c;
  color: #f56c6c;
}

.tree-node-modified {
  background: #fdf6ec;
  border-left: 3px solid #e6a23c;
  color: #e6a23c;
  cursor: help;
}

.tree-node-empty {
  color: #c0c4cc;
  font-style: italic;
  padding: 4px 0;
}

.condition-text {
  font-size: 12px;
}

.modified-hint {
  font-size: 11px;
  color: #e6a23c;
  margin-left: 4px;
}

.structural-indicator {
  font-size: 11px;
  color: #e6a23c;
  margin-left: 4px;
}

.structural-change {
  border-style: dashed;
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

.timeline-item.is-favorite {
  border-left-color: #e6a23c;
}

.timeline-item.batch-selected {
  background: #ecf5ff;
  border-radius: 4px;
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

.timeline-dot.favorite-dot {
  background: #e6a23c;
  box-shadow: 0 0 0 3px rgba(230, 162, 60, 0.2);
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

.favorite-star {
  cursor: pointer;
  font-size: 16px;
  color: #c0c4cc;
  transition: color 0.2s;
}

.favorite-star:hover {
  color: #e6a23c;
}

.favorite-star.is-starred {
  color: #e6a23c;
}

.tag-badges {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.tag-badge {
  font-size: 11px;
}

.add-tag-btn {
  font-size: 11px;
  padding: 0 4px;
}

.change-summary-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-top: 6px;
  padding: 6px 8px;
  background: #fafafa;
  border-radius: 4px;
}

.structured-summary {
  flex: 1;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.6;
}

.structured-summary.collapsed {
  max-height: 24px;
  overflow: hidden;
  position: relative;
}

.structured-summary.collapsed::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 12px;
  background: linear-gradient(transparent, #fafafa);
}

.summary-item {
  display: inline;
  margin-right: 8px;
}

.summary-item.status-change {
  font-weight: 600;
}

.summary-item.status-enabled {
  color: #67c23a;
}

.summary-item.status-disabled {
  color: #f56c6c;
}

.status-icon {
  margin-right: 2px;
}

.summary-detail {
  color: #909399;
  font-size: 11px;
}

.expand-icon {
  cursor: pointer;
  color: #909399;
  flex-shrink: 0;
  margin-top: 2px;
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

.cursor-pointer {
  cursor: pointer;
}

.batch-mode-trigger {
  position: fixed;
  bottom: 80px;
  right: 40px;
  z-index: 10;
}

.batch-action-bar {
  position: fixed;
  bottom: 0;
  left: 140px;
  right: 0;
  padding: 12px 24px;
  background: #fff;
  border-top: 1px solid #e4e7ed;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 100;
}

.batch-info {
  font-size: 13px;
  color: #606266;
}

.batch-warning {
  color: #e6a23c;
  font-size: 12px;
  margin-left: 8px;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.disabled-hint {
  color: #e6a23c;
  font-size: 14px;
}

.existing-tags {
  margin-top: 12px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.existing-tags-label {
  font-size: 12px;
  color: #909399;
  margin-right: 4px;
}

.rollback-preview-content {
  margin-bottom: 16px;
}

.rollback-preview-stats {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.rollback-diff-columns {
  display: flex;
  gap: 12px;
}

.rollback-reason-form {
  margin-top: 16px;
  border-top: 1px solid #e4e7ed;
  padding-top: 16px;
}
</style>
