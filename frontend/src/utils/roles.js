/**
 * User Roles Constants
 * Используйте эти константы вместо строковых литералов для предотвращения ошибок
 */
export const USER_ROLES = Object.freeze({
  SUPER_ADMIN: 'superadmin',
  UK_DIRECTOR: 'uk_director',
  COMPLEX_ADMIN: 'complex_admin',
  ACCOUNTANT: 'accountant',
  EMPLOYEE: 'employee',
  SECURITY_GUARD: 'security_guard',
  RESIDENT: 'resident'
});

/**
 * Role Priority (for determining primary role)
 * Чем меньше число, тем выше приоритет
 */
export const ROLE_PRIORITY = Object.freeze({
  [USER_ROLES.SUPER_ADMIN]: 1,
  [USER_ROLES.UK_DIRECTOR]: 2,
  [USER_ROLES.COMPLEX_ADMIN]: 3,
  [USER_ROLES.ACCOUNTANT]: 4,
  [USER_ROLES.EMPLOYEE]: 5,
  [USER_ROLES.SECURITY_GUARD]: 6,
  [USER_ROLES.RESIDENT]: 7
});

/**
 * Role Display Names (for UI)
 */
export const ROLE_NAMES = Object.freeze({
  [USER_ROLES.SUPER_ADMIN]: 'roles.superAdmin',
  [USER_ROLES.UK_DIRECTOR]: 'roles.ukDirector',
  [USER_ROLES.COMPLEX_ADMIN]: 'roles.complexAdmin',
  [USER_ROLES.ACCOUNTANT]: 'roles.accountant',
  [USER_ROLES.EMPLOYEE]: 'roles.employee',
  [USER_ROLES.SECURITY_GUARD]: 'roles.securityGuard',
  [USER_ROLES.RESIDENT]: 'roles.resident'
});

/**
 * Role Groups for permission checking
 */
export const ROLE_GROUPS = Object.freeze({
  ADMIN: [USER_ROLES.SUPER_ADMIN, USER_ROLES.UK_DIRECTOR, USER_ROLES.COMPLEX_ADMIN],
  MANAGEMENT: [USER_ROLES.SUPER_ADMIN, USER_ROLES.UK_DIRECTOR, USER_ROLES.COMPLEX_ADMIN, USER_ROLES.ACCOUNTANT],
  STAFF: [USER_ROLES.EMPLOYEE, USER_ROLES.SECURITY_GUARD],
  ALL_STAFF: [
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.UK_DIRECTOR,
    USER_ROLES.COMPLEX_ADMIN,
    USER_ROLES.ACCOUNTANT,
    USER_ROLES.EMPLOYEE,
    USER_ROLES.SECURITY_GUARD
  ]
});

/**
 * Check if role is valid
 * @param {string} role - Role to validate
 * @returns {boolean}
 */
export function isValidRole(role) {
  return Object.values(USER_ROLES).includes(role);
}

/**
 * Get primary role from array of user roles
 * @param {Array} userRoles - Array of role objects [{role: 'superadmin', ...}]
 * @returns {string|null} - Primary role or null
 */
export function getPrimaryRole(userRoles) {
  if (!Array.isArray(userRoles) || userRoles.length === 0) {
    return null;
  }

  const validRoles = userRoles
    .map(r => r.role)
    .filter(role => isValidRole(role))
    .sort((a, b) => ROLE_PRIORITY[a] - ROLE_PRIORITY[b]);

  return validRoles[0] || null;
}

/**
 * Check if user has specific role
 * @param {Array} userRoles - Array of role objects
 * @param {string} targetRole - Role to check
 * @returns {boolean}
 */
export function hasRole(userRoles, targetRole) {
  if (!Array.isArray(userRoles)) {
    return false;
  }
  return userRoles.some(r => r.role === targetRole);
}

/**
 * Check if user has any role from the list
 * @param {Array} userRoles - Array of role objects
 * @param {Array} targetRoles - Roles to check against
 * @returns {boolean}
 */
export function hasAnyRole(userRoles, targetRoles) {
  if (!Array.isArray(userRoles) || !Array.isArray(targetRoles)) {
    return false;
  }
  return userRoles.some(r => targetRoles.includes(r.role));
}

/**
 * Check if user has all roles from the list
 * @param {Array} userRoles - Array of role objects
 * @param {Array} targetRoles - Roles to check against
 * @returns {boolean}
 */
export function hasAllRoles(userRoles, targetRoles) {
  if (!Array.isArray(userRoles) || !Array.isArray(targetRoles)) {
    return false;
  }
  const userRoleNames = userRoles.map(r => r.role);
  return targetRoles.every(role => userRoleNames.includes(role));
}

/**
 * Check if user is admin (any admin role)
 * @param {Array} userRoles - Array of role objects
 * @returns {boolean}
 */
export function isAdmin(userRoles) {
  return hasAnyRole(userRoles, ROLE_GROUPS.ADMIN);
}

/**
 * Check if user is super admin
 * @param {Array} userRoles - Array of role objects
 * @returns {boolean}
 */
export function isSuperAdmin(userRoles) {
  return hasRole(userRoles, USER_ROLES.SUPER_ADMIN);
}

/**
 * Get role display name
 * @param {string} role - Role key
 * @returns {string} - i18n key for role name
 */
export function getRoleName(role) {
  return ROLE_NAMES[role] || 'roles.unknown';
}

/**
 * Compare roles by priority
 * @param {string} role1 - First role
 * @param {string} role2 - Second role
 * @returns {number} - Negative if role1 has higher priority
 */
export function compareRoles(role1, role2) {
  const priority1 = ROLE_PRIORITY[role1] ?? 999;
  const priority2 = ROLE_PRIORITY[role2] ?? 999;
  return priority1 - priority2;
}

/**
 * Filter roles by permission level
 * @param {Array} userRoles - User roles
 * @param {number} minPriority - Minimum priority level
 * @returns {Array} - Filtered roles
 */
export function filterRolesByPriority(userRoles, minPriority) {
  if (!Array.isArray(userRoles)) {
    return [];
  }
  return userRoles.filter(r => {
    const priority = ROLE_PRIORITY[r.role];
    return priority !== undefined && priority <= minPriority;
  });
}
