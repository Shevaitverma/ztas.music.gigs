/**
 * Aggregator for moderation API clients.
 *
 * Each domain owns its own module:
 *  - `usersApi` lives in `lib/api/users.ts`
 *  - `verificationsApi` lives in `lib/api/verifications.ts`
 *  - `reportsApi` lives in `lib/api/reports.ts`
 *
 * This file re-exports the named clients so existing imports
 * (`@/lib/api/admin`) keep working.
 */

import { usersApi, usersQueryKeys } from './users'
import { verificationsApi, verificationQueryKeys } from './verifications'
import { reportsApi, reportsQueryKeys } from './reports'
import type { UserListFilters } from '@/lib/types'

export { usersApi, usersQueryKeys }
export { verificationsApi, verificationQueryKeys }
export { reportsApi, reportsQueryKeys }

/** Back-compat alias used by existing call sites. */
export type ListUsersParams = UserListFilters

/**
 * Composite query-key factory. Per-domain keys live in their own modules; this
 * keeps the legacy shape compiling for the dashboard.
 */
export const adminQueryKeys = {
  users: {
    all: usersQueryKeys.all,
    list: (params: ListUsersParams) => usersQueryKeys.list(params),
  },
  verifications: {
    pending: verificationQueryKeys.pending(),
  },
  reports: {
    all: reportsQueryKeys.all,
  },
}
