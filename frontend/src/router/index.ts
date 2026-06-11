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
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '监控面板', icon: 'DataAnalysis', requiresAuth: true },
      },
      {
        path: 'alerts',
        name: 'Alerts',
        component: () => import('@/views/Alerts.vue'),
        meta: { title: '告警列表', icon: 'Bell', requiresAuth: true },
      },
      {
        path: 'rules',
        name: 'Rules',
        component: () => import('@/views/Rules.vue'),
        meta: { title: '规则管理', icon: 'Setting', requiresAuth: true },
      },
      {
        path: 'rules/new',
        name: 'RuleEditor',
        component: () => import('@/views/RuleEditor.vue'),
        meta: { title: '创建规则', icon: 'Edit', requiresAuth: true },
      },
      {
        path: 'rules/:id/edit',
        name: 'RuleEditorEdit',
        component: () => import('@/views/RuleEditor.vue'),
        meta: { title: '编辑规则', icon: 'Edit', requiresAuth: true },
      },
      {
        path: 'templates',
        name: 'RuleTemplates',
        component: () => import('@/views/RuleTemplates.vue'),
        meta: { title: '规则模板', icon: 'Collection', requiresAuth: true },
      },
      {
        path: 'sources',
        name: 'EventSources',
        component: () => import('@/views/EventSources.vue'),
        meta: { title: '事件源', icon: 'Connection', requiresAuth: true },
      },
      {
        path: 'silences',
        name: 'Silences',
        component: () => import('@/views/Silences.vue'),
        meta: { title: '静默规则', icon: 'Clock', requiresAuth: true },
      },
      {
        path: 'inhibits',
        name: 'Inhibits',
        component: () => import('@/views/Inhibits.vue'),
        meta: { title: '抑制规则', icon: 'Warning', requiresAuth: true },
      },
      {
        path: 'channels',
        name: 'Channels',
        component: () => import('@/views/Channels.vue'),
        meta: { title: '通知渠道', icon: 'Message', requiresAuth: true },
      },
      {
        path: 'policies',
        name: 'Policies',
        component: () => import('@/views/Policies.vue'),
        meta: { title: '通知策略', icon: 'Tickets', requiresAuth: true },
      },
      {
        path: 'schedules',
        name: 'Schedules',
        component: () => import('@/views/Schedules.vue'),
        meta: { title: '值班排班', icon: 'Calendar', requiresAuth: true },
      },
      {
        path: 'notifications',
        name: 'Notifications',
        component: () => import('@/views/Notifications.vue'),
        meta: { title: '通知记录', icon: 'Document', requiresAuth: true },
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/Settings.vue'),
        meta: { title: '系统设置', icon: 'Tools', requiresAuth: true },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token');
  const needsAuth = to.matched.some(
    (record) => record.meta.requiresAuth === true,
  );

  if (needsAuth && !token) {
    next({ path: '/login', query: { redirect: to.fullPath } });
  } else if (to.path === '/login' && token) {
    next('/dashboard');
  } else {
    next();
  }
});

export default router;
