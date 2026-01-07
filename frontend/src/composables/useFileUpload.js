import { ref } from 'vue';
import apiClient from '../api/client';
import { sanitizeFilename } from '../utils/sanitize';
import { config } from '../config/env';

/**
 * Composable for secure file upload with validation
 */
export function useFileUpload() {
  const uploading = ref(false);
  const uploadProgress = ref(0);
  const uploadedFiles = ref([]);
  const error = ref(null);

  /**
   * Validate file before upload
   * @param {File} file - File to validate
   * @returns {object} - Validation result {valid: boolean, error: string}
   */
  const validateFile = (file) => {
    // Check if file exists
    if (!file) {
      return { valid: false, error: 'No file provided' };
    }

    // Sanitize filename
    const sanitizedName = sanitizeFilename(file.name);
    if (!sanitizedName) {
      return { valid: false, error: 'Invalid filename' };
    }

    // Check file size
    if (file.size > config.upload.maxFileSize) {
      const maxSizeMB = (config.upload.maxFileSize / 1024 / 1024).toFixed(2);
      return { 
        valid: false, 
        error: `File too large. Maximum size is ${maxSizeMB}MB` 
      };
    }

    // Check file type
    if (config.upload.allowedTypes.length > 0) {
      if (!config.upload.allowedTypes.includes(file.type)) {
        return { 
          valid: false, 
          error: `File type '${file.type}' not allowed` 
        };
      }
    }

    // Check for null bytes in filename (security)
    if (file.name.includes('\x00') || file.name.includes('\0')) {
      return { valid: false, error: 'Invalid filename characters' };
    }

    // Additional security: Check for double extensions
    const doublExtensions = ['.php.', '.exe.', '.sh.', '.bat.', '.cmd.'];
    const filenameLower = file.name.toLowerCase();
    if (doublExtensions.some(ext => filenameLower.includes(ext))) {
      return { valid: false, error: 'Suspicious file extension detected' };
    }

    return { valid: true, sanitizedName };
  };

  /**
   * Upload single file
   * @param {File} file - File to upload
   * @param {string} folder - Target folder
   * @returns {Promise} - Upload result
   */
  const uploadFile = async (file, folder = 'general') => {
    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    uploading.value = true;
    uploadProgress.value = 0;
    error.value = null;

    try {
      const formData = new FormData();
      
      // Create new File object with sanitized name
      const sanitizedFile = new File(
        [file], 
        validation.sanitizedName, 
        { type: file.type }
      );
      
      formData.append('file', sanitizedFile);
      formData.append('folder', folder);

      const response = await apiClient.post('/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            uploadProgress.value = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
          }
        }
      });

      const uploadedFile = response.data.file;
      uploadedFiles.value.push(uploadedFile);
      
      return uploadedFile;
    } catch (err) {
      error.value = err.message || 'Upload failed';
      throw err;
    } finally {
      uploading.value = false;
      uploadProgress.value = 0;
    }
  };

  /**
   * Upload multiple files
   * @param {FileList|Array} files - Files to upload
   * @param {string} folder - Target folder
   * @returns {Promise<Array>} - Array of upload results
   */
  const uploadMultiple = async (files, folder = 'general') => {
    const fileArray = Array.from(files);

    // Validate all files first
    const validations = fileArray.map(file => ({
      file,
      validation: validateFile(file)
    }));

    const invalid = validations.filter(v => !v.validation.valid);
    if (invalid.length > 0) {
      const errors = invalid.map(v => 
        `${v.file.name}: ${v.validation.error}`
      ).join('; ');
      throw new Error(`Invalid files: ${errors}`);
    }

    // Check max files limit
    if (fileArray.length > config.upload.maxFiles) {
      throw new Error(
        `Too many files. Maximum is ${config.upload.maxFiles} files`
      );
    }

    uploading.value = true;
    error.value = null;
    const results = [];
    const errors = [];

    try {
      // Upload files sequentially to avoid overwhelming the server
      for (const item of validations) {
        try {
          const result = await uploadFile(item.file, folder);
          results.push(result);
        } catch (err) {
          errors.push({ file: item.file.name, error: err.message });
        }
      }

      if (errors.length > 0) {
        const errorMsg = errors.map(e => 
          `${e.file}: ${e.error}`
        ).join('; ');
        throw new Error(`Some files failed to upload: ${errorMsg}`);
      }

      return results;
    } finally {
      uploading.value = false;
    }
  };

  /**
   * Delete uploaded file
   * @param {string} fileId - File ID to delete
   * @returns {Promise}
   */
  const deleteFile = async (fileId) => {
    try {
      await apiClient.delete(`/files/${fileId}`);
      
      // Remove from local array
      const index = uploadedFiles.value.findIndex(f => f.id === fileId);
      if (index !== -1) {
        uploadedFiles.value.splice(index, 1);
      }
    } catch (err) {
      error.value = err.message || 'Delete failed';
      throw err;
    }
  };

  /**
   * Clear uploaded files list
   */
  const clearFiles = () => {
    uploadedFiles.value = [];
    error.value = null;
  };

  /**
   * Get file icon based on MIME type
   * @param {string} mimeType - File MIME type
   * @returns {string} - Icon name
   */
  const getFileIcon = (mimeType) => {
    if (!mimeType) return 'insert_drive_file';

    const typeMap = {
      'image/': 'image',
      'video/': 'videocam',
      'audio/': 'audiotrack',
      'application/pdf': 'picture_as_pdf',
      'application/msword': 'description',
      'application/vnd.openxmlformats-officedocument.wordprocessingml': 'description',
      'application/vnd.ms-excel': 'grid_on',
      'application/vnd.openxmlformats-officedocument.spreadsheetml': 'grid_on',
      'application/zip': 'folder_zip',
      'text/': 'description'
    };

    for (const [key, icon] of Object.entries(typeMap)) {
      if (mimeType.startsWith(key)) {
        return icon;
      }
    }

    return 'insert_drive_file';
  };

  return {
    uploading,
    uploadProgress,
    uploadedFiles,
    error,
    uploadFile,
    uploadMultiple,
    deleteFile,
    clearFiles,
    validateFile,
    getFileIcon
  };
}
