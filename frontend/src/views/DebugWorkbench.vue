<template>
  <div class="debug-workbench">
    <el-card class="top-section">
      <template #header>
        <div class="header-row">
          <span class="section-title">
            <el-icon><VideoCamera /></el-icon>
            录制会话管理
          </span>
          <div class="header-actions">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索会话名称"
              clearable
              style="width: 220px; margin-right: 12px"
              @keyup.enter="loadSessions"
              @clear="loadSessions"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-button type="primary" :icon="Plus" @click="showCreateDialog = true">
              新建录制
            </el-button>
          </div>
        </div>
      </template>

      <div class="session-selector">
        <el-table
          :data="sessions"
          v-loading="sessionsLoading"
          border
          size="small"
          @selection-change="handleSessionSelection"
          :row-style="{ cursor: 'pointer' }"
        >
          <el-table-column type="selection" width="45" :selectable="isSelectable" />
          <el-table-column prop="name" label="会话名称" min-width="180">
            <template #default="{ row }">
              <span class="session-name" @click="handleSessionClick(row)">
                {{ row.name }}
                <el-tag v-if="row.status === 'recording'" type="danger" size="small" effect="dark" style="margin-left: 8px">
                  <span class="recording-dot"></span>录制中
                </el-tag>
                <el-tag v-else-if="row.status === 'stopped'" type="success" size="small" style="margin-left: 8px">
                  已停止
                </el-tag>
                <el-tag v-else type="info" size="small">已归档</el-tag>
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
          <el-table-column label="时间范围" width="280">
            <template #default="{ row }">
              <div class="time-range">
                <div>开始: {{ formatTime(row.startTime) }}</div>
                <div>结束: {{ formatTime(row.endTime) }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="180">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="280" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === 'recording'">
                <el-button type="warning" size="small" :icon="VideoPause" @click.stop="handleStopRecording(row)">
                  停止录制
                </el-button>
              </template>
              <template v-else-if="row.status === 'stopped'">
                <el-button type="success" size="small" :icon="VideoPlay" @click.stop="showReplayDialog(row)" :disabled="!!currentReplaySessionId">
                  回放
                </el-button>
                <el-button type="primary" size="small" :icon="Aim" @click.stop="showBreakpointDialog(row)">
                  设断点
                </el-button>
                <el-button type="info" size="small" :icon="Folder" @click.stop="handleArchive(row)">
                  归档
                </el-button>
              </template>
              <el-button type="danger" size="small" :icon="Delete" @click.stop="handleDeleteSession(row)">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination">
          <el-pagination
            v-model:current-page="sessionPage"
            v-model:page-size="sessionPageSize"
            :page-sizes="[10, 20, 50]"
            :total="sessionsTotal"
            layout="total, sizes, prev, pager, next, jumper"
            background
            @size-change="loadSessions"
            @current-change="loadSessions"
          />
        </div>
      </div>
    </el-card>

    <el-card class="middle-section">
      <template #header>
        <div class="header-row">
          <span class="section-title">
            <el-icon><DataAnalysis /></el-icon>
            回放进度与实时统计
            <span v-if="selectedSession" class="current-session-label">
              当前会话: {{ selectedSession.name }}
            </span>
          </span>
          <div class="header-actions">
            <template v-if="currentReplaySessionId">
              <el-button type="primary" :icon="Aim" @click="showBreakpointDialogForCurrentSession">
                设断点
              </el-button>
              <el-button type="success" :icon="CollectionTag" @click="handleAddBookmark" :disabled="!canAddBookmark">
                添加书签
              </el-button>
              <template v-if="replayMode === 'single_step'">
                <el-button type="success" :icon="Right" @click="handleSingleStep" :disabled="!canStep">
                  下一条
                </el-button>
              </template>
              <template v-else>
                <el-button v-if="!progress?.isPaused" type="warning" :icon="VideoPause" @click="handlePause">
                  暂停
                </el-button>
                <el-button v-else type="success" :icon="VideoPlay" @click="handleResume">
                  继续
                </el-button>
              </template>
              <el-button type="danger" :icon="Close" @click="handleStopReplay">
                停止回放
              </el-button>
            </template>
            <el-button v-else type="info" :icon="VideoPlay" :disabled="!selectedSession || selectedSession.status !== 'stopped'" @click="selectedSession && showReplayDialog(selectedSession)">
              启动回放
            </el-button>
          </div>
        </div>
      </template>

      <div v-if="currentReplaySessionId && progress" class="progress-area">
        <div class="progress-main">
          <div class="progress-stats">
            <el-card shadow="hover" class="stat-card">
              <div class="stat-label">已回放</div>
              <div class="stat-value primary">{{ progress.replayedCount }} / {{ progress.totalEvents }}</div>
            </el-card>
            <el-card shadow="hover" class="stat-card">
              <div class="stat-label">命中数</div>
              <div class="stat-value success">{{ progress.matchedCount }}</div>
            </el-card>
            <el-card shadow="hover" class="stat-card">
              <div class="stat-label">命中率</div>
              <div class="stat-value warning">{{ formatPercent(progress.hitRate) }}</div>
            </el-card>
          </div>

          <div class="progress-with-slider">
            <div class="progress-bar-wrapper">
              <el-progress
                :percentage="progress.totalEvents > 0 ? (progress.replayedCount / progress.totalEvents) * 100 : 0"
                :status="progress.replayedCount === progress.totalEvents && progress.totalEvents > 0 ? 'success' : undefined"
                :stroke-width="18"
                class="progress-bar"
              />
            </div>
            <div v-if="replayMode !== 'single_step'" class="speed-slider">
              <span class="speed-label">倍速:</span>
              <el-slider
                v-model="currentSpeed"
                :min="0.5"
                :max="20"
                :step="0.5"
                :marks="speedMarks"
                @change="handleSpeedChange"
                style="width: 180px"
              />
              <span class="speed-value">{{ formattedSpeed }}</span>
            </div>
          </div>
        </div>

        <div class="bookmarks-panel">
          <div class="bookmarks-header">
            <el-icon><CollectionTag /></el-icon>
            <span>回放书签</span>
          </div>
          <div v-if="bookmarks.length === 0" class="bookmarks-empty">
            <el-empty description="暂无书签" :image-size="60" />
          </div>
          <div v-else class="bookmarks-list">
            <div
              v-for="bookmark in bookmarks"
              :key="bookmark.id"
              class="bookmark-item"
              @click="handleJumpToBookmark(bookmark)"
            >
              <div class="bookmark-info">
                <div class="bookmark-name" @click.stop="startRenameBookmark(bookmark)">
                  <el-input
                    v-if="renamingBookmarkId === bookmark.id"
                    v-model="renameInputValue"
                    size="small"
                    @keyup.enter="confirmRenameBookmark"
                    @blur="confirmRenameBookmark"
                    ref="renameInputRef"
                  />
                  <span v-else>{{ bookmark.name }}</span>
                </div>
                <div class="bookmark-progress">
                  进度: {{ formatPercent(bookmark.eventIndex / progress.totalEvents) }}
                </div>
              </div>
              <div class="bookmark-actions">
                <el-button type="primary" link size="small" :icon="VideoPlay" @click.stop="handleJumpToBookmark(bookmark)" title="跳转到此处" />
                <el-button type="danger" link size="small" :icon="Delete" @click.stop="handleDeleteBookmark(bookmark)" title="删除" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="currentReplaySessionId && progress" class="current-event-section">
        <el-card v-if="progress.currentEvent" class="current-event-preview">
          <template #header>
            <div class="header-row">
              <span>
                <el-icon><View /></el-icon>
                当前事件预览
              </span>
              <el-tag size="small">{{ progress.currentEvent.eventSource }}</el-tag>
            </div>
          </template>
          <div class="event-preview-content">
            <pre class="event-json">{{ formatJson(progress.currentEvent.eventPayload) }}</pre>
          </div>
          <div v-if="progress.currentMatchResults?.length" class="match-results">
            <div class="match-title">当前规则命中:</div>
            <el-tag
              v-for="r in progress.currentMatchResults"
              :key="r.id"
              type="success"
              style="margin-right: 8px; margin-bottom: 4px"
            >
              {{ r.ruleId }}
            </el-tag>
          </div>
          <div v-if="progress.currentCustomMatchResults?.length" class="match-results">
            <div class="match-title custom">自定义规则命中:</div>
            <el-tag
              v-for="r in progress.currentCustomMatchResults"
              :key="r.ruleId"
              type="warning"
              style="margin-right: 8px; margin-bottom: 4px"
            >
              {{ r.ruleName }}
            </el-tag>
          </div>
        </el-card>
      </div>

      <div v-else class="empty-state">
        <el-empty description="请从上方选择一个已停止的录制会话，然后点击启动回放开始调试">
          <el-button type="primary" :icon="VideoPlay" :disabled="!selectedSession || selectedSession.status !== 'stopped'" @click="selectedSession && showReplayDialog(selectedSession)">
            启动回放
          </el-button>
        </el-empty>
      </div>
    </el-card>

    <el-card class="bottom-section">
      <template #header>
        <div class="header-row">
          <span class="section-title">
            <el-icon><Files /></el-icon>
            规则对比报告
          </span>
          <div v-if="comparisonReport" class="header-actions">
            <div class="report-stats">
              <el-tag type="success" style="margin-right: 8px">
                一致: {{ comparisonReport.consistentCount }}
              </el-tag>
              <el-tag type="danger" style="margin-right: 8px">
                漏报: {{ comparisonReport.missedCount }}
              </el-tag>
              <el-tag type="warning" style="margin-right: 8px">
                误报: {{ comparisonReport.falsePositiveCount }}
              </el-tag>
              <el-tag type="info">
                规则变更: {{ comparisonReport.ruleChangedCount }}
              </el-tag>
            </div>
            <el-divider direction="vertical" />
            <el-button type="primary" size="small" :icon="Download" @click="handleExportJson">
              导出JSON
            </el-button>
            <el-button type="success" size="small" :icon="Document" @click="handleExportCsv">
              导出CSV
            </el-button>
          </div>
        </div>
      </template>

      <div v-if="comparisonReport">
        <el-tabs v-model="activeDiffTab" type="card">
          <el-tab-pane label="漏报" name="missed">
            <diff-table :items="comparisonReport.missedEvents" diff-type="missed" />
          </el-tab-pane>
          <el-tab-pane label="误报" name="false_positive">
            <diff-table :items="comparisonReport.falsePositiveEvents" diff-type="false_positive" />
          </el-tab-pane>
          <el-tab-pane label="规则变更" name="rule_changed">
            <diff-table :items="comparisonReport.ruleChangedEvents" diff-type="rule_changed" />
          </el-tab-pane>
          <el-tab-pane v-if="hotSwapReport?.hasCustomRules" label="热替换对比" name="hot_swap">
            <div v-if="hotSwapReport" class="hot-swap-stats">
              <el-tag type="success" style="margin-right: 8px">
                一致: {{ hotSwapReport.consistentCount }}
              </el-tag>
              <el-tag type="danger" style="margin-right: 8px">
                漏报(自定规则未命中): {{ hotSwapReport.missedCount }}
              </el-tag>
              <el-tag type="warning" style="margin-right: 8px">
                误报(自定规则新增命中): {{ hotSwapReport.falsePositiveCount }}
              </el-tag>
              <el-tag type="info">
                规则变更: {{ hotSwapReport.ruleChangedCount }}
              </el-tag>
            </div>
            <el-tabs v-model="activeHotSwapTab" type="border-card" class="hot-swap-tabs">
              <el-tab-pane label="漏报" name="missed">
                <hot-swap-table :items="hotSwapReport.missedEvents" diff-type="missed" />
              </el-tab-pane>
              <el-tab-pane label="误报" name="false_positive">
                <hot-swap-table :items="hotSwapReport.falsePositiveEvents" diff-type="false_positive" />
              </el-tab-pane>
              <el-tab-pane label="规则变更" name="rule_changed">
                <hot-swap-table :items="hotSwapReport.ruleChangedEvents" diff-type="rule_changed" />
              </el-tab-pane>
            </el-tabs>
          </el-tab-pane>
        </el-tabs>
      </div>
      <div v-else class="empty-state">
        <el-empty description="选择一个已停止的录制会话并完成回放后，将在此处显示规则对比报告" />
      </div>
    </el-card>

    <el-dialog v-model="showCreateDialog" title="新建录制会话" width="480px">
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="createForm.name" placeholder="请输入会话名称" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="createForm.description" type="textarea" :rows="3" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreateSession">开始录制</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showReplayDialogFlag" title="启动回放" width="680px">
      <el-form :model="replayForm" label-width="120px">
        <el-form-item label="回放模式" required>
          <el-radio-group v-model="replayForm.mode">
            <el-radio value="real_time">实时回放</el-radio>
            <el-radio value="accelerated">加速回放</el-radio>
            <el-radio value="single_step">单步回放</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="replayForm.mode === 'accelerated'" label="回放倍速">
          <el-select v-model="replayForm.speedMultiplier" placeholder="选择倍速" style="width: 100%">
            <el-option :label="2" :value="2" />
            <el-option :label="5" :value="5" />
            <el-option :label="10" :value="10" />
            <el-option label="自定义">
              <el-input-number
                v-model="customSpeed"
                :min="0.5"
                :max="20"
                :step="0.5"
                controls-position="right"
                @change="replayForm.speedMultiplier = customSpeed"
              />
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="对比规则版本">
          <el-radio-group v-model="ruleVersionMode">
            <el-radio value="current">使用当前规则</el-radio>
            <el-radio value="custom">使用自定义规则快照</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="ruleVersionMode === 'custom'" label="自定义规则">
          <div class="custom-rules-panel">
            <div class="custom-rules-toolbar">
              <el-button type="primary" size="small" :icon="Plus" @click="addCustomRule">
                添加规则
              </el-button>
              <el-button size="small" :icon="Refresh" @click="loadCurrentRulesAsCustom">
                载入当前规则
              </el-button>
            </div>
            <div v-if="customRules.length === 0" class="custom-rules-empty">
              <el-empty description="暂无自定义规则，点击上方按钮添加" :image-size="60" />
            </div>
            <div v-else class="custom-rules-list">
              <div
                v-for="(rule, idx) in customRules"
                :key="idx"
                class="custom-rule-item"
              >
                <div class="custom-rule-header">
                  <el-input v-model="rule.name" size="small" placeholder="规则名称" style="width: 200px" />
                  <el-select v-model="rule.conditionType" size="small" style="width: 140px" @change="onCustomRuleTypeChange(idx)">
                    <el-option label="单指标阈值" value="single_threshold" />
                    <el-option label="多条件组合" value="multi_condition" />
                    <el-option label="标签匹配" value="label_match" />
                  </el-select>
                  <el-button type="danger" link :icon="Delete" size="small" @click="removeCustomRule(idx)" />
                </div>
                <div v-if="rule.conditionType === 'single_threshold'" class="custom-rule-body">
                  <el-input v-model="rule.conditions.conditions[0].metric" placeholder="指标名称" size="small" style="width: 150px" />
                  <el-select v-model="rule.conditions.conditions[0].operator" size="small" style="width: 100px">
                    <el-option label=">" value="gt" />
                    <el-option label="<" value="lt" />
                    <el-option label=">=" value="gte" />
                    <el-option label="<=" value="lte" />
                    <el-option label="=" value="eq" />
                  </el-select>
                  <el-input-number v-model="rule.conditions.conditions[0].value" size="small" style="width: 120px" />
                </div>
                <div v-else-if="rule.conditionType === 'multi_condition'" class="custom-rule-body">
                  <el-radio-group v-model="rule.conditions.operator" size="small">
                    <el-radio value="AND">AND</el-radio>
                    <el-radio value="OR">OR</el-radio>
                  </el-radio-group>
                  <div v-for="(cond, ci) in rule.conditions.conditions" :key="ci" class="multi-cond-row">
                    <el-select v-model="cond.type" size="small" style="width: 100px">
                      <el-option label="指标阈值" value="threshold" />
                      <el-option label="标签匹配" value="label" />
                    </el-select>
                    <template v-if="cond.type === 'threshold'">
                      <el-input v-model="cond.metric" placeholder="指标名" size="small" style="width: 120px" />
                      <el-select v-model="cond.operator" size="small" style="width: 80px">
                        <el-option label=">" value="gt" />
                        <el-option label="<" value="lt" />
                        <el-option label=">=" value="gte" />
                        <el-option label="<=" value="lte" />
                        <el-option label="=" value="eq" />
                      </el-select>
                      <el-input-number v-model="cond.value" size="small" style="width: 100px" />
                    </template>
                    <template v-else-if="cond.type === 'label'">
                      <el-input v-model="cond.label" placeholder="标签名" size="small" style="width: 100px" />
                      <el-select v-model="cond.operator" size="small" style="width: 80px">
                        <el-option label="等于" value="eq" />
                        <el-option label="包含" value="contains" />
                      </el-select>
                      <el-input v-model="cond.labelValue" placeholder="标签值" size="small" style="width: 120px" />
                    </template>
                    <el-button
                      v-if="rule.conditions.conditions.length > 1"
                      type="danger"
                      link
                      :icon="Delete"
                      size="small"
                      @click="removeMultiCondition(rule, ci)"
                    />
                  </div>
                  <el-button
                    v-if="rule.conditions.conditions.length < 10"
                    type="primary"
                    plain
                    size="small"
                    :icon="Plus"
                    @click="addMultiCondition(rule)"
                    style="margin-top: 4px"
                  >
                    添加条件
                  </el-button>
                </div>
                <div v-else-if="rule.conditionType === 'label_match'" class="custom-rule-body">
                  <el-input v-model="rule.conditions.conditions[0].label" placeholder="标签名" size="small" style="width: 150px" />
                  <el-select v-model="rule.conditions.conditions[0].operator" size="small" style="width: 100px">
                    <el-option label="等于" value="eq" />
                    <el-option label="包含" value="contains" />
                  </el-select>
                  <el-input v-model="rule.conditions.conditions[0].labelValue" placeholder="标签值" size="small" style="width: 150px" />
                </div>
              </div>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="断点设置">
          <el-collapse v-model="replayBreakpointCollapse">
            <el-collapse-item title="配置断点条件（可选）" name="breakpoints">
              <div class="inline-breakpoint-tip">
                <el-alert type="info" :closable="false" show-icon size="small">
                  当事件 payload 中某个字段满足特定条件时自动暂停回放
                </el-alert>
              </div>
              <div class="inline-breakpoint-logic">
                <span style="font-size: 12px; color: #606266">逻辑:</span>
                <el-radio-group v-model="replayForm.breakpointLogicalOp" size="small">
                  <el-radio value="OR">任一满足</el-radio>
                  <el-radio value="AND">全部满足</el-radio>
                </el-radio-group>
              </div>
              <div
                v-for="(cond, idx) in replayForm.breakpoints"
                :key="idx"
                class="inline-breakpoint-row"
              >
                <el-input v-model="cond.field" placeholder="字段路径 (如 metricName)" size="small" style="width: 160px" />
                <el-select v-model="cond.operator" size="small" style="width: 90px">
                  <el-option label="等于" value="eq" />
                  <el-option label="大于" value="gt" />
                  <el-option label="小于" value="lt" />
                  <el-option label="包含" value="contains" />
                </el-select>
                <el-input v-model="cond.value" placeholder="值" size="small" style="width: 110px" />
                <el-button type="danger" link :icon="Delete" size="small" @click="removeReplayBreakpoint(idx)" />
              </div>
              <el-button type="primary" plain :icon="Plus" size="small" @click="addReplayBreakpoint" style="margin-top: 8px">
                添加条件
              </el-button>
            </el-collapse-item>
          </el-collapse>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showReplayDialogFlag = false">取消</el-button>
        <el-button type="primary" :loading="startingReplay" @click="handleStartReplay">启动回放</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showBreakpointDialogFlag" title="设置调试断点" width="560px">
      <div class="breakpoint-tip">
        <el-alert type="info" :closable="false" show-icon>
          当事件 payload 中某个字段满足特定条件时自动暂停回放
        </el-alert>
      </div>
      <el-form :model="breakpointForm" label-width="80px">
        <el-form-item label="逻辑">
          <el-radio-group v-model="breakpointForm.logicalOp">
            <el-radio value="OR">任一满足</el-radio>
            <el-radio value="AND">全部满足</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item
          v-for="(cond, idx) in breakpointForm.conditions"
          :key="idx"
          label="条件"
        >
          <div class="breakpoint-condition-row">
            <el-input v-model="cond.field" placeholder="字段路径 (如 metricName 或 labels.host)" style="width: 200px" />
            <el-select v-model="cond.operator" style="width: 110px">
              <el-option label="等于" value="eq" />
              <el-option label="不等于" value="ne" />
              <el-option label="大于" value="gt" />
              <el-option label="小于" value="lt" />
              <el-option label="大于等于" value="gte" />
              <el-option label="小于等于" value="lte" />
              <el-option label="包含" value="contains" />
            </el-select>
            <el-input v-model="cond.value" placeholder="值" style="width: 130px" />
            <el-button type="danger" link :icon="Delete" @click="removeBreakpoint(idx)" />
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" plain :icon="Plus" @click="addBreakpoint">
            添加条件
          </el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBreakpointDialogFlag = false">取消</el-button>
        <el-button type="primary" @click="handleSetBreakpoints">应用断点</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showBreakpointTriggered"
      title="断点触发"
      width="640px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 16px">
        回放已在以下事件处暂停，请检查规则匹配情况
      </el-alert>
      <div v-if="progress?.breakpointTriggeredEvent" class="breakpoint-event">
        <div class="breakpoint-event-title">触发断点的事件:</div>
        <pre class="event-json small">{{ formatJson(progress.breakpointTriggeredEvent.eventPayload) }}</pre>
      </div>
      <div v-if="progress?.breakpointRuleMatches?.length" class="rule-matches">
        <div class="rule-matches-title">规则匹配状态:</div>
        <el-table :data="progress.breakpointRuleMatches" size="small" border>
          <el-table-column prop="ruleName" label="规则名称" />
          <el-table-column label="是否命中" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.matched" type="success" size="small">命中</el-tag>
              <el-tag v-else type="info" size="small">未命中</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="reason" label="原因" show-overflow-tooltip />
        </el-table>
      </div>
      <template #footer>
        <el-button type="primary" @click="handleResume">继续回放</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Plus, VideoCamera, VideoPlay, VideoPause, Aim, Folder, Delete, Search,
  DataAnalysis, Right, Close, View, Files, CollectionTag, Download,
  Document, Refresh
} from '@element-plus/icons-vue';
import {
  replayApi,
  ReplaySession,
  ReplayProgress,
  ComparisonReport,
  BreakpointCondition,
  ReplayMode,
  CustomRuleSnapshot,
  ReplayBookmark,
  HotSwapDiffReport,
} from '@/services/apiEndpoints';
import DiffTable from './components/DiffTable.vue';
import HotSwapTable from './components/HotSwapTable.vue';

