/**
 * HTTP Status Messages
 */
export const HTTP_MESSAGES = {
  SUCCESS: 'Operation completed successfully',
  CREATED: 'Resource created successfully',
  UPDATED: 'Resource updated successfully',
  DELETED: 'Resource deleted successfully',
  NOT_FOUND: 'Resource not found',
  BAD_REQUEST: 'Invalid request parameters',
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'Access denied',
  INTERNAL_ERROR: 'Internal server error',
} as const;

/**
 * User Roles
 */
export const USER_ROLES = {
  ADMIN: 'admin',
  CREATOR: 'creator',
  USER: 'user',
} as const;

/**
 * User Status
 */
export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
  SUSPENDED: 'suspended',
} as const;

/**
 * Pagination Defaults
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
} as const;

/**
 * Date Formats
 */
export const DATE_FORMATS = {
  ISO: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
  DATE_ONLY: 'YYYY-MM-DD',
  TIME_ONLY: 'HH:mm:ss',
  DISPLAY: 'DD/MM/YYYY HH:mm',
} as const;

/**
 * File Upload Constants
 */
export const FILE_UPLOAD = {
  ALLOWED_AUDIO_TYPES: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'],
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  MAX_AUDIO_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
} as const;

/**
 * Cache TTL (Time To Live) in seconds
 */
export const CACHE_TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  VERY_LONG: 86400, // 24 hours
} as const;

/**
 * WebSocket Events
 */
export const WS_EVENTS = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  MESSAGE: 'message',
  TYPING: 'typing',
  READ: 'read',
  ERROR: 'error',
} as const;

/**
 * Payment Status
 */
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;

/**
 * Admin Permissions
 */
export {
  ADMIN_ROLE_PERMISSIONS,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getPermissionsForRole,
  getRolesWithPermission,
} from './admin-permissions';
