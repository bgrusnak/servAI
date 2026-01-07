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

export const FILE_UPLOAD_MAX_SIZE = 10 * 1024 * 1024; // 10MB
export const FILE_UPLOAD_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