const sessions = ref<ReplaySession[]>([]);
const sessionsLoading = ref(false);
const sessionsTotal = ref(0);
const sessionPage = ref(1);
const sessionPageSize = ref(10);
const searchKeyword = ref('');
const selectedSession = ref<ReplaySession | null>(null);
const selectedSessionIds = ref<string[]>([]);

const showCreateDialog = ref(false);
const creating = ref(false);
const createForm = ref({ name: '', description: '' });

const showReplayDialogFlag = ref(false);
const replayTargetSession = ref<ReplaySession | null>(null);
const startingReplay = ref(false);
const replayBreakpointCollapse = ref<string[]>([]);
const replayForm = ref<{
  mode: ReplayMode;
  speedMultiplier?: number;
  breakpoints: BreakpointCondition[];
  breakpointLogicalOp: 'AND' | 'OR';
}>({
  mode: 'real_time',
  breakpoints: [],
  breakpointLogicalOp: 'OR',
});
const customSpeed = ref(2);

const ruleVersionMode = ref<'current' | 'custom'>('current');
const customRules = ref<CustomRuleSnapshot[]>([]);

const showBreakpointDialogFlag = ref(false);
const breakpointTargetSession = ref<ReplaySession | null>(null);
const breakpointForm = ref<{ conditions: BreakpointCondition[]; logicalOp: 'AND' | 'OR' }>({
  conditions: [],
  logicalOp: 'OR',
});

