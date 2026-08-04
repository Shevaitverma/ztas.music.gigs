import { apiClient, ApiClientError } from './client'
import type { CheckIn, OtpInfo } from '@/lib/types'

/**
 * Event check-in API.
 *
 * State machine (server/src/modules/checkin/checkin.service.ts):
 *   PENDING -> CHECKED_IN -> EVENT_STARTED -> EVENT_ENDED
 *
 * Role rules enforced by the server:
 *   generate-otp / otp / start-event / cancel -> organizer (CLIENT) only
 *   verify-otp                                -> booked ARTIST only
 *   end-event                                 -> either party, BOTH must confirm
 *   status                                    -> either party
 */
/**
 * Statuses where the record can still change without the current user acting,
 * so the UI polls. Bids have a websocket (`useBidsSocket`); check-in doesn't.
 *
 * ponytail: 10s poll during an event instead of a socket channel — swap for a
 * server push if check-in latency or poll volume ever matters.
 */
export const CHECKIN_LIVE_STATUSES = ['PENDING', 'CHECKED_IN', 'EVENT_STARTED']

export const checkinApi = {
  /** Organizer. BOOKED gigs only, from 30 min before start. Max 3 regenerations. */
  generateOtp: async (gigId: string): Promise<CheckIn> => {
    const response = await apiClient.post<CheckIn>(`/checkin/generate-otp/${gigId}`)
    return response.data
  },

  /** Organizer. `getStatus` already carries the OTP for the organizer — use this
   *  only when you specifically need expiry/regeneration counters. */
  getOtp: async (gigId: string): Promise<OtpInfo> => {
    const response = await apiClient.get<OtpInfo>(`/checkin/otp/${gigId}`)
    return response.data
  },

  /**
   * Artist. `location` is REQUIRED by the server schema (VerifyOtpSchema) — it
   * checks the point against the venue's geoPoint. Omitting it 422s.
   */
  verifyOtp: async (
    gigId: string,
    otp: string,
    location: { lat: number; lng: number }
  ): Promise<CheckIn> => {
    const response = await apiClient.post<CheckIn>('/checkin/verify-otp', {
      gigId,
      otp,
      location,
    })
    return response.data
  },

  /** Organizer. Requires status CHECKED_IN. */
  startEvent: async (gigId: string): Promise<CheckIn> => {
    const response = await apiClient.post<CheckIn>(`/checkin/start-event/${gigId}`)
    return response.data
  },

  /** Either party. Requires status EVENT_STARTED; gig completes once both confirm. */
  endEvent: async (gigId: string): Promise<CheckIn> => {
    const response = await apiClient.post<CheckIn>(`/checkin/end-event/${gigId}`)
    return response.data
  },

  /** Organizer. Only before the event has started; cascades into a gig cancel. */
  cancel: async (gigId: string): Promise<CheckIn> => {
    const response = await apiClient.post<CheckIn>(`/checkin/cancel/${gigId}`)
    return response.data
  },

  /** Either party. */
  getStatus: async (gigId: string): Promise<CheckIn> => {
    const response = await apiClient.get<CheckIn>(`/checkin/status/${gigId}`)
    return response.data
  },

  /**
   * `getStatus`, but "no check-in record yet" (404) resolves to null instead of
   * throwing. That is the normal state for a freshly booked gig, so callers
   * should not have to treat it as an error.
   */
  getStatusOrNull: async (gigId: string): Promise<CheckIn | null> => {
    try {
      return await checkinApi.getStatus(gigId)
    } catch (error) {
      if (error instanceof ApiClientError && error.statusCode === 404) return null
      throw error
    }
  },
}
