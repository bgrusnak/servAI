export const required = (value) => !!value || 'This field is required';

export const email = (value) => {
  if (!value) return true;
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(value) || 'Invalid email address';
};

export const minLength = (min) => (value) => {
  if (!value) return true;
  return value.length >= min || `Minimum ${min} characters required`;
};

export const maxLength = (max) => (value) => {
  if (!value) return true;
  return value.length <= max || `Maximum ${max} characters allowed`;
};

export const numeric = (value) => {
  if (!value) return true;
  return !isNaN(value) || 'Must be a number';
};

export const minValue = (min) => (value) => {
  if (!value) return true;
  return Number(value) >= min || `Minimum value is ${min}`;
};

export const maxValue = (max) => (value) => {
  if (!value) return true;
  return Number(value) <= max || `Maximum value is ${max}`;
};

export const phone = (value) => {
  if (!value) return true;
  const pattern = /^[+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/;
  return pattern.test(value) || 'Invalid phone number';
};

export const url = (value) => {
  if (!value) return true;
  const pattern = /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)$/;
  return pattern.test(value) || 'Invalid URL';
};

export const alphanumeric = (value) => {
  if (!value) return true;
  const pattern = /^[a-zA-Z0-9]+$/;
  return pattern.test(value) || 'Only letters and numbers allowed';
};

export const passwordMatch = (password) => (value) => {
  return value === password || 'Passwords do not match';
};