const currentReplaySessionId = ref<string | null>(null);
const replayMode = ref<ReplayMode>('real_time');
const progress = ref<ReplayProgress | null>(null);
const currentSpeed = ref(1);
const formattedSpeed = computed(() => currentSpeed.value.toFixed(1) + 'x');
const showBreakpointTriggered = ref(false);
const comparisonReport = ref<ComparisonReport | null>(null);
const hotSwapReport = ref<HotSwapDiffReport | null>(null);
const activeDiffTab = ref('missed');
const activeHotSwapTab = ref('missed');

const bookmarks = ref<ReplayBookmark[]>([]);
const renamingBookmarkId = ref<string | null>(null);
const renameInputValue = ref('');
const renameInputRef = ref<any>(null);

const sseSource = ref<EventSource | null>(null);
const pollTimer = ref<number | null>(null);

const speedMarks = {
  0.5: '0.5x',
  1: '1x',
  2: '2x',
  5: '5x',
  10: '10x',
  20: '20x',
};

const canStep = computed(() => {
  if (!progress.value) return false;
  if (progress.value.totalEvents === 0) return false;
  return progress.value.replayedCount < progress.value.totalEvents;
});

const canAddBookmark = computed(() => {
  if (!progress.value) return false;
  return progress.value.replayedCount > 0 && progress.value.replayedCount < progress.value.totalEvents;
});

