import axios, { AxiosInstance } from 'axios';
import { ElMessage } from 'element-plus';
import router from '@/router';

const api: AxiosInstance = axios.create({
  baseURL: '/',
  timeout: 30000,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const status = error.response.status;
      
      if (status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
        ElMessage.error('登录已过期，请重新登录');
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
