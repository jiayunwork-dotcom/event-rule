<template>
  <div class="rules-page">
    <div class="page-header card">
      <div class="flex justify-between items-center">
        <h2>规则管理</h2>
        <div class="header-actions">
          <el-button @click="openImportDialog">
            <el-icon><Upload /></el-icon>
            导入规则
          </el-button>
          <el-button @click="openExportDialog">
            <el-icon><Download /></el-icon>
            导出规则
          </el-button>
          <el-button type="primary" @click="goToCreate">
            <el-icon><Plus /></el-icon>
            创建规则
          </el-button>
        </div>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="card">
      <el-tab-pane label="规则列表" name="list">
        <el-table :data="rules" v-loading="loading" stripe @selection-change="handleSelectionChange">
          <el-table-column width="55" type="selection" />
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
          
          <el-table-column label="操作" width="300" fixed="right">
            <template #default="{ row }">
              <el-button type="warning" size="small" @click="openSimulateDialog(row)">
                模拟测试
              </el-button>
              <el-button type="primary" size="small" @click="editRule(row)">
                编辑
              </el-button>
              <el-button type="success" size="small" @click="saveAsTemplate(row)">
                存为模板
              </el-button>
              <el-button type="danger" size="small" @click="deleteRule(row)">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="依赖关系" name="dependency">
        <div v-if="inhibitRules.length === 0" class="dep-empty">
          <el-empty description="暂无抑制规则，无法展示依赖关系图" />
        </div>
        <div v-else class="dependency-graph-container">
          <svg class="dependency-svg" :width="svgWidth" :height="svgHeight">
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#409eff" />
              </marker>
            </defs>
            <template v-for="edge in graphEdges" :key="edge.id">
              <line
                :x1="edge.x1" :y1="edge.y1"
                :x2="edge.x2" :y2="edge.y2"
                :stroke="edge.highlighted ? '#409eff' : '#c0c4cc'"
                :stroke-width="edge.highlighted ? 2.5 : 1.5"
                marker-end="url(#arrowhead)"
                class="graph-edge"
              />
            </template>
            <template v-for="node in graphNodes" :key="node.id">
              <g @click="highlightNode(node.id)" class="graph-node" :class="{ 'node-highlighted': node.highlighted }">
                <rect
                  :x="node.x - node.width / 2" :y="node.y - 20"
                  :width="node.width" :height="40"
                  :rx="6" :ry="6"
                  :fill="node.highlighted ? '#ecf5ff' : '#fff'"
                  :stroke="node.highlighted ? '#409eff' : (node.isEnabled ? '#67c23a' : '#909399')"
                  :stroke-width="node.highlighted ? 2.5 : 1.5"
                />
                <circle
                  :cx="node.x - node.width / 2 + 14" :cy="node.y"
                  r="5"
                  :fill="node.isEnabled ? '#67c23a' : '#909399'"
                />
                <text
                  :x="node.x - node.width / 2 + 24" :y="node.y + 5"
                  font-size="12" fill="#303133"
                >{{ node.name }}</text>
              </g>
            </template>
          </svg>
          <div class="graph-legend">
            <span class="legend-item"><span class="legend-dot enabled"></span> 已启用</span>
            <span class="legend-item"><span class="legend-dot disabled"></span> 已禁用</span>
            <span class="legend-item">→ 抑制方向 (source → target)</span>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="simulateDialogVisible"
      title="规则模拟测试"
      width="650px"
      :close-on-click-modal="false"
    >
      <div v-if="simulateRule" class="simulate-dialog">
        <div class="simulate-rule-info">
          <el-tag :type="getSeverityType(simulateRule.severity)" effect="dark" size="small">
            {{ simulateRule.severity.toUpperCase() }}
          </el-tag>
          <span class="simulate-rule-name">{{ simulateRule.name }}</span>
          <el-tag size="small" type="info">{{ getConditionTypeText(simulateRule.conditionType) }}</el-tag>
        </div>

        <el-divider content-position="left">模拟事件数据</el-divider>

        <el-form :model="simulateForm" label-width="100px" size="default">
          <el-form-item label="指标名称">
            <el-input v-model="simulateForm.metricName" placeholder="例如: cpu_usage" />
          </el-form-item>
          <el-form-item label="指标值">
            <el-input v-model.number="simulateForm.value" type="number" placeholder="例如: 85.5" />
          </el-form-item>
          <el-form-item label="标签">
            <div class="labels-input-area">
              <div v-for="(item, index) in simulateForm.labels" :key="index" class="label-input-row">
                <el-input v-model="item.key" placeholder="标签键" style="width: 40%" />
                <span class="label-eq">=</span>
                <el-input v-model="item.value" placeholder="标签值" style="width: 40%" />
                <el-button type="danger" size="small" @click="removeSimulateLabel(index)" :icon="Delete" circle />
              </div>
              <el-button size="small" @click="addSimulateLabel">+ 添加标签</el-button>
            </div>
          </el-form-item>
          <el-form-item label="时间戳">
            <el-input v-model="simulateForm.timestamp" placeholder="可选, 例如: 2025-01-01T00:00:00Z" />
          </el-form-item>
        </el-form>
      </div>

      <div v-if="simulateResult" class="simulate-result">
        <el-divider content-position="left">匹配结果</el-divider>
        <div :class="['simulate-match-status', simulateResult.matched ? 'matched' : 'not-matched']">
          <span class="status-icon">{{ simulateResult.matched ? '✓' : '✗' }}</span>
          <span class="status-text">{{ simulateResult.matched ? '命中' : '未命中' }}</span>
        </div>

        <div class="match-details">
          <div
            v-for="(detail, index) in simulateResult.matchDetails"
            :key="index"
            :class="['match-detail-item', detail.passed ? 'passed' : 'failed']"
          >
            <span class="detail-icon">{{ detail.passed ? '✓' : '✗' }}</span>
            <div class="detail-content">
              <div class="detail-condition">{{ detail.condition }}</div>
              <div class="detail-reason">{{ detail.reason }}</div>
            </div>
          </div>
        </div>

        <div v-if="simulateResult.aggregationWindowStatus" class="window-status">
          <el-divider content-position="left">聚合窗口状态</el-divider>
          <div class="window-info">
            <span>窗口内事件数: <strong>{{ simulateResult.aggregationWindowStatus.eventCount }}</strong></span>
            <span v-if="simulateResult.aggregationWindowStatus.aggregateResult !== undefined">
              聚合结果: <strong>{{ simulateResult.aggregationWindowStatus.aggregateResult?.toFixed(2) }}</strong>
            </span>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="simulateDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="simulating" @click="doSimulate">执行测试</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="exportDialogVisible"
      title="导出规则"
      width="600px"
    >
      <div class="export-dialog">
        <div class="export-option">
          <el-radio-group v-model="exportMode" @change="onExportModeChange">
            <el-radio value="all">导出全部规则</el-radio>
            <el-radio value="selected">导出选中规则</el-radio>
          </el-radio-group>
        </div>

        <div v-if="exportMode === 'selected'" class="selected-rules">
          <p class="selected-count">
            已选择 <span class="highlight">{{ selectedRuleIds.length }}</span> 条规则
          </p>
          <div v-if="selectedRuleIds.length === 0" class="empty-tip">
            <el-empty description="请先在列表中勾选要导出的规则" :image-size="80" />
          </div>
          <div v-else class="selected-list">
            <el-tag
              v-for="rule in selectedRules"
              :key="rule.id"
              class="selected-tag"
              size="small"
              closable
              @close="removeFromSelection(rule.id)"
            >
              {{ rule.name }}
            </el-tag>
          </div>
        </div>

        <div class="export-tip">
          <el-icon><InfoFilled /></el-icon>
          <span>导出内容包含规则的完整配置，不包含告警历史数据</span>
        </div>
      </div>

      <template #footer>
        <el-button @click="exportDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="exporting"
          :disabled="exportMode === 'selected' && selectedRuleIds.length === 0"
          @click="doExport"
        >
          导出
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="importDialogVisible"
      title="导入规则"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="import-dialog">
        <el-upload
          drag
          :auto-upload="false"
          :show-file-list="true"
          :on-change="handleFileChange"
          :on-remove="handleFileRemove"
          accept=".json"
          :limit="1"
        >
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">
            将 JSON 文件拖到此处，或<em>点击上传</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">
              仅支持 JSON 格式的规则配置文件
            </div>
          </template>
        </el-upload>

        <div class="conflict-section">
          <h4>冲突处理策略</h4>
          <el-radio-group v-model="conflictStrategy">
            <el-radio value="skip">跳过 - 名称重复时不导入</el-radio>
            <el-radio value="overwrite">覆盖 - 名称重复时覆盖现有规则</el-radio>
            <el-radio value="rename">重命名 - 名称重复时自动重命名</el-radio>
          </el-radio-group>
        </div>

        <div v-if="importError" class="import-error">
          <el-alert :title="importError" type="error" :closable="false" />
        </div>
      </div>

      <template #footer>
        <el-button @click="closeImportDialog">取消</el-button>
        <el-button
          type="primary"
          :loading="importing"
          :disabled="!importFile"
          @click="doImport"
        >
          导入
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="importResultVisible"
      title="导入结果"
      width="600px"
    >
      <div v-if="importResult" class="import-result">
        <div class="result-summary">
          <div class="result-item success">
            <span class="result-count">{{ importResult.success }}</span>
            <span class="result-label">成功</span>
          </div>
          <div class="result-item skipped">
            <span class="result-count">{{ importResult.skipped }}</span>
            <span class="result-label">跳过</span>
          </div>
          <div class="result-item failed">
            <span class="result-count">{{ importResult.failed }}</span>
            <span class="result-label">失败</span>
          </div>
        </div>

        <div class="result-details">
          <h4>详细结果</h4>
          <div class="result-list">
            <div
              v-for="(item, index) in importResult.results"
              :key="index"
              class="result-item-row"
            >
              <div class="result-item-name">
                <el-tag size="small" :type="getResultTagType(item.status)">
                  {{ getResultStatusText(item.status) }}
                </el-tag>
                <span class="name-text">{{ item.name }}</span>
                <span v-if="item.newName" class="rename-text">
                  → {{ item.newName }}
                </span>
              </div>
              <div class="result-item-message" v-if="item.message">
                {{ item.message }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button type="primary" @click="closeImportResult">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="saveTemplateDialogVisible"
      title="保存为模板"
      width="500px"
    >
      <el-form :model="templateForm" label-width="100px">
        <el-form-item label="模板名称" required>
          <el-input v-model="templateForm.name" placeholder="请输入模板名称" />
        </el-form-item>
        <el-form-item label="场景标签">
          <el-select
            v-model="templateForm.sceneTags"
            multiple
            filterable
            allow-create
            placeholder="选择或输入场景标签"
            style="width: 100%"
          >
            <el-option v-for="tag in sceneTagOptions" :key="tag" :label="tag" :value="tag" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="saveTemplateDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingTemplate" @click="doSaveAsTemplate">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import dayjs from 'dayjs';
import {
  rulesApi,
  templatesApi,
  inhibitApi,
  Rule,
  ImportResult,
  SimulateResult,
  InhibitRuleItem,
} from '@/services/apiEndpoints';
import {
  Plus,
  Upload,
  Download,
  InfoFilled,
  UploadFilled,
  Delete,
} from '@element-plus/icons-vue';

const router = useRouter();
const loading = ref(false);
const rules = ref<Rule[]>([]);
const selectedRuleIds = ref<string[]>([]);
const selectedRules = computed(() =>
  rules.value.filter((r) => selectedRuleIds.value.includes(r.id))
);

const activeTab = ref('list');
const inhibitRules = ref<InhibitRuleItem[]>([]);
const highlightedNodeId = ref<string | null>(null);

const simulateDialogVisible = ref(false);
const simulating = ref(false);
const simulateRule = ref<Rule | null>(null);
const simulateResult = ref<SimulateResult | null>(null);
const simulateForm = reactive({
  metricName: '',
  value: undefined as number | undefined,
  labels: [] as Array<{ key: string; value: string }>,
  timestamp: '',
});

const exportDialogVisible = ref(false);
const exportMode = ref<'all' | 'selected'>('all');
const exporting = ref(false);

const importDialogVisible = ref(false);
const importFile = ref<File | null>(null);
const conflictStrategy = ref<'skip' | 'overwrite' | 'rename'>('skip');
const importing = ref(false);
const importError = ref('');

const importResultVisible = ref(false);
const importResult = ref<ImportResult | null>(null);

const saveTemplateDialogVisible = ref(false);
const savingTemplate = ref(false);
const currentRule = ref<Rule | null>(null);
const templateForm = reactive({
  name: '',
  sceneTags: [] as string[],
});
const sceneTagOptions = ref<string[]>([]);

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

function getResultTagType(status: string) {
  const map: Record<string, string> = {
    success: 'success',
    skipped: 'info',
    failed: 'danger',
  };
  return map[status] || 'info';
}

function getResultStatusText(status: string) {
  const map: Record<string, string> = {
    success: '成功',
    skipped: '跳过',
    failed: '失败',
  };
  return map[status] || status;
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

async function loadInhibitRules() {
  try {
    const response = await inhibitApi.getInhibitRules();
    inhibitRules.value = response.data;
  } catch (error) {
    console.error('Failed to load inhibit rules:', error);
  }
}

async function loadSceneTags() {
  try {
    const response = await templatesApi.getSceneTags();
    sceneTagOptions.value = response.data;
  } catch (error) {
    console.error('Failed to load scene tags:', error);
  }
}

interface GraphNode {
  id: string;
  name: string;
  isEnabled: boolean;
  x: number;
  y: number;
  width: number;
  highlighted: boolean;
}

interface GraphEdge {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  highlighted: boolean;
  sourceId: string;
  targetId: string;
}

const NODE_H_SPACING = 220;
const NODE_V_SPACING = 100;
const NODE_PADDING_X = 60;
const NODE_PADDING_Y = 50;

const graphNodes = computed<GraphNode[]>(() => {
  const nodeIds = new Set<string>();

  for (const ir of inhibitRules.value) {
    for (const sm of ir.sourceMatchers) {
      const rule = rules.value.find(r => r.name === sm.value);
      if (rule) nodeIds.add(rule.id);
    }
    for (const tm of ir.targetMatchers) {
      const rule = rules.value.find(r => r.name === tm.value);
      if (rule) nodeIds.add(rule.id);
    }
  }

  const nodes: GraphNode[] = [];
  let col = 0;
  let row = 0;
  const cols = Math.ceil(Math.sqrt(nodeIds.size)) || 1;

  for (const id of nodeIds) {
    const rule = rules.value.find(r => r.id === id);
    if (!rule) continue;
    const nameLen = rule.name.length;
    const width = Math.max(120, nameLen * 12 + 40);
    const highlighted = highlightedNodeId.value === id || isNodeConnected(id);
    nodes.push({
      id: rule.id,
      name: rule.name,
      isEnabled: rule.isEnabled,
      x: NODE_PADDING_X + col * NODE_H_SPACING + width / 2,
      y: NODE_PADDING_Y + row * NODE_V_SPACING + 20,
      width,
      highlighted,
    });
    col++;
    if (col >= cols) {
      col = 0;
      row++;
    }
  }
  return nodes;
});

const graphEdges = computed<GraphEdge[]>(() => {
  const edges: GraphEdge[] = [];
  for (const ir of inhibitRules.value) {
    const sourceRule = rules.value.find(r => r.name === ir.sourceMatchers[0]?.value);
    const targetRule = rules.value.find(r => r.name === ir.targetMatchers[0]?.value);
    if (!sourceRule || !targetRule) continue;

    const srcNode = graphNodes.value.find(n => n.id === sourceRule.id);
    const tgtNode = graphNodes.value.find(n => n.id === targetRule.id);
    if (!srcNode || !tgtNode) continue;

    const highlighted = highlightedNodeId.value === sourceRule.id || highlightedNodeId.value === targetRule.id;
    edges.push({
      id: ir.id,
      x1: srcNode.x,
      y1: srcNode.y + 20,
      x2: tgtNode.x,
      y2: tgtNode.y - 20,
      highlighted,
      sourceId: sourceRule.id,
      targetId: targetRule.id,
    });
  }
  return edges;
});

function isNodeConnected(nodeId: string): boolean {
  if (!highlightedNodeId.value) return false;
  for (const edge of graphEdges.value) {
    if ((edge.sourceId === nodeId && edge.targetId === highlightedNodeId.value) ||
        (edge.targetId === nodeId && edge.sourceId === highlightedNodeId.value)) {
      return true;
    }
  }
  return false;
}

const svgWidth = computed(() => {
  if (graphNodes.value.length === 0) return 800;
  const maxX = Math.max(...graphNodes.value.map(n => n.x + n.width / 2));
  return maxX + NODE_PADDING_X;
});

const svgHeight = computed(() => {
  if (graphNodes.value.length === 0) return 400;
  const maxY = Math.max(...graphNodes.value.map(n => n.y + 20));
  return maxY + NODE_PADDING_Y;
});

function highlightNode(id: string) {
  highlightedNodeId.value = highlightedNodeId.value === id ? null : id;
}

function handleSelectionChange(selection: Rule[]) {
  selectedRuleIds.value = selection.map((r) => r.id);
}

function removeFromSelection(id: string) {
  selectedRuleIds.value = selectedRuleIds.value.filter((rid) => rid !== id);
}

function onExportModeChange() {
  if (exportMode.value === 'selected' && selectedRuleIds.value.length === 0) {
    ElMessage.info('请先在列表中勾选要导出的规则');
  }
}

function openExportDialog() {
  exportMode.value = selectedRuleIds.value.length > 0 ? 'selected' : 'all';
  exportDialogVisible.value = true;
}

async function doExport() {
  if (
    exportMode.value === 'selected' &&
    selectedRuleIds.value.length === 0
  ) {
    ElMessage.warning('请先选择要导出的规则');
    return;
  }

  exporting.value = true;
  try {
    const ruleIds =
      exportMode.value === 'selected' ? selectedRuleIds.value : undefined;
    const response = await rulesApi.exportRules(ruleIds);

    const blob = new Blob([response.data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = dayjs().format('YYYY-MM-DD');
    link.download = `rules_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    ElMessage.success('规则导出成功');
    exportDialogVisible.value = false;
  } catch (error) {
    console.error('Failed to export rules:', error);
    ElMessage.error('导出失败');
  } finally {
    exporting.value = false;
  }
}

function openImportDialog() {
  importFile.value = null;
  importError.value = '';
  conflictStrategy.value = 'skip';
  importDialogVisible.value = true;
}

function handleFileChange(file: any) {
  importFile.value = file.raw;
  importError.value = '';
}

function handleFileRemove() {
  importFile.value = null;
  importError.value = '';
}

function closeImportDialog() {
  importDialogVisible.value = false;
  importFile.value = null;
  importError.value = '';
}

async function doImport() {
  if (!importFile.value) {
    ElMessage.warning('请选择要导入的文件');
    return;
  }

  importing.value = true;
  importError.value = '';

  try {
    const text = await importFile.value.text();
    let rulesData: any[];

    try {
      rulesData = JSON.parse(text);
    } catch (parseError) {
      importError.value = 'JSON格式解析失败，请检查文件格式';
      return;
    }

    if (!Array.isArray(rulesData)) {
      importError.value = '文件格式不正确，应为规则数组';
      return;
    }

    const response = await rulesApi.importRules(
      rulesData,
      conflictStrategy.value
    );
    importResult.value = response.data;

    importDialogVisible.value = false;
    importResultVisible.value = true;

    loadRules();
  } catch (error: any) {
    console.error('Failed to import rules:', error);
    importError.value = error.response?.data?.message || '导入失败';
  } finally {
    importing.value = false;
  }
}

function closeImportResult() {
  importResultVisible.value = false;
  importResult.value = null;
}

function openSimulateDialog(rule: Rule) {
  simulateRule.value = rule;
  simulateResult.value = null;
  simulateForm.metricName = '';
  simulateForm.value = undefined;
  simulateForm.labels = [];
  simulateForm.timestamp = '';

  const conditions = rule.conditions?.conditions || [];
  for (const c of conditions) {
    if (c.metric) {
      simulateForm.metricName = c.metric;
    }
    if (c.label) {
      simulateForm.labels.push({ key: c.label, value: c.labelValue || '' });
    }
  }

  simulateDialogVisible.value = true;
}

function addSimulateLabel() {
  simulateForm.labels.push({ key: '', value: '' });
}

function removeSimulateLabel(index: number) {
  simulateForm.labels.splice(index, 1);
}

async function doSimulate() {
  if (!simulateRule.value) return;

  simulating.value = true;
  try {
    const labels: Record<string, string> = {};
    for (const item of simulateForm.labels) {
      if (item.key) {
        labels[item.key] = item.value;
      }
    }

    const response = await rulesApi.simulateRule(simulateRule.value.id, {
      metricName: simulateForm.metricName || undefined,
      value: simulateForm.value,
      labels: Object.keys(labels).length > 0 ? labels : undefined,
      timestamp: simulateForm.timestamp || undefined,
    });
    simulateResult.value = response.data;
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '模拟测试失败');
  } finally {
    simulating.value = false;
  }
}

function saveAsTemplate(rule: Rule) {
  currentRule.value = rule;
  templateForm.name = rule.name + '模板';
  templateForm.sceneTags = [];
  saveTemplateDialogVisible.value = true;
}

async function doSaveAsTemplate() {
  if (!currentRule.value || !templateForm.name) {
    ElMessage.warning('请输入模板名称');
    return;
  }

  savingTemplate.value = true;
  try {
    await templatesApi.createTemplateFromRule(
      currentRule.value.id,
      templateForm.name,
      templateForm.sceneTags
    );
    ElMessage.success('保存为模板成功');
    saveTemplateDialogVisible.value = false;
    loadSceneTags();
  } catch (error) {
    console.error('Failed to save as template:', error);
  } finally {
    savingTemplate.value = false;
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
  loadSceneTags();
  loadInhibitRules();
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

.header-actions {
  display: flex;
  gap: 10px;
}

.export-dialog,
.import-dialog {
  padding: 10px 0;
}

.export-option {
  margin-bottom: 20px;
}

.selected-rules {
  background: #f5f7fa;
  padding: 16px;
  border-radius: 6px;
  margin-bottom: 20px;
}

.selected-count {
  margin: 0 0 12px 0;
  color: #606266;
  font-size: 14px;
}

.selected-count .highlight {
  color: #409eff;
  font-weight: 600;
  font-size: 16px;
}

.selected-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.selected-tag {
  margin: 0;
}

.empty-tip {
  text-align: center;
  padding: 20px 0;
}

.export-tip,
.import-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #909399;
  font-size: 13px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

.conflict-section {
  margin-top: 24px;
}

.conflict-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #303133;
}

.conflict-section .el-radio {
  display: block;
  margin-bottom: 10px;
}

.import-error {
  margin-top: 16px;
}

.import-result {
  padding: 10px 0;
}

.result-summary {
  display: flex;
  justify-content: center;
  gap: 40px;
  margin-bottom: 24px;
  padding: 20px;
  background: #f5f7fa;
  border-radius: 8px;
}

.result-item {
  text-align: center;
}

.result-count {
  display: block;
  font-size: 32px;
  font-weight: bold;
  margin-bottom: 4px;
}

.result-label {
  font-size: 14px;
  color: #606266;
}

.result-item.success .result-count {
  color: #67c23a;
}

.result-item.skipped .result-count {
  color: #909399;
}

.result-item.failed .result-count {
  color: #f56c6c;
}

.result-details h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #303133;
}

.result-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
}

.result-item-row {
  padding: 10px 12px;
  border-bottom: 1px solid #f0f0f0;
}

.result-item-row:last-child {
  border-bottom: none;
}

.result-item-name {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.name-text {
  font-weight: 500;
  color: #303133;
}

.rename-text {
  color: #409eff;
}

.result-item-message {
  font-size: 12px;
  color: #909399;
  padding-left: 54px;
}

h2 {
  margin: 0;
  font-size: 18px;
}

.simulate-rule-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.simulate-rule-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.labels-input-area {
  width: 100%;
}

.label-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.label-eq {
  font-weight: bold;
  color: #909399;
}

.simulate-result {
  margin-top: 10px;
}

.simulate-match-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.simulate-match-status.matched {
  background: #f0f9eb;
  border: 1px solid #e1f3d8;
}

.simulate-match-status.not-matched {
  background: #fef0f0;
  border: 1px solid #fde2e2;
}

.status-icon {
  font-size: 28px;
  font-weight: bold;
}

.matched .status-icon {
  color: #67c23a;
}

.not-matched .status-icon {
  color: #f56c6c;
}

.status-text {
  font-size: 18px;
  font-weight: 600;
}

.matched .status-text {
  color: #67c23a;
}

.not-matched .status-text {
  color: #f56c6c;
}

.match-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.match-detail-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
}

.match-detail-item.passed {
  background: #f0f9eb;
}

.match-detail-item.failed {
  background: #fef0f0;
}

.detail-icon {
  font-size: 16px;
  font-weight: bold;
  flex-shrink: 0;
  margin-top: 2px;
}

.passed .detail-icon {
  color: #67c23a;
}

.failed .detail-icon {
  color: #f56c6c;
}

.detail-content {
  flex: 1;
}

.detail-condition {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 2px;
}

.detail-reason {
  font-size: 12px;
  color: #909399;
}

.window-status {
  margin-top: 8px;
}

.window-info {
  display: flex;
  gap: 24px;
  padding: 12px 16px;
  background: #f5f7fa;
  border-radius: 6px;
  font-size: 14px;
  color: #606266;
}

.dep-empty {
  padding: 40px 0;
}

.dependency-graph-container {
  overflow-x: auto;
}

.dependency-svg {
  display: block;
  min-height: 200px;
}

.graph-node {
  cursor: pointer;
}

.graph-node:hover rect {
  filter: brightness(0.95);
}

.graph-legend {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 12px;
  font-size: 13px;
  color: #606266;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.legend-dot.enabled {
  background: #67c23a;
}

.legend-dot.disabled {
  background: #909399;
}
</style>