function isSelectable(row: ReplaySession) {
  return row.status !== 'recording';
}

function formatTime(t?: string) {
  if (!t) return '-';
  return new Date(t).toLocaleString('zh-CN');
}

function formatPercent(v?: number) {
  if (v === undefined || v === null || isNaN(v)) return '0%';
  return (v * 100).toFixed(1) + '%';
}

function formatJson(obj: any) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

async function loadSessions() {
  sessionsLoading.value = true;
  try {
    const { data } = await replayApi.listSessions({
      page: sessionPage.value,
      pageSize: sessionPageSize.value,
      keyword: searchKeyword.value || undefined,
    });
    sessions.value = data.items;
    sessionsTotal.value = data.total;
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '加载录制会话失败');
  } finally {
    sessionsLoading.value = false;
  }
}

function handleSessionSelection(rows: ReplaySession[]) {
  selectedSession.value = rows[0] || null;
  selectedSessionIds.value = rows.map((r) => r.id);
  if (selectedSession.value && selectedSession.value.status === 'stopped') {
    loadComparisonReport(selectedSession.value.id);
  } else {
    comparisonReport.value = null;
    hotSwapReport.value = null;
  }
}

function handleSessionClick(row: ReplaySession) {
  selectedSession.value = row;
  selectedSessionIds.value = [row.id];
  if (row.status === 'stopped') {
    loadComparisonReport(row.id);
  } else {
    comparisonReport.value = null;
    hotSwapReport.value = null;
  }
}

