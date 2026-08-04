/**
 * Pagination Defaults
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
} as const;

/**
 * Admin Permissions
 */
export { ADMIN_ROLE_PERMISSIONS, hasPermission, hasAnyPermission } from './admin-permissions';
