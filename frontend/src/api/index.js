import axios from 'axios';
import router from '../router';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL environment variable is not set');
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

let authStore = null;
export const setAuthStore = (store) => { authStore = store; };

apiClient.interceptors.request.use(
  (config) => {
    if (authStore?.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const shouldRetry = (error) => {
  if (!error.config || error.config.__retryCount >= MAX_RETRIES) return false;
  const status = error.response?.status;
  return !status || status >= 500 || status === 408 || status === 429;
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    if (shouldRetry(error)) {
      config.__retryCount = config.__retryCount || 0;
      config.__retryCount++;
      await delay(RETRY_DELAY * config.__retryCount);
      return apiClient(config);
    }

    if (error.response?.status === 401 && authStore) {
      authStore.logout();
      router.push('/login');
    }

    if (!error.response && !navigator.onLine) {
      return Promise.reject({
        message: 'No internet connection. Please check your network.',
        code: 'NETWORK_ERROR'
      });
    }

    return Promise.reject(error.response?.data || { message: error.message });
  }
);

const createAPI = (endpoint) => ({
  getAll: (params = {}) => apiClient.get(endpoint, { params }),
  getById: (id) => apiClient.get(`${endpoint}/${id}`),
  create: (data) => apiClient.post(endpoint, data),
  update: (id, data) => apiClient.put(`${endpoint}/${id}`, data),
  delete: (id) => apiClient.delete(`${endpoint}/${id}`)
});

export const authAPI = {
  login: (credentials) => apiClient.post('/auth/login', credentials),
  logout: () => apiClient.post('/auth/logout'),
  me: () => apiClient.get('/auth/me'),
  refresh: () => apiClient.post('/auth/refresh')
};

export const managementCompaniesAPI = createAPI('/management-companies');
export const complexesAPI = createAPI('/complexes');
export const buildingsAPI = createAPI('/buildings');
export const unitsAPI = createAPI('/units');
export const residentsAPI = createAPI('/residents');
export const workersAPI = createAPI('/workers');
export const ticketsAPI = {
  ...createAPI('/tickets'),
  addComment: (id, data) => apiClient.post(`/tickets/${id}/comments`, data),
  updateStatus: (id, status) => apiClient.patch(`/tickets/${id}/status`, { status })
};
export const meterReadingsAPI = {
  ...createAPI('/meter-readings'),
  submit: (data) => apiClient.post('/meter-readings/submit', data)
};
export const billingAPI = {
  ...createAPI('/billing'),
  payInvoice: (id, data) => apiClient.post(`/billing/${id}/pay`, data)
};
export const pollsAPI = {
  ...createAPI('/polls'),
  vote: (id, optionId) => apiClient.post(`/polls/${id}/vote`, { optionId })
};
export const reportsAPI = {
  generate: (type, params) => apiClient.post('/reports/generate', { type, ...params }),
  download: (id) => apiClient.get(`/reports/${id}/download`, { responseType: 'blob' })
};
export const settingsAPI = {
  get: () => apiClient.get('/settings'),
  update: (data) => apiClient.put('/settings', data)
};
export const profileAPI = {
  get: () => apiClient.get('/profile'),
  update: (data) => apiClient.put('/profile', data),
  changePassword: (data) => apiClient.post('/profile/change-password', data)
};
export const dashboardAPI = {
  getStats: () => apiClient.get('/dashboard/stats'),
  getActivity: () => apiClient.get('/dashboard/activity')
};
export const notificationsAPI = {
  getAll: (params) => apiClient.get('/notifications', { params }),
  markAsRead: (id) => apiClient.patch(`/notifications/${id}/read`),
  markAllAsRead: () => apiClient.post('/notifications/read-all')
};
export const filesAPI = {
  upload: (file, folder = 'general') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    return apiClient.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  uploadMultiple: (files, folder = 'general') => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('folder', folder);
    return apiClient.post('/files/upload-multiple', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  delete: (id) => apiClient.delete(`/files/${id}`)
};

export default apiClient;