async function handleCreateSession() {
  if (!createForm.value.name.trim()) {
    ElMessage.warning('请输入会话名称');
    return;
  }
  creating.value = true;
  try {
    await replayApi.startRecording({
      name: createForm.value.name.trim(),
      description: createForm.value.description,
    });
    ElMessage.success('已开始录制');
    showCreateDialog.value = false;
    createForm.value = { name: '', description: '' };
    loadSessions();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '创建录制会话失败');
  } finally {
    creating.value = false;
  }
}

async function handleStopRecording(row: ReplaySession) {
  try {
    await ElMessageBox.confirm(`确定要停止录制会话 "${row.name}" 吗?`, '确认', { type: 'warning' });
    await replayApi.stopRecording(row.id);
    ElMessage.success('已停止录制');
    loadSessions();
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err?.response?.data?.message || '停止录制失败');
    }
  }
}

async function handleArchive(row: ReplaySession) {
  try {
    await replayApi.archiveSession(row.id);
    ElMessage.success('已归档');
    loadSessions();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '归档失败');
  }
}

async function handleDeleteSession(row: ReplaySession) {
  try {
    await ElMessageBox.confirm(`确定要删除会话 "${row.name}" 吗? 此操作不可恢复`, '确认', { type: 'error' });
    await replayApi.deleteSession(row.id);
    ElMessage.success('已删除');
    if (currentReplaySessionId.value === row.id) {
      cleanupReplay();
    }
    if (selectedSession.value?.id === row.id) {
      selectedSession.value = null;
      comparisonReport.value = null;
      hotSwapReport.value = null;
    }
    loadSessions();
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err?.response?.data?.message || '删除失败');
    }
  }
}

