import apiClient from './client';

export const authAPI = {
  /**
   * Login user
   */
  login(email, password) {
    return apiClient.post('/auth/login', { email, password });
  },

  /**
   * Logout user
   */
  logout() {
    return apiClient.post('/auth/logout');
  },

  /**
   * Get current user profile
   */
  getProfile() {
    return apiClient.get('/auth/profile');
  },

  /**
   * Refresh token
   */
  refreshToken() {
    return apiClient.post('/auth/refresh');
  },

  /**
   * Request password reset
   */
  forgotPassword(email) {
    return apiClient.post('/auth/forgot-password', { email });
  },

  /**
   * Reset password with token
   */
  resetPassword(token, password) {
    return apiClient.post('/auth/reset-password', { token, password });
  }
};
