'use client'

/**
 * Admin-side mirror of the server permission matrix.
 *
 * Source of truth lives on the server at
 * `server/src/shared/constants/admin-permissions.ts` and the canonical
 * `AdminPermission` enum at `server/src/shared/enums/index.ts`. This mirror
 * exists purely so the UI can hide actions an admin's tier cannot perform —
 * the server still enforces the permission on every request. Keep this file
 * in sync with the server matrix; the server's check is authoritative.
 *
 * NOTE: Not every server route is gated by a fine-grained permission. Some
 * (e.g. verification approve/reject) are gated only by `UserRole.ADMIN` on
 * the server, so they have no entry here — gate those call sites by admin
 * role presence, not by a permission string.
 */

import { useAtomValue } from 'jotai'
import { adminRoleAtom } from '@/lib/atoms/auth'
import type { AdminRole } from '@/lib/types'

export type Permission =
  | 'VIEW_USERS'
  | 'EDIT_USERS'
  | 'BAN_USERS'
  | 'VIEW_VERIFICATIONS'
  | 'APPROVE_VERIFICATIONS'
  | 'VIEW_REPORTS'
  | 'RESOLVE_REPORTS'
  | 'MODERATE_REVIEWS'
  | 'VIEW_ANALYTICS'
  | 'EXPORT_DATA'
  | 'VIEW_ACTIVITY_LOGS'
  | 'VIEW_STORAGE'
  | 'MANAGE_STORAGE'
  | 'MANAGE_ADMINS'
  | 'SYSTEM_SETTINGS'

const ALL_PERMISSIONS: Permission[] = [
  'VIEW_USERS',
  'EDIT_USERS',
  'BAN_USERS',
  'VIEW_VERIFICATIONS',
  'APPROVE_VERIFICATIONS',
  'VIEW_REPORTS',
  'RESOLVE_REPORTS',
  'MODERATE_REVIEWS',
  'VIEW_ANALYTICS',
  'EXPORT_DATA',
  'VIEW_ACTIVITY_LOGS',
  'VIEW_STORAGE',
  'MANAGE_STORAGE',
  'MANAGE_ADMINS',
  'SYSTEM_SETTINGS',
]

export const PERMISSION_MATRIX: Record<AdminRole, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  MODERATOR: [
    'VIEW_USERS',
    'BAN_USERS',
    'VIEW_REPORTS',
    'RESOLVE_REPORTS',
    'MODERATE_REVIEWS',
    'VIEW_ACTIVITY_LOGS',
  ],
  VERIFIER: [
    'VIEW_USERS',
    'VIEW_VERIFICATIONS',
    'APPROVE_VERIFICATIONS',
  ],
  ANALYST: [
    'VIEW_ANALYTICS',
    'EXPORT_DATA',
    'VIEW_ACTIVITY_LOGS',
  ],
}

export function hasPermission(
  role: AdminRole | null | undefined,
  perm: Permission,
): boolean {
  if (!role) return false
  const perms = PERMISSION_MATRIX[role]
  return perms ? perms.includes(perm) : false
}

export function usePermission(perm: Permission): boolean {
  const role = useAtomValue(adminRoleAtom)
  return hasPermission(role, perm)
}
