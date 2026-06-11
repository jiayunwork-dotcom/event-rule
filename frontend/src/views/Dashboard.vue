<template>
  <div class="dashboard">
    <el-row :gutter="20" class="mb-20">
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
            <el-icon size="24"><Bell /></el-icon>
          </div>
          <div class="stat-content">
            <p class="stat-label">活跃告警</p>
            <p class="stat-value">{{ stats?.activeAlerts.total || 0 }}</p>
          </div>
        </div>
      </el-col>
      
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
            <el-icon size="24"><Timer /></el-icon>
          </div>
          <div class="stat-content">
            <p class="stat-label">MTTA (分钟)</p>
            <p class="stat-value">{{ stats?.metrics.mtta || 0 }}</p>
          </div>
        </div>
      </el-col>
      
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
            <el-icon size="24"><Check /></el-icon>
          </div>
          <div class="stat-content">
            <p class="stat-label">MTTR (分钟)</p>
            <p class="stat-value">{{ stats?.metrics.mttr || 0 }}</p>
          </div>
        </div>
      </el-col>
      
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
            <el-icon size="24"><Message /></el-icon>
          </div>
          <div class="stat-content">
            <p class="stat-label">通知成功率</p>
            <p class="stat-value">{{ stats?.notifications.successRate || 0 }}%</p>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mb-20">
      <el-col :span="12">
        <div class="card">
          <h3 class="card-title">告警严重程度分布</h3>
          <div ref="severityChartRef" class="chart-container"></div>
        </div>
      </el-col>
      
      <el-col :span="12">
        <div class="card">
          <h3 class="card-title">通知渠道分布</h3>
          <div ref="channelChartRef" class="chart-container"></div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mb-20">
      <el-col :span="24">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">规则命中趋势</h3>
            <el-select v-model="trendInterval" size="small" style="width: 120px">
              <el-option label="按小时" value="hour" />
              <el-option label="按天" value="day" />
            </el-select>
          </div>
          <div ref="ruleHitsChartRef" class="chart-container" style="height: 400px;"></div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <div class="card">
          <h3 class="card-title">活跃告警</h3>
          <el-table :data="activeAlerts" size="small" max-height="400">
            <el-table-column prop="severity" label="级别" width="80">
              <template #default="{ row }">
                <el-tag :type="getSeverityType(row.severity)" size="small">
                  {{ row.severity.toUpperCase() }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="名称" show-overflow-tooltip />
            <el-table-column prop="count" label="次数" width="70" />
            <el-table-column prop="lastTriggeredAt" label="最近触发" width="170">
              <template #default="{ row }">
                {{ formatTime(row.lastTriggeredAt) }}
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
      
      <el-col :span="12">
        <div class="card">
          <h3 class="card-title">告警时间线</h3>
          <el-table :data="alertTimeline" size="small" max-height="400">
            <el-table-column prop="severity" label="级别" width="80">
              <template #default="{ row }">
                <el-tag :type="getSeverityType(row.severity)" size="small">
                  {{ row.severity.toUpperCase() }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="名称" show-overflow-tooltip />
            <el-table-column prop="count" label="次数" width="70" />
            <el-table-column prop="timestamp" label="时间" width="170">
              <template #default="{ row }">
                {{ formatTime(row.timestamp) }}
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as echarts from 'echarts';
import dayjs from 'dayjs';
import { dashboardApi, alertsApi, Alert } from '@/services/apiEndpoints';
import { Bell, Timer, Check, Message } from '@element-plus/icons-vue';

const stats = ref<any>(null);
const activeAlerts = ref<Alert[]>([]);
const alertTimeline = ref<any[]>([]);
const ruleHits = ref<any[]>([]);
const trendInterval = ref<'hour' | 'day'>('hour');

const severityChartRef = ref<HTMLElement>();
const channelChartRef = ref<HTMLElement>();
const ruleHitsChartRef = ref<HTMLElement>();

let severityChart: echarts.ECharts | null = null;
let channelChart: echarts.ECharts | null = null;
let ruleHitsChart: echarts.ECharts | null = null;

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

async function loadData() {
  try {
    const [statsRes, alertsRes, timelineRes, ruleHitsRes] = await Promise.all([
      dashboardApi.getStats(),
      alertsApi.getAlerts({ status: ['pending', 'acknowledged', 'processing'] }),
      dashboardApi.getAlertTimeline({ limit: 50 }),
      dashboardApi.getRuleHits({ interval: trendInterval.value }),
    ]);
    
    stats.value = statsRes.data;
    activeAlerts.value = alertsRes.data.slice(0, 10);
    alertTimeline.value = timelineRes.data;
    ruleHits.value = ruleHitsRes.data;
    
    renderCharts();
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
  }
}

function renderCharts() {
  if (severityChartRef.value && stats.value) {
    severityChart = echarts.init(severityChartRef.value);
    const severityData = Object.entries(stats.value.activeAlerts.bySeverity).map(([name, value]) => ({
      name: name.toUpperCase(),
      value,
    }));
    
    severityChart.setOption({
      tooltip: { trigger: 'item' },
      legend: { orient: 'vertical', left: 'left' },
      color: ['#ff0000', '#ff6600', '#e6a23c', '#909399'],
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 16, fontWeight: 'bold' }
        },
        data: severityData,
      }]
    });
  }

  if (channelChartRef.value && stats.value) {
    channelChart = echarts.init(channelChartRef.value);
    const channelData = Object.entries(stats.value.notifications.byChannel).map(([name, value]) => ({
      name: name.toUpperCase(),
      value,
    }));
    
    channelChart.setOption({
      tooltip: { trigger: 'item' },
      legend: { orient: 'vertical', left: 'left' },
      color: ['#409eff', '#67c23a', '#e6a23c', '#f56c6c'],
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 16, fontWeight: 'bold' }
        },
        data: channelData,
      }]
    });
  }

  if (ruleHitsChartRef.value && ruleHits.value.length > 0) {
    ruleHitsChart = echarts.init(ruleHitsChartRef.value);
    
    const timestamps = ruleHits.value[0]?.trend.map((t: any) => 
      trendInterval.value === 'hour' 
        ? dayjs(t.timestamp).format('MM-DD HH:mm')
        : dayjs(t.timestamp).format('MM-DD')
    ) || [];
    
    const series = ruleHits.value.slice(0, 5).map(rule => ({
      name: rule.ruleName,
      type: 'line',
      smooth: true,
      data: rule.trend.map((t: any) => t.count),
    }));
    
    ruleHitsChart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: series.map(s => s.name) },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: timestamps,
      },
      yAxis: { type: 'value' },
      series,
    });
  }
}

watch(trendInterval, () => {
  loadData();
});

onMounted(() => {
  loadData();
  
  const interval = setInterval(loadData, 30000);
  
  window.addEventListener('resize', () => {
    severityChart?.resize();
    channelChart?.resize();
    ruleHitsChart?.resize();
  });
  
  onUnmounted(() => {
    clearInterval(interval);
    severityChart?.dispose();
    channelChart?.dispose();
    ruleHitsChart?.dispose();
  });
});
</script>

<style scoped>
.dashboard {
  padding: 0;
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 20px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  margin-right: 20px;
}

.stat-content {
  flex: 1;
}

.stat-label {
  color: #909399;
  font-size: 14px;
  margin: 0 0 8px 0;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
  margin: 0;
}

.card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.card-title {
  margin: 0 0 20px 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.card-header .card-title {
  margin: 0;
}

.chart-container {
  height: 300px;
  width: 100%;
}

.mb-20 {
  margin-bottom: 20px;
}
</style>
