import apiClient from './client';

export const authAPI = {
  login: (credentials) => apiClient.post('/auth/login', credentials),
  register: (data) => apiClient.post('/auth/register', data),
  logout: (data) => apiClient.post('/auth/logout', data),
  refresh: (data) => apiClient.post('/auth/refresh', data),
  me: () => apiClient.get('/auth/me'),
  requestPasswordReset: (data) => apiClient.post('/auth/request-reset', data),
  resetPassword: (data) => apiClient.post('/auth/reset-password', data)
};

export const condosAPI = {
  list: (params) => apiClient.get('/condos', { params }),
  get: (id) => apiClient.get(`/condos/${id}`),
  create: (data) => apiClient.post('/condos', data),
  update: (id, data) => apiClient.patch(`/condos/${id}`, data),
  delete: (id) => apiClient.delete(`/condos/${id}`)
};

export const buildingsAPI = {
  list: (params) => apiClient.get('/buildings', { params }),
  get: (id) => apiClient.get(`/buildings/${id}`),
  create: (data) => apiClient.post('/buildings', data),
  update: (id, data) => apiClient.patch(`/buildings/${id}`, data),
  delete: (id) => apiClient.delete(`/buildings/${id}`)
};

export const unitsAPI = {
  list: (params) => apiClient.get('/units', { params }),
  get: (id) => apiClient.get(`/units/${id}`),
  create: (data) => apiClient.post('/units', data),
  update: (id, data) => apiClient.patch(`/units/${id}`, data),
  delete: (id) => apiClient.delete(`/units/${id}`)
};

export const metersAPI = {
  list: (unitId) => apiClient.get(`/units/${unitId}/meters`),
  submitReading: (meterId, data) => apiClient.post(`/meters/${meterId}/readings`, data),
  ocrReading: (data) => apiClient.post('/meters/readings/ocr', data)
};

export const invoicesAPI = {
  list: (params) => apiClient.get('/invoices', { params }),
  get: (id) => apiClient.get(`/invoices/${id}`),
  pay: (id, data) => apiClient.post(`/invoices/${id}/payments`, data)
};

export const ticketsAPI = {
  list: (params) => apiClient.get('/tickets', { params }),
  get: (id) => apiClient.get(`/tickets/${id}`),
  create: (data) => apiClient.post('/tickets', data),
  update: (id, data) => apiClient.patch(`/tickets/${id}`, data),
  addComment: (id, data) => apiClient.post(`/tickets/${id}/comments`, data),
  assign: (id, data) => apiClient.post(`/tickets/${id}/assign`, data),
  updateStatus: (id, data) => apiClient.patch(`/tickets/${id}/status`, data)
};

export const pollsAPI = {
  list: (params) => apiClient.get('/polls', { params }),
  get: (id) => apiClient.get(`/polls/${id}`),
  create: (data) => apiClient.post('/polls', data),
  vote: (id, data) => apiClient.post(`/polls/${id}/vote`, data),
  results: (id) => apiClient.get(`/polls/${id}/results`)
};

export const uploadsAPI = {
  document: (formData) => apiClient.post('/upload/document', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  meterPhoto: (formData) => apiClient.post('/upload/meter-photo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
};

export default {
  authAPI,
  condosAPI,
  buildingsAPI,
  unitsAPI,
  metersAPI,
  invoicesAPI,
  ticketsAPI,
  pollsAPI,
  uploadsAPI
};
