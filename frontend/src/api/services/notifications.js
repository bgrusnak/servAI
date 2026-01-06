import api from '../index';

export const notificationsAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  delete: (id) => api.delete(`/notifications/${id}`),
  subscribe: (channel) => api.post('/notifications/subscribe', { channel }),
  unsubscribe: (channel) => api.post('/notifications/unsubscribe', { channel })
};

export default notificationsAPI;
