<template>
  <div class="settings-page">
    <el-row :gutter="20">
      <el-col :span="12">
        <div class="card mb-20">
          <h3>租户信息</h3>
          <el-descriptions :column="1" border v-if="tenantInfo">
            <el-descriptions-item label="租户名称">
              {{ tenantInfo.name }}
            </el-descriptions-item>
            <el-descriptions-item label="时区">
              {{ tenantInfo.timezone }}
            </el-descriptions-item>
            <el-descriptions-item label="最大规则数">
              {{ tenantInfo.maxRules }}
            </el-descriptions-item>
            <el-descriptions-item label="最大事件吞吐/秒">
              {{ tenantInfo.maxEventsPerSecond }}
            </el-descriptions-item>
            <el-descriptions-item label="最大活跃告警数">
              {{ tenantInfo.maxActiveAlerts }}
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">
              {{ formatTime(tenantInfo.createdAt) }}
            </el-descriptions-item>
          </el-descriptions>
          
          <div class="mt-20">
            <el-button type="warning" @click="regenerateApiKey">
              重新生成 API Key
            </el-button>
          </div>
        </div>

        <div class="card">
          <h3>系统信息</h3>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="系统版本">
              v1.0.0
            </el-descriptions-item>
            <el-descriptions-item label="后端框架">
              NestJS 10
            </el-descriptions-item>
            <el-descriptions-item label="前端框架">
              Vue 3
            </el-descriptions-item>
            <el-descriptions-item label="数据库">
              PostgreSQL 16
            </el-descriptions-item>
            <el-descriptions-item label="缓存">
              Redis 7
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </el-col>

      <el-col :span="12">
        <div class="card mb-20">
          <h3>系统配置</h3>
          <el-form label-width="150px">
            <el-form-item label="时区">
              <el-select v-model="settings.timezone" style="width: 200px">
                <el-option label="UTC+8 (北京)" value="Asia/Shanghai" />
                <el-option label="UTC+0 (格林威治)" value="UTC" />
                <el-option label="UTC-5 (纽约)" value="America/New_York" />
                <el-option label="UTC-8 (洛杉矶)" value="America/Los_Angeles" />
              </el-select>
            </el-form-item>
            <el-form-item label="聚合窗口(秒)">
              <el-input-number v-model="settings.aggregationWindow" :min="60" :max="3600" />
            </el-form-item>
            <el-form-item label="自动确认超时(分钟)">
              <el-input-number v-model="settings.ackTimeout" :min="5" :max="1440" />
            </el-form-item>
            <el-form-item label="自动处理超时(小时)">
              <el-input-number v-model="settings.processTimeout" :min="1" :max="72" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary">保存设置</el-button>
            </el-form-item>
          </el-form>
        </div>

        <div class="card">
          <h3>API 文档</h3>
          <p>Swagger API 文档地址:</p>
          <el-link type="primary" :href="swaggerUrl" target="_blank">
            {{ swaggerUrl }}
          </el-link>
          
          <div class="mt-20">
            <h4>快速开始</h4>
            <ol class="mt-10">
              <li class="mb-5">创建通知渠道（邮件/Slack/企业微信/Webhook）</li>
              <li class="mb-5">配置通知策略，关联渠道和严重程度</li>
              <li class="mb-5">配置事件源（Webhook/Agent/Prometheus）</li>
              <li class="mb-5">创建告警规则</li>
              <li class="mb-5">开始接收告警通知</li>
            </ol>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import dayjs from 'dayjs';
import { tenantsApi } from '@/services/apiEndpoints';

const tenantInfo = ref<any>(null);
const swaggerUrl = ref(`${window.location.origin}/api/docs`);

const settings = reactive({
  timezone: 'Asia/Shanghai',
  aggregationWindow: 300,
  ackTimeout: 30,
  processTimeout: 2,
});

function formatTime(time: string) {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss');
}

async function loadTenantInfo() {
  try {
    const response = await tenantsApi.getCurrentTenant();
    tenantInfo.value = response.data;
  } catch (error) {
    console.error('Failed to load tenant info:', error);
  }
}

async function regenerateApiKey() {
  try {
    await ElMessageBox.confirm(
      '确定要重新生成 API Key 吗？重新生成后旧的 API Key 将失效！',
      '警告',
      { type: 'warning' }
    );
    
    await tenantsApi.regenerateApiKey(tenantInfo.value.id);
    ElMessage.success('API Key 已重新生成');
    loadTenantInfo();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to regenerate API key:', error);
    }
  }
}

onMounted(() => {
  loadTenantInfo();
});
</script>

<style scoped>
.settings-page {
  padding: 0;
}

.card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.mb-20 {
  margin-bottom: 20px;
}

.mt-10 {
  margin-top: 10px;
}

.mt-20 {
  margin-top: 20px;
}

.mb-5 {
  margin-bottom: 5px;
}

h3 {
  margin: 0 0 20px 0;
  font-size: 16px;
  font-weight: 600;
  border-left: 4px solid #409eff;
  padding-left: 10px;
}

h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

ol {
  padding-left: 20px;
}
</style>
