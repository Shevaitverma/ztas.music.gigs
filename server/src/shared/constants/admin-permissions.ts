import { AdminPermission, AdminRole, UserRole } from '../enums';
import { ForbiddenException } from '../../plugins/error.plugin';
import { getAuthUser } from '../types/auth.types';

/**
 * Role-Permission Mapping
 * Defines which permissions each admin role has
 */
export const ADMIN_ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  /**
   * Super Admin - Full access to all platform features
   */
  [AdminRole.SUPER_ADMIN]: Object.values(AdminPermission),

  /**
   * Moderator - Content moderation and user management
   * Can view users, handle reports, moderate reviews, and view activity logs
   */
  [AdminRole.MODERATOR]: [
    AdminPermission.VIEW_USERS,
    AdminPermission.BAN_USERS,
    AdminPermission.VIEW_REPORTS,
    AdminPermission.RESOLVE_REPORTS,
    AdminPermission.MODERATE_REVIEWS,
    AdminPermission.VIEW_ACTIVITY_LOGS,
  ],

  /**
   * Verifier - Handles verification requests
   * Can view users and approve/reject verifications
   */
  [AdminRole.VERIFIER]: [
    AdminPermission.VIEW_USERS,
    AdminPermission.VIEW_VERIFICATIONS,
    AdminPermission.APPROVE_VERIFICATIONS,
  ],

  /**
   * Analyst - Data and analytics access
   * Can view analytics, export data, and view activity logs
   */
  [AdminRole.ANALYST]: [
    AdminPermission.VIEW_ANALYTICS,
    AdminPermission.EXPORT_DATA,
    AdminPermission.VIEW_ACTIVITY_LOGS,
  ],
};

/**
 * Check if a role has a specific permission
 * @param role - The admin role to check
 * @param permission - The permission to check for
 * @returns Whether the role has the permission
 */
export function hasPermission(role: AdminRole, permission: AdminPermission): boolean {
  const permissions = ADMIN_ROLE_PERMISSIONS[role];
  return permissions?.includes(permission) ?? false;
}

/**
 * Check if a role has all of the specified permissions
 * @param role - The admin role to check
 * @param permissions - The permissions to check for
 * @returns Whether the role has all the permissions
 */
export function hasAllPermissions(role: AdminRole, permissions: AdminPermission[]): boolean {
  return permissions.every((permission) => hasPermission(role, permission));
}

/**
 * Check if a role has any of the specified permissions
 * @param role - The admin role to check
 * @param permissions - The permissions to check for
 * @returns Whether the role has any of the permissions
 */
export function hasAnyPermission(role: AdminRole, permissions: AdminPermission[]): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

/**
 * Get all permissions for a role
 * @param role - The admin role
 * @returns Array of permissions for the role
 */
export function getPermissionsForRole(role: AdminRole): AdminPermission[] {
  return ADMIN_ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Get roles that have a specific permission
 * @param permission - The permission to check
 * @returns Array of roles that have the permission
 */
export function getRolesWithPermission(permission: AdminPermission): AdminRole[] {
  return (Object.keys(ADMIN_ROLE_PERMISSIONS) as AdminRole[]).filter((role) =>
    hasPermission(role, permission)
  );
}

/**
 * Create a guard function that checks for admin access
 * @returns Guard function for Elysia beforeHandle
 */
export function requireAdmin() {
  return (ctx: unknown) => {
    const user = getAuthUser(ctx);
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access only');
    }
  };
}

/**
 * Create a guard function that checks for specific permission.
 *
 * SECURITY (H1): admins without an explicit `adminRole` are treated as
 * MODERATOR (least-privilege), NOT SUPER_ADMIN. Promoting an admin to a
 * privileged role must be an explicit action.
 *
 * @param permission - Required permission
 * @returns Guard function for Elysia beforeHandle
 */
export function requirePermission(permission: AdminPermission) {
  return (ctx: unknown) => {
    const user = getAuthUser(ctx);
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access only');
    }

    const adminRole =
      (user as { adminRole?: AdminRole }).adminRole || AdminRole.MODERATOR;

    if (!hasPermission(adminRole, permission)) {
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }
  };
}

/**
 * Create a guard function that checks for any of the specified permissions.
 * Same MODERATOR default as {@link requirePermission}.
 *
 * @param permissions - Required permissions (any one is sufficient)
 * @returns Guard function for Elysia beforeHandle
 */
export function requireAnyPermission(permissions: AdminPermission[]) {
  return (ctx: unknown) => {
    const user = getAuthUser(ctx);
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access only');
    }

    const adminRole =
      (user as { adminRole?: AdminRole }).adminRole || AdminRole.MODERATOR;

    if (!hasAnyPermission(adminRole, permissions)) {
      throw new ForbiddenException(
        `Missing permission. Required one of: ${permissions.join(', ')}`
      );
    }
  };
}