function showReplayDialog(row: ReplaySession) {
  replayTargetSession.value = row;
  replayForm.value = {
    mode: 'real_time',
    breakpoints: [],
    breakpointLogicalOp: 'OR',
  };
  customSpeed.value = 2;
  replayBreakpointCollapse.value = [];
  ruleVersionMode.value = 'current';
  customRules.value = [];
  showReplayDialogFlag.value = true;
}

function addCustomRule() {
  customRules.value.push({
    name: `自定义规则${customRules.value.length + 1}`,
    conditionType: 'single_threshold',
    conditions: {
      operator: 'AND',
      conditions: [{ type: 'threshold', metric: '', operator: 'gt', value: 0 }],
    },
  });
}

function removeCustomRule(idx: number) {
  customRules.value.splice(idx, 1);
}

function onCustomRuleTypeChange(idx: number) {
  const rule = customRules.value[idx];
  if (rule.conditionType === 'single_threshold') {
    rule.conditions = {
      operator: 'AND',
      conditions: [{ type: 'threshold', metric: '', operator: 'gt', value: 0 }],
    };
  } else if (rule.conditionType === 'multi_condition') {
    rule.conditions = {
      operator: 'AND',
      conditions: [{ type: 'threshold', metric: '', operator: 'gt', value: 0 }],
    };
  } else if (rule.conditionType === 'label_match') {
    rule.conditions = {
      operator: 'AND',
      conditions: [{ type: 'label', label: '', operator: 'eq', labelValue: '' }],
    };
  }
}

function addMultiCondition(rule: CustomRuleSnapshot) {
  if (rule.conditions.conditions.length >= 10) return;
  rule.conditions.conditions.push({ type: 'threshold', metric: '', operator: 'gt', value: 0 });
}

function removeMultiCondition(rule: CustomRuleSnapshot, idx: number) {
  if (rule.conditions.conditions.length > 1) {
    rule.conditions.conditions.splice(idx, 1);
  }
}

async function loadCurrentRulesAsCustom() {
  try {
    const { data: rules } = await import('@/services/apiEndpoints').then((m) => m.rulesApi.getRules());
    customRules.value = rules
      .filter((r: any) => r.isEnabled)
      .map((r: any) => ({
        id: r.id,
        name: r.name,
        conditionType: r.conditionType,
        conditions: r.conditions,
        priority: r.priority,
        severity: r.severity,
      }));
    ElMessage.success(`已载入 ${customRules.value.length} 条当前规则`);
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '载入规则失败');
  }
}

function addReplayBreakpoint() {
  replayForm.value.breakpoints.push({ field: '', operator: 'eq', value: '' });
}

function removeReplayBreakpoint(idx: number) {
  replayForm.value.breakpoints.splice(idx, 1);
}

async function handleStartReplay() {
  if (!replayTargetSession.value) return;
  startingReplay.value = true;
  try {
    const validBreakpoints = replayForm.value.breakpoints.filter((c) => c.field && c.value !== '');
    const customRulesToSend = ruleVersionMode.value === 'custom' ? customRules.value : undefined;

    const { data } = await replayApi.startReplay(replayTargetSession.value.id, {
      mode: replayForm.value.mode,
      speedMultiplier: replayForm.value.speedMultiplier,
      breakpoints: validBreakpoints.length > 0 ? validBreakpoints : undefined,
      breakpointLogicalOp: validBreakpoints.length > 0 ? replayForm.value.breakpointLogicalOp : undefined,
      customRules: customRulesToSend,
    });
    currentReplaySessionId.value = replayTargetSession.value.id;
    replayMode.value = replayForm.value.mode;
    progress.value = data;
    currentSpeed.value = data.speedMultiplier || 1;
    selectedSession.value = replayTargetSession.value;
    showReplayDialogFlag.value = false;
    comparisonReport.value = null;
    hotSwapReport.value = null;
    loadBookmarks();
    startProgressStream(replayTargetSession.value.id);
    ElMessage.success('回放已启动');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '启动回放失败');
  } finally {
    startingReplay.value = false;
  }
}

function showBreakpointDialogForCurrentSession() {
  if (selectedSession.value) {
    showBreakpointDialog(selectedSession.value);
  }
}

function showBreakpointDialog(row: ReplaySession) {
  breakpointTargetSession.value = row;
  breakpointForm.value = {
    conditions: [{ field: '', operator: 'eq', value: '' }],
    logicalOp: 'OR',
  };
  showBreakpointDialogFlag.value = true;
}

function addBreakpoint() {
  breakpointForm.value.conditions.push({ field: '', operator: 'eq', value: '' });
}

function removeBreakpoint(idx: number) {
  breakpointForm.value.conditions.splice(idx, 1);
}

async function handleSetBreakpoints() {
  if (!breakpointTargetSession.value) return;
  const validConditions = breakpointForm.value.conditions.filter((c) => c.field && c.value !== '');
  try {
    await replayApi.setBreakpoints(breakpointTargetSession.value.id, {
      conditions: validConditions,
      logicalOp: breakpointForm.value.logicalOp,
    });
    ElMessage.success('断点已应用');
    showBreakpointDialogFlag.value = false;
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '设置断点失败');
  }
}

function startProgressStream(sessionId: string) {
  cleanupStream();
  try {
    sseSource.value = new EventSource(`/api/v1/replay/sessions/${sessionId}/replay/stream`);
    sseSource.value.onmessage = (e) => {
      try {
        const parsed = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (parsed.type === 'progress') {
          progress.value = parsed.data;
        } else if (parsed.type === 'paused') {
          progress.value = parsed.data;
          if (parsed.data.pauseReason === 'breakpoint') {
            showBreakpointTriggered.value = true;
          }
        } else if (parsed.type === 'finished') {
          handleReplayFinished();
        }
      } catch {}
    };
    sseSource.value.onerror = () => {
      startPolling(sessionId);
    };
  } catch {
    startPolling(sessionId);
  }
}

