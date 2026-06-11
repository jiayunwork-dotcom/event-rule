import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '监控面板', icon: 'DataAnalysis' },
      },
      {
        path: 'alerts',
        name: 'Alerts',
        component: () => import('@/views/Alerts.vue'),
        meta: { title: '告警列表', icon: 'Bell' },
      },
      {
        path: 'rules',
        name: 'Rules',
        component: () => import('@/views/Rules.vue'),
        meta: { title: '规则管理', icon: 'Setting' },
      },
      {
        path: 'rules/new',
        name: 'RuleEditor',
        component: () => import('@/views/RuleEditor.vue'),
        meta: { title: '创建规则', icon: 'Edit' },
      },
      {
        path: 'rules/:id/edit',
        name: 'RuleEditorEdit',
        component: () => import('@/views/RuleEditor.vue'),
        meta: { title: '编辑规则', icon: 'Edit' },
      },
      {
        path: 'sources',
        name: 'EventSources',
        component: () => import('@/views/EventSources.vue'),
        meta: { title: '事件源', icon: 'Connection' },
      },
      {
        path: 'silences',
        name: 'Silences',
        component: () => import('@/views/Silences.vue'),
        meta: { title: '静默规则', icon: 'Clock' },
      },
      {
        path: 'inhibits',
        name: 'Inhibits',
        component: () => import('@/views/Inhibits.vue'),
        meta: { title: '抑制规则', icon: 'Warning' },
      },
      {
        path: 'channels',
        name: 'Channels',
        component: () => import('@/views/Channels.vue'),
        meta: { title: '通知渠道', icon: 'Message' },
      },
      {
        path: 'policies',
        name: 'Policies',
        component: () => import('@/views/Policies.vue'),
        meta: { title: '通知策略', icon: 'Tickets' },
      },
      {
        path: 'schedules',
        name: 'Schedules',
        component: () => import('@/views/Schedules.vue'),
        meta: { title: '值班排班', icon: 'Calendar' },
      },
      {
        path: 'notifications',
        name: 'Notifications',
        component: () => import('@/views/Notifications.vue'),
        meta: { title: '通知记录', icon: 'Document' },
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/Settings.vue'),
        meta: { title: '系统设置', icon: 'Tools' },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

const getToken = (): string | null => {
  return localStorage.getItem('token');
};

router.beforeEach((to, from, next) => {
  const token = getToken();
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth !== false);

  if (requiresAuth && !token) {
    next({ path: '/login', query: { redirect: to.fullPath } });
  } else if (to.path === '/login' && token) {
    next('/dashboard');
  } else {
    next();
  }
});

export default router;
