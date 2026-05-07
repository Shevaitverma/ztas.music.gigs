import { z } from 'zod'

/**
 * Mirrors `UserRole` from server enums — admin is intentionally absent from
 * the role-filter UI selector (admin accounts are out of scope for moderation
 * UI). The schema still permits 'admin' so detail pages can receive admin
 * users from the server without a parse failure.
 */
export const userRoleSchema = z.enum(['artist', 'client', 'admin'])
export type UserRoleInput = z.infer<typeof userRoleSchema>

export const userStatusSchema = z.enum([
  'active',
  'inactive',
  'banned',
  'suspended',
  'pending',
])
export type UserStatusInput = z.infer<typeof userStatusSchema>

/**
 * Statuses an admin can assign through the moderation panel.
 * Reactivate -> active, Suspend -> suspended, Ban -> banned.
 */
export const assignableStatusSchema = z.enum(['active', 'suspended', 'banned'])
export type AssignableStatusInput = z.infer<typeof assignableStatusSchema>

/**
 * Filter form schema — all fields optional; `''` is normalized to undefined
 * so URL state stays clean.
 */
export const userFiltersSchema = z.object({
  search: z
    .string()
    .trim()
    .max(120, 'Keep search under 120 characters')
    .optional()
    .transform((v) => (v ? v : undefined)),
  role: z
    .union([userRoleSchema, z.literal('')])
    .optional()
    .transform((v) => (v ? (v as UserRoleInput) : undefined)),
  status: z
    .union([userStatusSchema, z.literal('')])
    .optional()
    .transform((v) => (v ? (v as UserStatusInput) : undefined)),
  isVerified: z
    .union([z.literal(''), z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
})

export type UserFiltersInput = z.input<typeof userFiltersSchema>
export type UserFiltersOutput = z.output<typeof userFiltersSchema>

/**
 * Status-change form schema. Reason is required for suspend/ban so the audit
 * trail captures justification, optional for reactivate.
 */
export const updateStatusSchema = z
  .object({
    status: assignableStatusSchema,
    reason: z.string().trim().max(500, 'Keep reason under 500 characters').optional(),
  })
  .refine(
    (v) => v.status === 'active' || (v.reason && v.reason.length >= 3),
    { message: 'A reason (min 3 chars) is required to suspend or ban a user', path: ['reason'] }
  )

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>
