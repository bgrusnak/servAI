import api from '../index';

export const filesAPI = {
  upload: (file, folder = 'general') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    return api.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  uploadMultiple: (files, folder = 'general') => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('folder', folder);
    return api.post('/files/upload-multiple', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  download: (id) => api.get(`/files/${id}/download`, { responseType: 'blob' }),
  delete: (id) => api.delete(`/files/${id}`),
  getByEntity: (entityType, entityId) => api.get(`/files/${entityType}/${entityId}`)
};

export default filesAPI;
