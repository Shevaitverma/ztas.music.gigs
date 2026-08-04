import { apiClient } from './client'
import type { Review, ReviewStats, CreateReviewInput, PaginatedData } from '@/lib/types'

export const reviewsApi = {
  /** Gig must be COMPLETED and the caller a participant. One review per direction. */
  create: async (data: CreateReviewInput): Promise<Review> => {
    const response = await apiClient.post<Review>('/reviews', data)
    return response.data
  },

  getById: async (id: string) => {
    return apiClient.get<Review>(`/reviews/${id}`)
  },

  getUserReviews: async (userId: string, params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value))
        }
      })
    }
    // Server paginates this endpoint: { data: Review[], meta: {...} }.
    return apiClient.get<PaginatedData<Review>>(
      `/reviews/user/${userId}?${searchParams.toString()}`
    )
  },

  getUserStats: async (userId: string) => {
    return apiClient.get<ReviewStats>(`/reviews/user/${userId}/stats`)
  },

  getGigReviews: async (gigId: string): Promise<Review[]> => {
    const response = await apiClient.get<Review[]>(`/reviews/gig/${gigId}`)
    return response.data
  },

  update: async (id: string, data: Partial<CreateReviewInput>) => {
    return apiClient.put<Review>(`/reviews/${id}`, data)
  },

  // Server body schema is { comment } (ReviewResponseSchema), not { response }.
  respond: async (id: string, comment: string) => {
    return apiClient.post<Review>(`/reviews/${id}/response`, { comment })
  },

  flag: async (id: string, reason: string) => {
    return apiClient.post(`/reviews/${id}/flag`, { reason })
  },

  delete: async (id: string) => {
    return apiClient.delete(`/reviews/${id}`)
  },
}
