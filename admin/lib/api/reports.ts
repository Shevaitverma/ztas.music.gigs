import { apiClient } from './client'
import type {
  AdminReport,
  AdminReportListFilters,
  ServerPagination,
} from '@/lib/types'
import { verdictToAction, type ResolveVerdict } from '@/lib/schemas/report'

/**
 * Server response shape for the reports list endpoint. The server emits
 * `pagination` (canonical) — see reports.routes.ts. We expose a synthesised
 * `meta` field below for back-compat with legacy callers that still read
 * `query.data.meta.total` (mirrors `lib/api/users.ts`).
 */
interface ReportsListResponse {
  data: AdminReport[]
  pagination: ServerPagination
}

/**
 * Server contract — see
 * `ai.zts.music.server/src/modules/reports/reports.routes.ts`:
 *
 *   GET    /reports/admin/search             — list/search w/ filters & paging
 *   GET    /reports/:id                       — fetch single (admin gets full)
 *   GET    /reports/admin/entity/:type/:id    — prior reports against a target
 *   POST   /reports/admin/:id/resolve         — terminal resolve (action+notes)
 *
 * The server has no separate "dismiss" endpoint — it is modeled as a resolve
 * with action = NO_ACTION (notes still required, >= 10 chars). We expose
 * `dismiss()` as a thin wrapper for clarity at call sites.
 */

export interface ListReportsParams extends AdminReportListFilters {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

function toQuery(params: ListReportsParams): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    out[k] = String(v)
  }
  return out
}

export const reportsApi = {
  list: async (
    params: ListReportsParams = {}
  ): Promise<
    ReportsListResponse & {
      meta: ServerPagination & { hasNextPage: boolean; hasPreviousPage: boolean }
    }
  > => {
    const response = await apiClient.get<ReportsListResponse>(
      '/reports/admin/search',
      { params: toQuery(params) }
    )
    const payload = response.data
    // Back-compat: legacy callers (reports list page) read `.meta.total` —
    // synthesise it from the server's `pagination` envelope without dropping
    // the new canonical field. Mirrors `lib/api/users.ts`.
    const pagination = payload.pagination ?? {
      total: payload.data?.length ?? 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    }
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

  getById: async (id: string): Promise<AdminReport> => {
    const response = await apiClient.get<AdminReport>(`/reports/${id}`)
    return response.data
  },

  /**
   * Reports against the same target — server returns an array (NOT paginated).
   * Used to surface a "this target has been reported N times before" panel.
   */
  getEntityReports: async (
    entityType: 'USER' | 'GIG' | 'REVIEW' | 'BID' | 'APPLICATION',
    entityId: string
  ): Promise<AdminReport[]> => {
    const response = await apiClient.get<AdminReport[]>(
      `/reports/admin/entity/${entityType}/${entityId}`
    )
    return response.data
  },

  /**
   * Resolve a report. The admin chooses a verdict; we map that onto the
   * server's stricter resolution action enum. Per task brief, we never
   * escalate to a ban/suspend from this endpoint — that's the users panel's
   * job.
   */
  resolve: async (
    id: string,
    body: { verdict: ResolveVerdict; notes: string }
  ): Promise<AdminReport> => {
    const response = await apiClient.post<AdminReport>(
      `/reports/admin/${id}/resolve`,
      { action: verdictToAction(body.verdict), notes: body.notes }
    )
    return response.data
  },

  /** Dismiss = resolve with NO_ACTION. Notes still required (>= 10 chars). */
  dismiss: async (id: string, notes: string): Promise<AdminReport> => {
    const response = await apiClient.post<AdminReport>(
      `/reports/admin/${id}/resolve`,
      { action: 'NO_ACTION', notes }
    )
    return response.data
  },
}

export const reportsQueryKeys = {
  all: ['reports'] as const,
  lists: () => ['reports', 'list'] as const,
  list: (filters: ListReportsParams) => ['reports', 'list', filters] as const,
  details: () => ['reports', 'detail'] as const,
  detail: (id: string) => ['reports', id] as const,
  entity: (type: string, id: string) => ['reports', 'entity', type, id] as const,
}
