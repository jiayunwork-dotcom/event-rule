<template>
  <el-container class="main-container">
    <el-aside width="220px" class="sidebar">
      <div class="logo">
        <el-icon size="32" color="#409eff">
          <Promotion />
        </el-icon>
        <span class="logo-text">Event Rule Engine</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
      >
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-icon>
            <component :is="item.icon" />
          </el-icon>
          <span>{{ item.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="header-left">
          <h2>{{ pageTitle }}</h2>
        </div>
        <div class="header-right">
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              <el-icon><User /></el-icon>
              {{ authStore.user?.username }}
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">个人信息</el-dropdown-item>
                <el-dropdown-item command="settings">系统设置</el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { 
  DataAnalysis, Bell, Setting, Edit, Connection, 
  Clock, Warning, Message, Tickets, Calendar, Document, 
  Tools, User, ArrowDown, Promotion, Collection
} from '@element-plus/icons-vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const activeMenu = computed(() => route.path);

const pageTitle = computed(() => {
  return route.meta.title as string || 'Event Rule Engine';
});

const menuItems = [
  { path: '/dashboard', title: '监控面板', icon: DataAnalysis },
  { path: '/alerts', title: '告警列表', icon: Bell },
  { path: '/rules', title: '规则管理', icon: Setting },
  { path: '/templates', title: '规则模板', icon: Collection },
  { path: '/sources', title: '事件源', icon: Connection },
  { path: '/silences', title: '静默规则', icon: Clock },
  { path: '/inhibits', title: '抑制规则', icon: Warning },
  { path: '/channels', title: '通知渠道', icon: Message },
  { path: '/policies', title: '通知策略', icon: Tickets },
  { path: '/schedules', title: '值班排班', icon: Calendar },
  { path: '/notifications', title: '通知记录', icon: Document },
  { path: '/settings', title: '系统设置', icon: Tools },
];

function handleCommand(command: string) {
  switch (command) {
    case 'logout':
      authStore.logout();
      router.push('/login');
      break;
    case 'settings':
      router.push('/settings');
      break;
  }
}
</script>

<style scoped>
.main-container {
  height: 100vh;
}

.sidebar {
  background-color: #304156;
  overflow: hidden;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #fff;
  background-color: #2b2f3a;
}

.logo-text {
  font-size: 16px;
  font-weight: bold;
}

.header {
  background-color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
}

.header-left h2 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #606266;
}

.main-content {
  background-color: #f0f2f5;
  padding: 20px;
  overflow-y: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

:deep(.el-menu) {
  border-right: none;
}
</style>
