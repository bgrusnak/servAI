/**
 * Application configuration
 */

export const config = {
  upload: {
    // Maximum file size in bytes (10MB)
    maxFileSize: 10 * 1024 * 1024,
    
    // Maximum number of files per upload
    maxFiles: 5,
    
    // Allowed MIME types (empty array = all types allowed)
    allowedTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv'
    ],
    
    // Chunk size for large file uploads (5MB)
    chunkSize: 5 * 1024 * 1024
  },
  
  api: {
    // Request timeout in milliseconds
    timeout: 30000,
    
    // Max retry attempts for failed requests
    maxRetries: 3,
    
    // Retry delay in milliseconds
    retryDelay: 1000,
    
    // Max size of failed request queue
    maxQueueSize: 50
  },
  
  security: {
    // Password minimum length
    passwordMinLength: 8,
    
    // Session timeout in milliseconds (30 minutes)
    sessionTimeout: 30 * 60 * 1000,
    
    // Token refresh threshold (5 minutes before expiry)
    tokenRefreshThreshold: 5 * 60 * 1000
  },
  
  ui: {
    // Debounce delay for search in milliseconds
    searchDebounce: 300,
    
    // Items per page in lists
    itemsPerPage: 20,
    
    // Virtual scroll slice size
    virtualScrollSliceSize: 50,
    
    // Toast notification duration in milliseconds
    notificationDuration: 5000
  }
};

export default config;
