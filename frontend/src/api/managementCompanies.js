import apiClient from './client';

export const managementCompaniesAPI = {
  /**
   * Get all management companies
   */
  getAll(params = {}) {
    return apiClient.get('/management-companies', { params });
  },

  /**
   * Get single management company
   */
  getById(id) {
    return apiClient.get(`/management-companies/${id}`);
  },

  /**
   * Create management company
   */
  create(data) {
    return apiClient.post('/management-companies', data);
  },

  /**
   * Update management company
   */
  update(id, data) {
    return apiClient.put(`/management-companies/${id}`, data);
  },

  /**
   * Delete management company
   */
  delete(id) {
    return apiClient.delete(`/management-companies/${id}`);
  },

  /**
   * Get statistics for management company
   */
  getStats(id) {
    return apiClient.get(`/management-companies/${id}/stats`);
  }
};
