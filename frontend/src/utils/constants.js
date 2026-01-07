export const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  SUPER_ACCOUNTANT: 'super_accountant',
  UK_DIRECTOR: 'uk_director',
  UK_ACCOUNTANT: 'uk_accountant',
  COMPLEX_ADMIN: 'complex_admin',
  WORKER: 'worker'
};

export const TICKET_STATUSES = {
  NEW: 'new',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed'
};

export const TICKET_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

export const INVOICE_STATUSES = {
  PENDING: 'pending',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled'
};

export const POLL_STATUSES = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  CLOSED: 'closed'
};

export const UNIT_TYPES = {
  APARTMENT: 'apartment',
  PARKING: 'parking',
  STORAGE: 'storage',
  COMMERCIAL: 'commercial'
};

export const FILE_UPLOAD_MAX_SIZE = 10 * 1024 * 1024;
export const FILE_UPLOAD_ALLOWED_TYPES = [
  'image/jpeg', 
  'image/png', 
  'image/gif', 
  'image/webp',
  'application/pdf', 
  'application/msword', 
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  ROWS_PER_PAGE: 10,
  ROWS_PER_PAGE_OPTIONS: [10, 25, 50, 100]
};

export const DATE_FORMATS = {
  DATE: 'DD.MM.YYYY',
  DATETIME: 'DD.MM.YYYY HH:mm',
  TIME: 'HH:mm'
};
