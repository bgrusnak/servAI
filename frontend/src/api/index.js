import apiClient from './client';

export const authAPI = {
  login: (credentials) => apiClient.post('/auth/login', credentials),
  register: (data) => apiClient.post('/auth/register', data),
  logout: (data) => apiClient.post('/auth/logout', data),
  refresh: (data) => apiClient.post('/auth/refresh', data),
  me: () => apiClient.get('/auth/me')
};

export default {
  authAPI
};
