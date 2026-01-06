import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

const api = axios.create({ baseURL: API_BASE_URL, timeout: 10000, headers: { 'Content-Type': 'application/json' } });

api.interceptors.request.use((config) => { const token = localStorage.getItem('token'); if (token) { config.headers.Authorization = `Bearer ${token}`; } return config; }, (error) => Promise.reject(error));

api.interceptors.response.use((response) => response, (error) => { if (error.response?.status === 401) { localStorage.removeItem('token'); window.location.href = '/login'; } return Promise.reject(error.response?.data || error); });

const createCRUDService = (resource) => ({
  getAll: (params) => api.get(`/${resource}`, { params }),
  getById: (id) => api.get(`/${resource}/${id}`),
  create: (data) => api.post(`/${resource}`, data),
  update: (id, data) => api.put(`/${resource}/${id}`, data),
  delete: (id) => api.delete(`/${resource}/${id}`)
});

export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (data) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  refresh: () => api.post('/auth/refresh'),
  me: () => api.get('/auth/me')
};

export const managementCompaniesAPI = createCRUDService('management-companies');
export const complexesAPI = createCRUDService('complexes');
export const buildingsAPI = createCRUDService('buildings');
export const unitsAPI = createCRUDService('units');
export const residentsAPI = createCRUDService('residents');
export const workersAPI = createCRUDService('workers');

export const ticketsAPI = {
  ...createCRUDService('tickets'),
  addComment: (id, data) => api.post(`/tickets/${id}/comments`, data)
};

export const meterReadingsAPI = {
  ...createCRUDService('meter-readings'),
  getHistory: (unitId, meterType) => api.get(`/meter-readings/history/${unitId}/${meterType}`),
  getConsumption: (unitId, period) => api.get(`/meter-readings/consumption/${unitId}`, { params: { period } })
};

export const billingAPI = {
  ...createCRUDService('billing'),
  getInvoices: (params) => api.get('/billing/invoices', { params }),
  generateInvoice: (data) => api.post('/billing/invoices/generate', data),
  payInvoice: (id, data) => api.post(`/billing/invoices/${id}/pay`, data),
  getStats: () => api.get('/billing/stats')
};

export const pollsAPI = {
  ...createCRUDService('polls'),
  vote: (id, optionId) => api.post(`/polls/${id}/vote`, { optionId }),
  getResults: (id) => api.get(`/polls/${id}/results`)
};

export const accessControlAPI = {
  getKeys: (params) => api.get('/access-control/keys', { params }),
  generateKey: (data) => api.post('/access-control/keys', data),
  revokeKey: (id) => api.delete(`/access-control/keys/${id}`),
  getLog: (params) => api.get('/access-control/log', { params }),
  verifyAccess: (keyCode) => api.post('/access-control/verify', { keyCode })
};

export const reportsAPI = {
  getAll: (params) => api.get('/reports', { params }),
  generate: (data) => api.post('/reports/generate', data),
  download: (id) => api.get(`/reports/${id}/download`, { responseType: 'blob' }),
  getStats: (type, params) => api.get(`/reports/stats/${type}`, { params })
};

export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
  getIntegrations: () => api.get('/settings/integrations'),
  updateIntegration: (name, data) => api.put(`/settings/integrations/${name}`, data)
};

export const profileAPI = {
  get: () => api.get('/profile'),
  update: (data) => api.put('/profile', data),
  changePassword: (data) => api.post('/profile/change-password', data),
  updatePreferences: (data) => api.put('/profile/preferences', data),
  enable2FA: () => api.post('/profile/2fa/enable'),
  disable2FA: () => api.post('/profile/2fa/disable'),
  uploadAvatar: (file) => { const formData = new FormData(); formData.append('avatar', file); return api.post('/profile/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } }); }
};

export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
  getRecentActivity: () => api.get('/dashboard/activity'),
  getCharts: (type) => api.get(`/dashboard/charts/${type}`)
};

export default api;
