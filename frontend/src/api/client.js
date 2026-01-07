import axios from 'axios';
import { LocalStorage } from 'quasar';
import router from '../router';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT || '30000');
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true
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

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const shouldRetry = (error) => {
  if (!error.response) return true;
  const status = error.response.status;
  return status >= 500 || status === 408 || status === 429;
};

apiClient.interceptors.request.use(
  (config) => {
    const token = LocalStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    const csrfToken = LocalStorage.getItem('csrfToken');
    if (csrfToken && ['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase())) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
    
    config.metadata = { startTime: Date.now() };
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => {
    const duration = Date.now() - response.config.metadata.startTime;
    if (import.meta.env.DEV) {
      console.log(`API ${response.config.method?.toUpperCase()} ${response.config.url}: ${duration}ms`);
    }
    
    const csrfToken = response.headers['x-csrf-token'];
    if (csrfToken) {
      LocalStorage.set('csrfToken', csrfToken);
    }
    
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (!originalRequest._retryCount) {
      originalRequest._retryCount = 0;
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes('/auth/refresh')) {
        LocalStorage.remove('authToken');
        LocalStorage.remove('refreshToken');
        router.push('/login');
        return Promise.reject(error);
      }

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
        const response = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          { refreshToken },
          { timeout: 10000 }
        );

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

    if (shouldRetry(error) && originalRequest._retryCount < MAX_RETRIES) {
      originalRequest._retryCount++;
      
      const retryAfter = error.response?.headers['retry-after'];
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : RETRY_DELAY * originalRequest._retryCount;
      
      if (import.meta.env.DEV) {
        console.log(`Retrying request (${originalRequest._retryCount}/${MAX_RETRIES}) after ${delay}ms`);
      }
      
      await wait(delay);
      return apiClient(originalRequest);
    }
    
    if (error.response) {
      const message = error.response.data?.message || error.response.data?.error || 'errors.apiError';
      return Promise.reject(new Error(message));
    }
    
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new Error('errors.timeout'));
    }
    
    return Promise.reject(new Error('errors.networkError'));
  }
);

export default apiClient;
