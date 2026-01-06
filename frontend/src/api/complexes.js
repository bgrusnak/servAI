import apiClient from './client';

export const complexesAPI = {
  /**
   * Get all complexes
   */
  getAll(params = {}) {
    return apiClient.get('/complexes', { params });
  },

  /**
   * Get single complex
   */
  getById(id) {
    return apiClient.get(`/complexes/${id}`);
  },

  /**
   * Create complex
   */
  create(data) {
    return apiClient.post('/complexes', data);
  },

  /**
   * Update complex
   */
  update(id, data) {
    return apiClient.put(`/complexes/${id}`, data);
  },

  /**
   * Delete complex
   */
  delete(id) {
    return apiClient.delete(`/complexes/${id}`);
  },

  /**
   * Get complex statistics
   */
  getStats(id) {
    return apiClient.get(`/complexes/${id}/stats`);
  },

  /**
   * Import units from Excel
   */
  importUnits(complexId, file, mapping) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mapping', JSON.stringify(mapping));
    
    return apiClient.post(`/complexes/${complexId}/import-units`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  }
};
