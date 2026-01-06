import { ref } from 'vue';
import { filesAPI } from '../api';
import { useQuasar } from 'quasar';

export function useFileUpload() {
  const $q = useQuasar();
  const uploading = ref(false);
  const uploadProgress = ref(0);
  const uploadedFiles = ref([]);

  const uploadFile = async (file, folder = 'general') => {
    uploading.value = true;
    uploadProgress.value = 0;
    try {
      const response = await filesAPI.upload(file, folder);
      uploadedFiles.value.push(response.data);
      uploadProgress.value = 100;
      $q.notify({ message: 'File uploaded successfully', color: 'positive', icon: 'check' });
      return response.data;
    } catch (error) {
      $q.notify({ message: error.message || 'Upload failed', color: 'negative', icon: 'error' });
      throw error;
    } finally {
      uploading.value = false;
    }
  };

  const uploadMultiple = async (files, folder = 'general') => {
    uploading.value = true;
    uploadProgress.value = 0;
    try {
      const response = await filesAPI.uploadMultiple(files, folder);
      uploadedFiles.value.push(...response.data);
      uploadProgress.value = 100;
      $q.notify({ message: `${files.length} files uploaded successfully`, color: 'positive', icon: 'check' });
      return response.data;
    } catch (error) {
      $q.notify({ message: error.message || 'Upload failed', color: 'negative', icon: 'error' });
      throw error;
    } finally {
      uploading.value = false;
    }
  };

  const deleteFile = async (id) => {
    try {
      await filesAPI.delete(id);
      uploadedFiles.value = uploadedFiles.value.filter(f => f.id !== id);
      $q.notify({ message: 'File deleted', color: 'positive', icon: 'check' });
    } catch (error) {
      $q.notify({ message: error.message || 'Delete failed', color: 'negative', icon: 'error' });
      throw error;
    }
  };

  const clearFiles = () => {
    uploadedFiles.value = [];
    uploadProgress.value = 0;
  };

  return { uploading, uploadProgress, uploadedFiles, uploadFile, uploadMultiple, deleteFile, clearFiles };
}
