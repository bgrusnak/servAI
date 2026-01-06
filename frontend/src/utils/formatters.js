export const formatDate = (date, locale = 'en-US') => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString(locale);
};

export const formatDateTime = (date, locale = 'en-US') => {
  if (!date) return '-';
  return new Date(date).toLocaleString(locale);
};

export const formatCurrency = (amount, currency = 'EUR', locale = 'en-US') => {
  if (amount == null) return '-';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
};

export const formatNumber = (num, decimals = 0, locale = 'en-US') => {
  if (num == null) return '-';
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(num);
};

export const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export const formatPercent = (value, decimals = 1) => {
  if (value == null) return '-';
  return (value * 100).toFixed(decimals) + '%';
};

export const truncateText = (text, maxLength = 50) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};
