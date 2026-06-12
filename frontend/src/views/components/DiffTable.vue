<template>
  <div class="diff-table-wrapper">
    <el-empty v-if="!items || items.length === 0" description="暂无差异数据" />
    <el-table
      v-else
      :data="items"
      border
      size="small"
      :row-key="(row: any) => row.eventId"
    >
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="expand-content">
            <div class="expand-title">事件完整 Payload</div>
            <pre class="event-json">{{ formatJson(row.eventPayload) }}</pre>

            <div class="diff-compare">
              <div class="diff-col">
                <div class="diff-col-header original">
                  <el-icon><Clock /></el-icon>
                  原始录制匹配结果
                </div>
                <div class="diff-col-body">
                  <div class="rule-list-label">命中规则ID:</div>
                  <div v-if="row.originalMatchedRuleIds?.length" class="rule-tags">
                    <el-tag
                      v-for="id in row.originalMatchedRuleIds"
                      :key="id"
                      type="primary"
                      size="small"
                    >
                      {{ id }}
                    </el-tag>
                  </div>
                  <el-tag v-else type="info" size="small">无命中</el-tag>
                </div>
              </div>

              <div class="diff-col">
                <div class="diff-col-header replay">
                  <el-icon><VideoPlay /></el-icon>
                  回放匹配结果
                </div>
                <div class="diff-col-body">
                  <div class="rule-list-label">命中规则ID:</div>
                  <div v-if="row.replayedMatchedRuleIds?.length" class="rule-tags">
                    <el-tag
                      v-for="id in row.replayedMatchedRuleIds"
                      :key="id"
                      :type="diffTypeTagType"
                      size="small"
                    >
                      {{ id }}
                    </el-tag>
                  </div>
                  <el-tag v-else type="info" size="small">无命中</el-tag>
                  <div v-if="row.replayedMatchDetails?.length" class="match-details">
                    <div class="match-details-title">匹配详情:</div>
                    <el-table :data="row.replayedMatchDetails" size="mini" border>
                      <el-table-column prop="ruleId" label="规则ID" width="200" />
                      <el-table-column label="条件详情">
                        <template #default="{ row: detail }">
                          <div v-if="detail.matchDetail?.conditions?.length" class="cond-list">
                            <div
                              v-for="(c, idx) in detail.matchDetail.conditions"
                              :key="idx"
                              class="cond-item"
                              :class="c.passed ? 'passed' : 'failed'"
                            >
                              <el-icon><component :is="c.passed ? 'CircleCheck' : 'CircleClose'" /></el-icon>
                              <span>{{ c.condition }} - {{ c.reason }}</span>
                            </div>
                          </div>
                        </template>
                      </el-table-column>
                    </el-table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="事件ID" prop="eventId" width="260" show-overflow-tooltip />
      <el-table-column label="事件来源" width="120">
        <template #default="{ row }">
          {{ row.eventPayload?.source || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="指标名称" width="140">
        <template #default="{ row }">
          {{ row.eventPayload?.metricName || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="指标值" width="100">
        <template #default="{ row }">
          {{ row.eventPayload?.value ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column label="原始命中规则" min-width="180">
        <template #default="{ row }">
          <template v-if="row.originalMatchedRuleIds?.length">
            <el-tag
              v-for="id in row.originalMatchedRuleIds.slice(0, 3)"
              :key="id"
              type="primary"
              size="small"
              style="margin-right: 4px; margin-bottom: 2px"
            >
              {{ id.slice(0, 8) }}...
            </el-tag>
            <span v-if="row.originalMatchedRuleIds.length > 3" style="font-size: 12px; color: #909399">
              +{{ row.originalMatchedRuleIds.length - 3 }}
            </span>
          </template>
          <el-tag v-else type="info" size="small">无</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="回放命中规则" min-width="180">
        <template #default="{ row }">
          <template v-if="row.replayedMatchedRuleIds?.length">
            <el-tag
              v-for="id in row.replayedMatchedRuleIds.slice(0, 3)"
              :key="id"
              :type="diffTypeTagType"
              size="small"
              style="margin-right: 4px; margin-bottom: 2px"
            >
              {{ id.slice(0, 8) }}...
            </el-tag>
            <span v-if="row.replayedMatchedRuleIds.length > 3" style="font-size: 12px; color: #909399">
              +{{ row.replayedMatchedRuleIds.length - 3 }}
            </span>
          </template>
          <el-tag v-else type="info" size="small">无</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="差异类型" width="110" align="center">
        <template #default>
          <el-tag :type="diffTypeTagType" effect="dark">
            {{ diffTypeLabel }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Clock, VideoPlay, CircleCheck, CircleClose } from '@element-plus/icons-vue';
import type { ComparisonDiffItem } from '@/services/apiEndpoints';

const props = defineProps<{
  items: ComparisonDiffItem[];
  diffType: 'missed' | 'false_positive' | 'rule_changed';
}>();

const diffTypeLabel = computed(() => {
  switch (props.diffType) {
    case 'missed': return '漏报';
    case 'false_positive': return '误报';
    default: return '规则变更';
  }
});

const diffTypeTagType = computed(() => {
  switch (props.diffType) {
    case 'missed': return 'danger';
    case 'false_positive': return 'warning';
    default: return 'info';
  }
});

function formatJson(obj: any) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}
</script>

<style scoped>
.expand-content {
  padding: 8px 16px 16px;
}

.expand-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.event-json {
  background: #f5f7fa;
  border-radius: 4px;
  padding: 12px;
  margin: 0 0 16px 0;
  font-family: 'SF Mono', Consolas, Monaco, monospace;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow: auto;
}

.diff-compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.diff-col-header {
  padding: 8px 12px;
  border-radius: 4px 4px 0 0;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #fff;
}

.diff-col-header.original {
  background: #409eff;
}

.diff-col-header.replay {
  background: #67c23a;
}

.diff-col-body {
  border: 1px solid #ebeef5;
  border-top: none;
  padding: 12px;
  min-height: 100px;
  border-radius: 0 0 4px 4px;
}

.rule-list-label {
  font-size: 12px;
  color: #606266;
  margin-bottom: 6px;
}

.rule-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
}

.match-details {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #dcdfe6;
}

.match-details-title {
  font-size: 12px;
  color: #606266;
  margin-bottom: 8px;
}

.cond-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cond-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 4px 6px;
  border-radius: 3px;
}

.cond-item.passed {
  color: #67c23a;
  background: #f0f9eb;
}

.cond-item.failed {
  color: #f56c6c;
  background: #fef0f0;
}
</style>
