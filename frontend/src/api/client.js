import axios from 'axios';
import { LocalStorage } from 'quasar';
import router from '../router';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
const API_TIMEOUT = import.meta.env.VITE_API_TIMEOUT || 30000;

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json'
  }
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  
  failedQueue = [];
};

apiClient.interceptors.request.use(
  (config) => {
    const token = LocalStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response) {
      if (error.response.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          }).catch(err => {
            return Promise.reject(err);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        const refreshToken = LocalStorage.getItem('refreshToken');
        
        if (!refreshToken) {
          LocalStorage.remove('authToken');
          LocalStorage.remove('refreshToken');
          router.push('/login');
          return Promise.reject(error);
        }

        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken
          });

          const { accessToken, refreshToken: newRefreshToken } = response.data;
          
          LocalStorage.set('authToken', accessToken);
          if (newRefreshToken) {
            LocalStorage.set('refreshToken', newRefreshToken);
          }

          apiClient.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          
          processQueue(null, accessToken);
          
          return apiClient(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          LocalStorage.remove('authToken');
          LocalStorage.remove('refreshToken');
          router.push('/login');
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }
      
      const message = error.response.data?.message || error.response.data?.error || 'An error occurred';
      return Promise.reject(new Error(message));
    }
    
    return Promise.reject(new Error('Network error. Please check your connection.'));
  }
);

export default apiClient;