function startPolling(sessionId: string) {
  if (pollTimer.value) clearInterval(pollTimer.value);
  pollTimer.value = window.setInterval(async () => {
    try {
      const { data } = await replayApi.getProgress(sessionId);
      progress.value = data;
      if (data.replayedCount >= data.totalEvents && data.totalEvents > 0) {
        handleReplayFinished();
      }
    } catch {}
  }, 1000);
}

function cleanupStream() {
  if (sseSource.value) {
    sseSource.value.close();
    sseSource.value = null;
  }
  if (pollTimer.value) {
    clearInterval(pollTimer.value);
    pollTimer.value = null;
  }
}

function cleanupReplay() {
  cleanupStream();
  currentReplaySessionId.value = null;
  progress.value = null;
  showBreakpointTriggered.value = false;
  bookmarks.value = [];
}

async function handleSingleStep() {
  if (!currentReplaySessionId.value) return;
  try {
    const { data } = await replayApi.singleStepNext(currentReplaySessionId.value);
    progress.value = data;
    if (data.replayedCount >= data.totalEvents) {
      handleReplayFinished();
    }
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '步进失败');
  }
}

async function handlePause() {
  if (!currentReplaySessionId.value) return;
  try {
    const { data } = await replayApi.pauseReplay(currentReplaySessionId.value);
    progress.value = data;
    ElMessage.success('已暂停');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '暂停失败');
  }
}

async function handleResume() {
  if (!currentReplaySessionId.value) return;
  showBreakpointTriggered.value = false;
  try {
    const { data } = await replayApi.resumeReplay(currentReplaySessionId.value);
    progress.value = data;
    ElMessage.success('已继续');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '继续失败');
  }
}

async function handleSpeedChange(val: number) {
  if (!currentReplaySessionId.value) return;
  try {
    const { data } = await replayApi.setReplaySpeed(currentReplaySessionId.value, val);
    progress.value = data;
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '调节速度失败');
  }
}

async function handleStopReplay() {
  if (!currentReplaySessionId.value) return;
  try {
    await ElMessageBox.confirm('确定要停止回放吗?', '确认', { type: 'warning' });
    await replayApi.stopReplay(currentReplaySessionId.value);
    cleanupReplay();
    ElMessage.success('已停止回放');
    if (selectedSession.value) {
      loadComparisonReport(selectedSession.value.id);
    }
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err?.response?.data?.message || '停止回放失败');
    }
  }
}

async function handleReplayFinished() {
  cleanupStream();
  ElMessage.success('回放完成!');
  if (currentReplaySessionId.value) {
    loadComparisonReport(currentReplaySessionId.value);
    if (ruleVersionMode.value === 'custom') {
      loadHotSwapReport(currentReplaySessionId.value);
    }
  }
}

async function loadComparisonReport(sessionId: string) {
  try {
    const { data } = await replayApi.getComparisonReport(sessionId);
    if (data.totalEvents > 0) {
      comparisonReport.value = data;
    } else {
      comparisonReport.value = null;
    }
  } catch (err: any) {
    console.warn('加载对比报告失败:', err?.response?.data?.message);
  }
}

async function loadHotSwapReport(sessionId: string) {
  try {
    const { data } = await replayApi.getHotSwapComparison(sessionId);
    hotSwapReport.value = data;
  } catch (err: any) {
    console.warn('加载热替换对比失败:', err?.response?.data?.message);
  }
}

async function loadBookmarks() {
  if (!currentReplaySessionId.value) return;
  try {
    const { data } = await replayApi.listBookmarks(currentReplaySessionId.value);
    bookmarks.value = data;
  } catch (err: any) {
    console.warn('加载书签失败:', err?.response?.data?.message);
  }
}

async function handleAddBookmark() {
  if (!currentReplaySessionId.value || !progress.value) return;
  const eventIndex = progress.value.replayedCount - 1;
  if (eventIndex < 0) return;

  const eventName = progress.value.currentEvent?.eventPayload?.metricName || progress.value.currentEvent?.eventSource || '事件';
  const bookmarkNum = bookmarks.value.length + 1;
  const name = `书签#${bookmarkNum}-${eventName}`;

  try {
    const { data } = await replayApi.createBookmark(currentReplaySessionId.value, {
      name,
      eventIndex,
      progressSnapshot: {
        replayedCount: progress.value.replayedCount,
        matchedCount: progress.value.matchedCount,
        hitRate: progress.value.hitRate,
        totalEvents: progress.value.totalEvents,
      },
    });
    bookmarks.value.push(data);
    ElMessage.success('书签已添加');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '添加书签失败');
  }
}

function startRenameBookmark(bookmark: ReplayBookmark) {
  renamingBookmarkId.value = bookmark.id;
  renameInputValue.value = bookmark.name;
  nextTick(() => {
    renameInputRef.value?.focus?.();
  });
}

async function confirmRenameBookmark() {
  if (!renamingBookmarkId.value || !currentReplaySessionId.value) {
    renamingBookmarkId.value = null;
    return;
  }
  const newName = renameInputValue.value.trim();
  if (!newName) {
    renamingBookmarkId.value = null;
    return;
  }
  try {
    const { data } = await replayApi.updateBookmark(currentReplaySessionId.value, renamingBookmarkId.value, {
      name: newName,
    });
    const idx = bookmarks.value.findIndex((b) => b.id === renamingBookmarkId.value);
    if (idx !== -1) {
      bookmarks.value[idx] = data;
    }
    ElMessage.success('书签已重命名');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '重命名失败');
  } finally {
    renamingBookmarkId.value = null;
  }
}

async function handleDeleteBookmark(bookmark: ReplayBookmark) {
  if (!currentReplaySessionId.value) return;
  try {
    await ElMessageBox.confirm(`确定要删除书签 "${bookmark.name}" 吗?`, '确认', { type: 'warning' });
    await replayApi.deleteBookmark(currentReplaySessionId.value, bookmark.id);
    bookmarks.value = bookmarks.value.filter((b) => b.id !== bookmark.id);
    ElMessage.success('书签已删除');
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err?.response?.data?.message || '删除失败');
    }
  }
}

