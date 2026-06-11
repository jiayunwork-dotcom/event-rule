<template>
  <div class="rule-editor">
    <div class="page-header card">
      <div class="flex justify-between items-center">
        <h2>{{ isEdit ? '编辑规则' : '创建规则' }}</h2>
        <div>
          <el-button @click="goBack">取消</el-button>
          <el-button type="primary" @click="saveRule" :loading="saving">
            保存
          </el-button>
        </div>
      </div>
    </div>

    <el-row :gutter="20">
      <el-col :span="16">
        <div class="card mb-20">
          <h3 class="section-title">基本信息</h3>
          <el-form :model="form" label-width="100px">
            <el-form-item label="规则名称" required>
              <el-input v-model="form.name" placeholder="请输入规则名称" />
            </el-form-item>
            
            <el-form-item label="描述">
              <el-input v-model="form.description" type="textarea" :rows="2" />
            </el-form-item>
            
            <el-form-item label="严重程度" required>
              <el-select v-model="form.severity" style="width: 200px">
                <el-option label="FATAL" value="fatal" />
                <el-option label="CRITICAL" value="critical" />
                <el-option label="WARNING" value="warning" />
                <el-option label="INFO" value="info" />
              </el-select>
            </el-form-item>
            
            <el-form-item label="优先级">
              <el-input-number v-model="form.priority" :min="0" :max="100" />
              <span class="ml-2 text-sm text-muted">数值越高优先级越高</span>
            </el-form-item>
            
            <el-form-item label="编辑模式">
              <el-radio-group v-model="editMode">
                <el-radio value="visual">可视化表单</el-radio>
                <el-radio value="dsl">文本 DSL</el-radio>
              </el-radio-group>
            </el-form-item>
            
            <el-form-item label="聚合标签">
              <el-select
                v-model="form.groupByLabels"
                multiple
                filterable
                allow-create
                placeholder="选择或输入标签名"
                style="width: 100%"
              >
                <el-option v-for="tag in commonLabels" :key="tag" :label="tag" :value="tag" />
              </el-select>
            </el-form-item>
          </el-form>
        </div>

        <div v-if="editMode === 'visual'" class="card mb-20">
          <div class="flex justify-between items-center mb-20">
            <h3 class="section-title mb-0">条件配置</h3>
            <el-select v-model="form.conditionType" style="width: 180px" @change="onConditionTypeChange">
              <el-option label="单指标阈值" value="single_threshold" />
              <el-option label="多指标组合" value="multi_condition" />
              <el-option label="时间窗口聚合" value="window_aggregate" />
              <el-option label="频率条件" value="frequency" />
              <el-option label="标签匹配" value="label_match" />
              <el-option label="序列模式" value="sequence_pattern" />
            </el-select>
          </div>
          
          <el-alert
            v-if="form.conditions.conditions.length >= 10"
            type="warning"
            :closable="false"
            class="mb-20"
          >
            规则最多包含10个条件组合，已达到上限
          </el-alert>

          <template v-if="form.conditionType === 'single_threshold'">
            <div class="condition-item">
              <el-form :inline="true" label-width="80px">
                <el-form-item label="指标">
                  <el-select v-model="form.conditions.conditions[0].metric" filterable allow-create style="width: 200px">
                    <el-option v-for="m in commonMetrics" :key="m" :label="m" :value="m" />
                  </el-select>
                </el-form-item>
                <el-form-item label="操作符">
                  <el-select v-model="form.conditions.conditions[0].operator" style="width: 120px">
                    <el-option label="大于 (>" value="gt" />
                    <el-option label="小于 (<" value="lt" />
                    <el-option label="大于等于 (>=" value="gte" />
                    <el-option label="小于等于 (<=" value="lte" />
                    <el-option label="等于 (=" value="eq" />
                    <el-option label="不等于 (!=" value="ne" />
                  </el-select>
                </el-form-item>
                <el-form-item label="阈值">
                  <el-input-number v-model="form.conditions.conditions[0].value" style="width: 150px" />
                </el-form-item>
              </el-form>
            </div>
          </template>

          <template v-else-if="form.conditionType === 'multi_condition'">
            <el-radio-group v-model="form.conditions.operator" class="mb-20">
              <el-radio value="AND">AND (全部满足)</el-radio>
              <el-radio value="OR">OR (任一满足)</el-radio>
            </el-radio-group>
            
            <div
              v-for="(cond, index) in form.conditions.conditions"
              :key="index"
              class="condition-item"
            >
              <div class="flex items-center mb-10">
                <span class="condition-index">条件 {{ index + 1 }}</span>
                <el-button
                  v-if="form.conditions.conditions.length < 10"
                  type="success"
                  size="small"
                  @click="addCondition"
                >
                  + 添加
                </el-button>
                <el-button
                  v-if="form.conditions.conditions.length > 1"
                  type="danger"
                  size="small"
                  @click="removeCondition(index)"
                >
                  删除
                </el-button>
              </div>
              
              <el-form :inline="true" label-width="80px">
                <el-form-item label="类型">
                  <el-select v-model="cond.type" style="width: 120px" @change="onConditionTypeChange">
                    <el-option label="指标阈值" value="threshold" />
                    <el-option label="标签匹配" value="label" />
                  </el-select>
                </el-form-item>
                
                <template v-if="cond.type === 'threshold'">
                  <el-form-item label="指标">
                    <el-select v-model="cond.metric" filterable allow-create style="width: 150px">
                      <el-option v-for="m in commonMetrics" :key="m" :label="m" :value="m" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="操作符">
                    <el-select v-model="cond.operator" style="width: 100px">
                      <el-option label=">" value="gt" />
                      <el-option label="<" value="lt" />
                      <el-option label=">=" value="gte" />
                      <el-option label="<=" value="lte" />
                      <el-option label="=" value="eq" />
                      <el-option label="!=" value="ne" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="阈值">
                    <el-input-number v-model="cond.value" style="width: 120px" />
                  </el-form-item>
                </template>
                
                <template v-else-if="cond.type === 'label'">
                  <el-form-item label="标签">
                    <el-input v-model="cond.label" style="width: 120px" />
                  </el-form-item>
                  <el-form-item label="操作符">
                    <el-select v-model="cond.operator" style="width: 100px">
                      <el-option label="等于" value="eq" />
                      <el-option label="不等于" value="ne" />
                      <el-option label="包含" value="contains" />
                      <el-option label="正则匹配" value="regex" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="值">
                    <el-input v-model="cond.labelValue" style="width: 150px" />
                  </el-form-item>
                </template>
              </el-form>
            </div>
          </template>

          <template v-else-if="form.conditionType === 'window_aggregate'">
            <div class="condition-item">
              <el-form :inline="true" label-width="100px">
                <el-form-item label="窗口大小">
                  <el-input-number v-model="form.windowSize" :min="60" :max="3600" style="width: 120px" />
                  <span class="ml-2">秒</span>
                </el-form-item>
                <el-form-item label="聚合函数">
                  <el-select v-model="form.conditions.conditions[0].aggregate" style="width: 120px">
                    <el-option label="计数" value="count" />
                    <el-option label="求和" value="sum" />
                    <el-option label="平均" value="avg" />
                  </el-select>
                </el-form-item>
                <el-form-item label="指标">
                  <el-select v-model="form.conditions.conditions[0].metric" filterable allow-create style="width: 150px">
                    <el-option v-for="m in commonMetrics" :key="m" :label="m" :value="m" />
                  </el-select>
                </el-form-item>
                <el-form-item label="操作符">
                  <el-select v-model="form.conditions.conditions[0].operator" style="width: 100px">
                    <el-option label=">" value="gt" />
                    <el-option label="<" value="lt" />
                    <el-option label=">=" value="gte" />
                    <el-option label="<=" value="lte" />
                  </el-select>
                </el-form-item>
                <el-form-item label="阈值">
                  <el-input-number v-model="form.conditions.conditions[0].threshold" style="width: 120px" />
                </el-form-item>
              </el-form>
            </div>
          </template>

          <template v-else-if="form.conditionType === 'frequency'">
            <div class="condition-item">
              <el-form :inline="true" label-width="100px">
                <el-form-item label="时间窗口">
                  <el-input-number v-model="form.conditions.conditions[0].windowSize" :min="60" :max="86400" style="width: 120px" />
                  <span class="ml-2">秒</span>
                </el-form-item>
                <el-form-item label="超过次数">
                  <el-input-number v-model="form.conditions.conditions[0].threshold" :min="1" style="width: 120px" />
                  <span class="ml-2">次</span>
                </el-form-item>
              </el-form>
            </div>
          </template>

          <template v-else-if="form.conditionType === 'label_match'">
            <div class="condition-item">
              <el-form :inline="true" label-width="100px">
                <el-form-item label="标签">
                  <el-input v-model="form.conditions.conditions[0].label" style="width: 150px" />
                </el-form-item>
                <el-form-item label="操作符">
                  <el-select v-model="form.conditions.conditions[0].operator" style="width: 120px">
                    <el-option label="等于" value="eq" />
                    <el-option label="不等于" value="ne" />
                    <el-option label="包含" value="contains" />
                    <el-option label="正则匹配" value="regex" />
                  </el-select>
                </el-form-item>
                <el-form-item label="值">
                  <el-input v-model="form.conditions.conditions[0].labelValue" style="width: 200px" />
                </el-form-item>
              </el-form>
            </div>
          </template>

          <template v-else-if="form.conditionType === 'sequence_pattern'">
            <div class="condition-item">
              <el-form :inline="true" label-width="120px">
                <el-form-item label="前置事件类型">
                  <el-input v-model="form.conditions.conditions[0].eventA" placeholder="如: db_error" style="width: 150px" />
                </el-form-item>
                <el-form-item label="后续事件类型">
                  <el-input v-model="form.conditions.conditions[0].eventB" placeholder="如: app_timeout" style="width: 150px" />
                </el-form-item>
                <el-form-item label="时间间隔">
                  <el-input-number v-model="form.conditions.conditions[0].interval" :min="1" :max="3600" style="width: 120px" />
                  <span class="ml-2">秒</span>
                </el-form-item>
              </el-form>
            </div>
          </template>
        </div>

        <div v-else class="card mb-20">
          <h3 class="section-title">DSL 规则</h3>
          <el-alert
            title="DSL 语法示例"
            type="info"
            :closable="false"
            class="mb-20"
          >
            <p><code>SELECT count(*) FROM events WHERE label.service='payment' WINDOW 5m HAVING count > 10 THEN alert(severity='critical')</code></p>
            <p class="mt-10">支持的语法：</p>
            <ul class="mt-5">
              <li>SELECT: count(*), sum(metric_name), avg(metric_name)</li>
              <li>WHERE: label.xxx='value' 多个条件用 AND 连接</li>
              <li>WINDOW: 1m, 5m, 1h 等</li>
              <li>HAVING: count > 10, sum > 100 等</li>
              <li>THEN: alert(severity='critical', name='告警名称')</li>
            </ul>
          </el-alert>
          
          <el-input
            v-model="form.dsl"
            type="textarea"
            :rows="8"
            placeholder="输入 DSL 规则..."
            class="code-textarea"
          />
          
          <div class="mt-20">
            <el-button @click="validateDsl">验证 DSL</el-button>
            <span v-if="dslValidated" class="ml-2" :class="dslValid ? 'text-success' : 'text-error'">
              {{ dslValid ? '✓ DSL 有效' : '✗ DSL 无效' }}
            </span>
          </div>
        </div>
      </el-col>

      <el-col :span="8">
        <div class="card">
          <h3 class="section-title">规则预览</h3>
          <div class="preview-content">
            <h4>{{ form.name || '未命名规则' }}</h4>
            <p class="text-muted mb-10">{{ form.description || '无描述' }}</p>
            
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="严重程度">
                <el-tag :type="getSeverityType(form.severity)">
                  {{ form.severity.toUpperCase() }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="优先级">
                {{ form.priority }}
              </el-descriptions-item>
              <el-descriptions-item label="条件类型">
                {{ getConditionTypeText(form.conditionType) }}
              </el-descriptions-item>
              <el-descriptions-item label="聚合标签">
                <el-tag v-for="tag in form.groupByLabels" :key="tag" size="small" class="mr-5">
                  {{ tag }}
                </el-tag>
                <span v-if="form.groupByLabels.length === 0" class="text-muted">无</span>
              </el-descriptions-item>
            </el-descriptions>
            
            <div v-if="editMode === 'visual'" class="mt-20">
              <h5>条件表达式</h5>
              <div class="condition-preview">
                {{ generateConditionPreview() }}
              </div>
            </div>
            
            <div v-else class="mt-20">
              <h5>DSL</h5>
              <pre class="dsl-preview">{{ form.dsl }}</pre>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { rulesApi, Rule } from '@/services/apiEndpoints';

const route = useRoute();
const router = useRouter();

const isEdit = computed(() => !!route.params.id);
const saving = ref(false);
const editMode = ref<'visual' | 'dsl'>('visual');
const dslValidated = ref(false);
const dslValid = ref(false);

const commonMetrics = ['cpu_usage', 'memory_usage', 'disk_usage', 'network_usage', 'error_count', 'request_count', 'response_time'];
const commonLabels = ['host', 'service', 'environment', 'instance', 'job', 'team'];

const form = reactive<any>({
  name: '',
  description: '',
  severity: 'warning',
  conditionType: 'single_threshold',
  conditions: {
    operator: 'AND',
    conditions: [
      {
        type: 'threshold',
        metric: 'cpu_usage',
        operator: 'gt',
        value: 80,
      },
    ],
  },
  dsl: '',
  priority: 0,
  isEnabled: true,
  windowSize: 300,
  groupByLabels: [],
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

function onConditionTypeChange() {
  const conditions = form.conditions.conditions;
  
  if (form.conditionType === 'single_threshold') {
    conditions[0] = { type: 'threshold', metric: 'cpu_usage', operator: 'gt', value: 80 };
  } else if (form.conditionType === 'window_aggregate') {
    conditions[0] = { type: 'window', metric: 'error_count', aggregate: 'count', operator: 'gt', threshold: 10 };
  } else if (form.conditionType === 'frequency') {
    conditions[0] = { type: 'frequency', windowSize: 3600, threshold: 5 };
  } else if (form.conditionType === 'label_match') {
    conditions[0] = { type: 'label', label: 'host', operator: 'contains', labelValue: 'prod' };
  } else if (form.conditionType === 'sequence_pattern') {
    conditions[0] = { type: 'sequence', eventA: 'event_a', eventB: 'event_b', interval: 30 };
  }
}

function addCondition() {
  if (form.conditions.conditions.length >= 10) {
    ElMessage.warning('规则最多包含10个条件组合');
    return;
  }
  form.conditions.conditions.push({
    type: 'threshold',
    metric: 'cpu_usage',
    operator: 'gt',
    value: 80,
  });
}

function removeCondition(index: number) {
  form.conditions.conditions.splice(index, 1);
}

function generateConditionPreview(): string {
  const conds = form.conditions.conditions;
  const operator = form.conditions.operator;
  
  const opMap: Record<string, string> = {
    gt: '>', lt: '<', gte: '>=', lte: '<=', eq: '=', ne: '!=',
    contains: '包含', regex: '匹配',
  };
  
  const previews = conds.map((c: any) => {
    if (c.type === 'threshold') {
      return `${c.metric} ${opMap[c.operator] || c.operator} ${c.value}`;
    } else if (c.type === 'label') {
      return `label.${c.label} ${opMap[c.operator] || c.operator} "${c.labelValue}"`;
    } else if (c.type === 'window') {
      return `${c.aggregate}(${c.metric}) ${opMap[c.operator] || c.operator} ${c.threshold} (${form.windowSize}s窗口)`;
    } else if (c.type === 'frequency') {
      return `${c.windowSize}秒内出现 > ${c.threshold} 次`;
    } else if (c.type === 'sequence') {
      return `${c.eventA} 发生后 ${c.interval}秒内 ${c.eventB} 也发生`;
    }
    return JSON.stringify(c);
  });
  
  return previews.join(` ${operator} `);
}

async function validateDsl() {
  if (!form.dsl) {
    ElMessage.warning('请输入 DSL');
    return;
  }
  
  try {
    await rulesApi.parseDsl(form.dsl);
    dslValidated.value = true;
    dslValid.value = true;
    ElMessage.success('DSL 验证通过');
  } catch (error) {
    dslValidated.value = true;
    dslValid.value = false;
  }
}

async function loadRule(id: string) {
  try {
    const response = await rulesApi.getRule(id);
    const rule = response.data;
    
    Object.assign(form, {
      name: rule.name,
      description: rule.description,
      severity: rule.severity,
      conditionType: rule.conditionType,
      conditions: rule.conditions,
      dsl: rule.dsl || '',
      priority: rule.priority,
      isEnabled: rule.isEnabled,
      windowSize: rule.windowSize,
      groupByLabels: rule.groupByLabels || [],
    });
    
    editMode.value = rule.conditionType === 'dsl' ? 'dsl' : 'visual';
  } catch (error) {
    console.error('Failed to load rule:', error);
  }
}

async function saveRule() {
  if (!form.name) {
    ElMessage.error('请输入规则名称');
    return;
  }
  
  if (editMode.value === 'dsl' && !form.dsl) {
    ElMessage.error('请输入 DSL 规则');
    return;
  }
  
  if (editMode.value === 'visual' && form.conditionType !== 'dsl') {
    form.dsl = '';
  } else if (editMode.value === 'dsl') {
    form.conditionType = 'dsl';
  }
  
  saving.value = true;
  try {
    const data = {
      name: form.name,
      description: form.description,
      severity: form.severity,
      conditionType: form.conditionType,
      conditions: form.conditions,
      dsl: form.dsl,
      priority: form.priority,
      isEnabled: form.isEnabled,
      windowSize: form.windowSize,
      groupByLabels: form.groupByLabels,
    };
    
    if (isEdit.value) {
      await rulesApi.updateRule(route.params.id as string, data);
      ElMessage.success('规则更新成功');
    } else {
      await rulesApi.createRule(data);
      ElMessage.success('规则创建成功');
    }
    
    router.push('/rules');
  } catch (error) {
    console.error('Failed to save rule:', error);
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push('/rules');
}

onMounted(() => {
  if (isEdit.value) {
    loadRule(route.params.id as string);
  }
});
</script>

<style scoped>
.rule-editor {
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

.section-title {
  margin: 0 0 20px 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  border-left: 4px solid #409eff;
  padding-left: 10px;
}

.condition-item {
  padding: 15px;
  background: #f5f7fa;
  border-radius: 6px;
  margin-bottom: 10px;
}

.condition-index {
  font-weight: 600;
  color: #409eff;
  margin-right: 10px;
}

.code-textarea {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 13px;
}

.dsl-preview {
  background: #282c34;
  color: #abb2bf;
  padding: 15px;
  border-radius: 6px;
  overflow-x: auto;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.condition-preview {
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
}

.preview-content h4 {
  margin: 0 0 10px 0;
  color: #303133;
}

.preview-content h5 {
  margin: 15px 0 10px 0;
  font-size: 14px;
  color: #606266;
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

.mb-0 {
  margin-bottom: 0;
}

.mb-10 {
  margin-bottom: 10px;
}

.mb-20 {
  margin-bottom: 20px;
}

.mt-10 {
  margin-top: 10px;
}

.mt-5 {
  margin-top: 5px;
}

.mt-20 {
  margin-top: 20px;
}

.ml-2 {
  margin-left: 8px;
}

.mr-5 {
  margin-right: 5px;
}

.text-sm {
  font-size: 12px;
}

.text-muted {
  color: #909399;
}

.text-success {
  color: #67c23a;
}

.text-error {
  color: #f56c6c;
}

h2 {
  margin: 0;
  font-size: 18px;
}

ul {
  margin: 0;
  padding-left: 20px;
}

code {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 3px;
}
</style>
