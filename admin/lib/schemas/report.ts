import { z } from 'zod'

/**
 * Server-side resolution actions (mirrored from
 * `ai.zts.music.server/src/shared/enums/index.ts`). The other report enums live
 * in `lib/types.ts` as `AdminReport*` unions — this one is here because only
 * `verdictToAction` below consumes it.
 */
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