async function handleJumpToBookmark(bookmark: ReplayBookmark) {
  if (!currentReplaySessionId.value) return;
  try {
    await ElMessageBox.confirm(
      `跳转到书签 "${bookmark.name}" 将重新开始回放到此位置，是否继续?`,
      '确认跳转',
      { type: 'warning' },
    );
    await cleanupStream();
    const validBreakpoints = replayForm.value.breakpoints.filter((c) => c.field && c.value !== '');
    const customRulesToSend = ruleVersionMode.value === 'custom' ? customRules.value : undefined;

    const { data } = await replayApi.startReplay(currentReplaySessionId.value, {
      mode: replayMode.value,
      speedMultiplier: currentSpeed.value,
      breakpoints: validBreakpoints.length > 0 ? validBreakpoints : undefined,
      breakpointLogicalOp: validBreakpoints.length > 0 ? replayForm.value.breakpointLogicalOp : undefined,
      customRules: customRulesToSend,
      startEventIndex: bookmark.eventIndex,
    });
    progress.value = data;
    startProgressStream(currentReplaySessionId.value);
    ElMessage.success('已跳转到书签位置');
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err?.response?.data?.message || '跳转失败');
    }
  }
}

async function handleExportJson() {
  if (!selectedSession.value) return;
  try {
    const { data } = await replayApi.exportReportJson(selectedSession.value.id);
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comparison-report-${selectedSession.value.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ElMessage.success('JSON导出成功');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '导出失败');
  }
}

async function handleExportCsv() {
  if (!selectedSession.value) return;
  try {
    const { data } = await replayApi.exportReportCsv(selectedSession.value.id);
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comparison-report-${selectedSession.value.id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ElMessage.success('CSV导出成功');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '导出失败');
  }
}

watch(
  () => progress.value?.pauseReason,
  (val) => {
    if (val === 'breakpoint') {
      showBreakpointTriggered.value = true;
    }
  },
);

onMounted(() => {
  loadSessions();
});

onBeforeUnmount(() => {
  cleanupReplay();
});
</script>

<style scoped>
.debug-workbench {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.current-session-label {
  font-size: 13px;
  font-weight: 400;
  color: #909399;
  margin-left: 12px;
}

.session-name {
  display: inline-flex;
  align-items: center;
}

.recording-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #fff;
  border-radius: 50%;
  margin-right: 4px;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.time-range {
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
}

.pagination {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.progress-area {
  display: flex;
  gap: 16px;
}

.progress-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.progress-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.stat-card :deep(.el-card__body) {
  padding: 16px;
  text-align: center;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-bottom: 6px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
}

.stat-value.primary { color: #409eff; }
.stat-value.success { color: #67c23a; }
.stat-value.warning { color: #e6a23c; }

.progress-with-slider {
  display: flex;
  align-items: center;
  gap: 16px;
}

.progress-bar-wrapper {
  flex: 1;
}

.progress-bar {
  padding: 0 4px;
}

.speed-slider {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 240px;
}

.speed-label {
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
}

.speed-value {
  font-size: 13px;
  font-weight: 600;
  color: #409eff;
  min-width: 45px;
}

.bookmarks-panel {
  width: 260px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  max-height: 400px;
  overflow: hidden;
}

.bookmarks-header {
  padding: 10px 12px;
  background: #f5f7fa;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid #ebeef5;
}

.bookmarks-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.bookmarks-list {
  flex: 1;
  overflow-y: auto;
}

.bookmark-item {
  padding: 10px 12px;
  border-bottom: 1px solid #f0f2f5;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  transition: background 0.2s;
}

.bookmark-item:hover {
  background: #f5f7fa;
}

.bookmark-info {
  flex: 1;
  min-width: 0;
}

.bookmark-name {
  font-size: 13px;
  color: #303133;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-progress {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.bookmark-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.current-event-section {
  margin-top: 4px;
}

.current-event-preview {
  margin-top: 4px;
}

.event-preview-content {
  max-height: 240px;
  overflow: auto;
}

.event-json {
  background: #f5f7fa;
  border-radius: 4px;
  padding: 12px;
  margin: 0;
  font-family: 'SF Mono', Consolas, Monaco, monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.event-json.small {
  font-size: 11px;
  max-height: 180px;
  overflow: auto;
}

.match-results {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}

.match-title {
  font-size: 13px;
  color: #606266;
  margin-bottom: 8px;
}

.match-title.custom {
  color: #e6a23c;
}

.report-stats {
  display: flex;
  align-items: center;
}

.breakpoint-tip {
  margin-bottom: 12px;
}

.breakpoint-condition-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.breakpoint-event-title,
.rule-matches-title {
  font-size: 13px;
  color: #606266;
  margin-bottom: 8px;
  font-weight: 500;
}

.rule-matches {
  margin-top: 16px;
}

.empty-state {
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state :deep(.el-empty) {
  padding: 20px 0;
}

.inline-breakpoint-tip {
  margin-bottom: 12px;
}

.inline-breakpoint-logic {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.inline-breakpoint-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.custom-rules-panel {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  background: #fafafa;
}

.custom-rules-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.custom-rules-empty {
  padding: 20px;
  text-align: center;
}

.custom-rules-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 360px;
  overflow-y: auto;
}

.custom-rule-item {
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 10px;
  background: #fff;
}

.custom-rule-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.custom-rule-body {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.multi-cond-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  width: 100%;
}

.hot-swap-stats {
  margin-bottom: 12px;
  padding: 10px;
  background: #fdf6ec;
  border-radius: 4px;
  border: 1px solid #faecd8;
}

.hot-swap-tabs {
  margin-top: 8px;
}
</style>
