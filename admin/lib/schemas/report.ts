import { z } from 'zod'

/**
 * Server-side enums (mirrored from
 * `ai.zts.music.server/src/shared/enums/index.ts`). Kept as plain string
 * unions/zod enums so the admin UI does not need a runtime import from the
 * server package.
 */
export const reportStatusValues = [
  'PENDING',
  'UNDER_REVIEW',
  'NEEDS_INFO',
  'INVESTIGATING',
  'RESOLVED',
  'DISMISSED',
  'ESCALATED',
] as const
export type ReportStatus = (typeof reportStatusValues)[number]

export const reportCategoryValues = [
  'USER_BEHAVIOR',
  'GIG_CONTENT',
  'PAYMENT',
  'PROFILE_CONTENT',
  'SAFETY',
  'SPAM',
  'TECHNICAL',
  'OTHER',
] as const
export type ReportCategory = (typeof reportCategoryValues)[number]

export const reportTypeValues = [
  'HARASSMENT',
  'FRAUD',
  'SCAM',
  'IMPERSONATION',
  'INAPPROPRIATE_CONTENT',
  'ILLEGAL_CONTENT',
  'NO_SHOW',
  'LATE_ARRIVAL',
  'UNPROFESSIONAL_BEHAVIOR',
  'QUALITY_MISMATCH',
  'FALSE_INFORMATION',
  'PAYMENT_DISPUTE',
  'SAFETY_CONCERN',
  'COPYRIGHT',
  'SPAM',
  'BUG',
  'OTHER',
] as const
export type ReportTypeValue = (typeof reportTypeValues)[number]

export const reportPriorityValues = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
export type ReportPriority = (typeof reportPriorityValues)[number]

export const reportEntityTypeValues = [
  'USER',
  'GIG',
  'REVIEW',
  'BID',
  'APPLICATION',
] as const
export type ReportEntityType = (typeof reportEntityTypeValues)[number]

export const reportResolutionActionValues = [
  'NO_ACTION',
  'WARNING',
  'CONTENT_REMOVED',
  'USER_SUSPENDED',
  'USER_BANNED',
] as const
export type ReportResolutionAction = (typeof reportResolutionActionValues)[number]

/**
 * UI-side resolve form. The server requires `notes` to be 10-2000 chars.
 *
 * The admin UI exposes a high-level `verdict` selector ("valid" / "invalid" /
 * "inconclusive") which maps onto the server's stricter action enum:
 *  - valid          → CONTENT_REMOVED (escalating to ban/suspend is the
 *                     users-panel's job per task brief)
 *  - invalid        → NO_ACTION       (handled via the dismiss flow as well)
 *  - inconclusive   → WARNING
 */
export const resolveVerdictValues = ['valid', 'invalid', 'inconclusive'] as const
export type ResolveVerdict = (typeof resolveVerdictValues)[number]

export const resolveFormSchema = z.object({
  verdict: z.enum(resolveVerdictValues),
  notes: z
    .string()
    .trim()
    .min(10, 'Notes must be at least 10 characters')
    .max(2000, 'Notes must be at most 2000 characters'),
})
export type ResolveFormInput = z.infer<typeof resolveFormSchema>

export const dismissFormSchema = z.object({
  notes: z
    .string()
    .trim()
    .min(10, 'Notes must be at least 10 characters')
    .max(2000, 'Notes must be at most 2000 characters'),
})
export type DismissFormInput = z.infer<typeof dismissFormSchema>

/** Map a UI verdict onto the server resolution action. */
export function verdictToAction(verdict: ResolveVerdict): ReportResolutionAction {
  switch (verdict) {
    case 'valid':
      return 'CONTENT_REMOVED'
    case 'invalid':
      return 'NO_ACTION'
    case 'inconclusive':
      return 'WARNING'
  }
}
