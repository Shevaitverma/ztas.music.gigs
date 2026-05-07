import { apiClient } from './client'
import type { PaginatedData } from '@/lib/types'
import type {
  ApproveVerificationInput,
  RejectVerificationInput,
  VerificationKind,
} from '@/lib/schemas/verification'
import type {
  VerificationDetail,
  VerificationListItem,
  VerificationStatus,
} from '@/lib/types'

export interface ListVerificationsParams {
  type?: VerificationKind
  status?: VerificationStatus
  page?: number
  limit?: number
}

/**
 * Server contract (discovered):
 * - GET    /verification/admin/list?type&status&page&limit
 * - GET    /verification/admin/:id/:type
 * - POST   /verification/admin/approve   { verificationId, section, venueId?, notes? }
 * - POST   /verification/admin/reject    { verificationId, section, venueId?, reason }
 * - POST   /verification/admin/professional (artist only — not used in queue UI yet)
 *
 * NOTE: The server returns PII fields pre-masked (numberMasked, panMasked, gstMasked,
 * accountNumberMasked, ifscMasked). Document/selfie URLs are short-lived presigned S3
 * URLs (5 min). There is NO separate "reveal full PII" endpoint — masked is the source
 * of truth. The PiiField "Reveal" UX therefore reveals what the server returned (last 4),
 * which is already safe.
 */
export const verificationsApi = {
  listPending: async (
    params: ListVerificationsParams = {}
  ): Promise<PaginatedData<VerificationListItem>> => {
    const response = await apiClient.get<PaginatedData<VerificationListItem>>(
      '/verification/admin/list',
      {
        params: {
          status: params.status ?? 'pending',
          ...(params.type ? { type: params.type } : {}),
          page: params.page ?? 1,
          limit: params.limit ?? 20,
        },
      }
    )
    return response.data
  },

  getById: async (id: string, type: VerificationKind): Promise<VerificationDetail> => {
    const response = await apiClient.get<VerificationDetail>(
      `/verification/admin/${id}/${type}`
    )
    return response.data
  },

  approve: async (input: ApproveVerificationInput): Promise<{ success: boolean }> => {
    const response = await apiClient.post<{ success: boolean }>(
      '/verification/admin/approve',
      input
    )
    return response.data
  },

  reject: async (input: RejectVerificationInput): Promise<{ success: boolean }> => {
    const response = await apiClient.post<{ success: boolean }>(
      '/verification/admin/reject',
      input
    )
    return response.data
  },
}

export const verificationQueryKeys = {
  all: ['verifications'] as const,
  pending: (params?: ListVerificationsParams) =>
    params ? (['verifications', 'pending', params] as const) : (['verifications', 'pending'] as const),
  detail: (id: string, type: VerificationKind) =>
    ['verifications', id, type] as const,
}
