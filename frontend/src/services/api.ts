import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';
import router from '@/router';

const api: AxiosInstance = axios.create({
  baseURL: '/',
  timeout: 30000,
});

const isLoginPage = (): boolean => {
  return router.currentRoute.value.path === '/login';
};

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const status = error.response.status;
      
      if (status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        delete api.defaults.headers.common['Authorization'];
        
        if (!isLoginPage()) {
          ElMessage.error('登录已过期，请重新登录');
          router.replace('/login');
        }
      } else if (status === 403) {
        ElMessage.error('没有权限执行此操作');
      } else if (status === 404) {
        ElMessage.error('请求的资源不存在');
      } else if (status >= 500) {
        ElMessage.error('服务器错误，请稍后重试');
      } else if (error.response.data?.message) {
        ElMessage.error(error.response.data.message);
      }
    } else if (error.request) {
      ElMessage.error('网络错误，请检查网络连接');
    }
    
    return Promise.reject(error);
  }
);

export { api };
