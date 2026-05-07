import { apiClient } from './client'
import type {
  ActivityLogEntry,
  AssignableUserStatus,
  UserDetail,
  UserListFilters,
  UserListItem,
  UsersListResponse,
} from '@/lib/types'

/**
 * Strip undefined/null/empty-string fields so axios doesn't serialize them
 * into the query string (server treats e.g. `?status=` as a present-but-empty
 * filter for some validators).
 */
function clean<T extends Record<string, unknown>>(obj: T): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue
    out[k] = typeof v === 'boolean' ? (v ? 'true' : 'false') : (v as string | number)
  }
  return out
}

export const usersApi = {
  /**
   * List users with optional filters. Server endpoint:
   *   GET /admin/users?page&limit&role&status&isVerified&search
   * Returns `{ data: UserListItem[], pagination: { total, page, limit, totalPages } }`.
   */
  list: async (
    filters: UserListFilters = {}
  ): Promise<UsersListResponse & { meta: UsersListResponse['pagination'] & { hasNextPage: boolean; hasPreviousPage: boolean } }> => {
    const response = await apiClient.get<UsersListResponse>('/admin/users', {
      params: clean(filters as Record<string, unknown>),
    })
    const payload = response.data
    // Back-compat: legacy callers (dashboard) read `.meta.total` — synthesise
    // it from the server's `pagination` envelope without dropping the new
    // canonical field.
    const pagination = payload.pagination ?? { total: payload.data?.length ?? 0, page: 1, limit: 20, totalPages: 1 }
    return {
      ...payload,
      pagination,
      meta: {
        ...pagination,
        hasNextPage: pagination.page < pagination.totalPages,
        hasPreviousPage: pagination.page > 1,
      },
    }
  },

  /**
   * Single user. The server doesn't expose a dedicated `GET /admin/users/:id`
   * route; we synthesise it by listing with a 1-item page filtered down. Until
   * a proper endpoint exists, callers receive whichever record matches the id
   * inside the most recent page.
   *
   * NOTE: Listed in the report as a contract gap. Profile detail
   * sub-objects (artistProfile/clientProfile) may be absent because the
   * list projection only returns top-level fields.
   */
  getById: async (id: string): Promise<UserDetail | null> => {
    const response = await apiClient.get<UsersListResponse>('/admin/users', {
      params: { limit: 100, page: 1 },
    })
    const found = response.data.data.find((u) => u.id === id)
    return (found as UserDetail | undefined) ?? null
  },

  /**
   * Update user status (ban / suspend / reactivate).
   * Server expects PUT /admin/users/:id/status with body { status, reason? }.
   * The activity log is force-emitted server-side for audit purposes.
   */
  updateStatus: async (
    id: string,
    status: AssignableUserStatus,
    reason?: string
  ): Promise<{ id: string; status: string; statusReason?: string }> => {
    const response = await apiClient.put<{
      id: string
      status: string
      statusReason?: string
    }>(`/admin/users/${id}/status`, { status, reason })
    return response.data
  },

  /**
   * Audit trail for a single user. Server: GET /admin/activity-logs/user/:userId.
   * The server returns the entries directly (array) under the standard envelope.
   */
  getActivityLog: async (
    userId: string,
    limit = 50
  ): Promise<ActivityLogEntry[]> => {
    const response = await apiClient.get<ActivityLogEntry[] | { data: ActivityLogEntry[] }>(
      `/admin/activity-logs/user/${userId}`,
      { params: { limit } }
    )
    // Defensively unwrap if server starts double-wrapping.
    const payload = response.data as ActivityLogEntry[] | { data: ActivityLogEntry[] }
    if (Array.isArray(payload)) return payload
    if (payload && Array.isArray(payload.data)) return payload.data
    return []
  },
}

/** React Query key factory — keep all users-moderation keys here. */
export const usersQueryKeys = {
  all: ['users'] as const,
  list: (filters: UserListFilters) => ['users', 'list', filters] as const,
  detail: (id: string) => ['users', id] as const,
  activity: (id: string) => ['users', id, 'activity'] as const,
}
