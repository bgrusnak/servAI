import apiClient from './client';

export const ticketsAPI = {
  /**
   * Get all tickets
   */
  getAll(params = {}) {
    return apiClient.get('/tickets', { params });
  },

  /**
   * Get single ticket
   */
  getById(id) {
    return apiClient.get(`/tickets/${id}`);
  },

  /**
   * Create ticket
   */
  create(data) {
    return apiClient.post('/tickets', data);
  },

  /**
   * Update ticket
   */
  update(id, data) {
    return apiClient.put(`/tickets/${id}`, data);
  },

  /**
   * Assign ticket to worker
   */
  assign(id, workerId) {
    return apiClient.post(`/tickets/${id}/assign`, { workerId });
  },

  /**
   * Update ticket status
   */
  updateStatus(id, status) {
    return apiClient.put(`/tickets/${id}/status`, { status });
  },

  /**
   * Add comment to ticket
   */
  addComment(id, comment) {
    return apiClient.post(`/tickets/${id}/comments`, { comment });
  },

  /**
   * Get ticket comments
   */
  getComments(id) {
    return apiClient.get(`/tickets/${id}/comments`);
  }
};
