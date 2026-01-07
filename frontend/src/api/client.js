import axios from 'axios';
import router from '../router';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT || '30000');
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MAX_QUEUE_SIZE = 50; // Защита от переполнения очереди

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true // CSRF токен будет в httpOnly cookie
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
  // Не ретраим клиентские ошибки (400-499), кроме 408 и 429
  return status >= 500 || status === 408 || status === 429;
};

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // CSRF токен теперь автоматически отправляется через httpOnly cookie
    // Не нужно вручную добавлять из localStorage
    
    // Добавляем метаданные для логирования
    config.metadata = { startTime: Date.now() };
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    // Логирование производительности в dev режиме
    if (import.meta.env.DEV && response.config.metadata) {
      const duration = Date.now() - response.config.metadata.startTime;
      console.log(`[API] ${response.config.method?.toUpperCase()} ${response.config.url}: ${duration}ms`);
    }
    
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Инициализация счетчика попыток
    if (!originalRequest._retryCount) {
      originalRequest._retryCount = 0;
    }

    // Обработка 401 - истекший токен
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Если это сам запрос refresh, не пытаемся рефрешить снова
      if (originalRequest.url?.includes('/auth/refresh')) {
        router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } });
        return Promise.reject(error);
      }

      // Проверка лимита очереди - защита от атак
      if (failedQueue.length >= MAX_QUEUE_SIZE) {
        console.error('[API] Request queue overflow - possible attack or system issue');
        router.push('/login');
        return Promise.reject(new Error('Too many pending requests'));
      }

      // Если уже идет refresh, добавляем запрос в очередь
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => {
          return apiClient(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Refresh токен хранится в httpOnly cookie, отправляется автоматически
        const response = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { 
            timeout: 10000,
            withCredentials: true
          }
        );

        // Новый access токен тоже в httpOnly cookie
        // Просто продолжаем работу
        processQueue(null);
        
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Очищаем очередь при фатальной ошибке
        failedQueue = [];
        router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } });
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Retry логика для сетевых ошибок и server errors
    if (shouldRetry(error) && originalRequest._retryCount < MAX_RETRIES) {
      originalRequest._retryCount++;
      
      const retryAfter = error.response?.headers['retry-after'];
      const delay = retryAfter 
        ? parseInt(retryAfter) * 1000 
        : Math.min(RETRY_DELAY * Math.pow(2, originalRequest._retryCount - 1), 10000); // Exponential backoff
      
      if (import.meta.env.DEV) {
        console.log(`[API] Retrying request (${originalRequest._retryCount}/${MAX_RETRIES}) after ${delay}ms`);
      }
      
      await wait(delay);
      return apiClient(originalRequest);
    }
    
    // Улучшенная обработка ошибок
    if (error.response) {
      const message = error.response.data?.message 
        || error.response.data?.error 
        || `HTTP ${error.response.status}: ${error.response.statusText}`;
      
      const enhancedError = new Error(message);
      enhancedError.status = error.response.status;
      enhancedError.data = error.response.data;
      return Promise.reject(enhancedError);
    }
    
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new Error('Request timeout - please try again'));
    }
    
    if (error.code === 'ERR_NETWORK') {
      return Promise.reject(new Error('Network error - please check your connection'));
    }
    
    return Promise.reject(new Error('An unexpected error occurred'));
  }
);

// Экспорт для тестирования
export const __testing__ = {
  failedQueue: () => failedQueue,
  clearQueue: () => { failedQueue = []; },
  isRefreshing: () => isRefreshing
};

export default apiClient;
