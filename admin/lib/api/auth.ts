import { apiClient } from './client'
import type { LoginResponse, User } from '@/lib/types'

export type AuthResponse = LoginResponse

export interface ProviderProfile {
  email?: string
  phoneNumber?: string
  displayName?: string
}

export interface RequiresRoleResponse {
  requiresRole: true
  signupToken: string
  providerProfile: ProviderProfile
}

export type VerifyResponse = AuthResponse | RequiresRoleResponse

export function isRequiresRoleResponse(
  response: VerifyResponse
): response is RequiresRoleResponse {
  return 'requiresRole' in response && response.requiresRole === true
}

export const authApi = {
  /**
   * Verify a Firebase phone OTP. Admin signup is NOT supported here — if the
   * server reports `requiresRole`, the UI must reject login.
   */
  verifyPhone: async (idToken: string, phoneNumber: string): Promise<VerifyResponse> => {
    const response = await apiClient.post<VerifyResponse>(
      '/auth/phone/verify',
      { phoneNumber },
      {
        headers: {
          'X-Firebase-Token': idToken,
          'X-Skip-Auth': 'true',
        },
      }
    )
    return response.data
  },

  /** Verify a Google sign-in id token. */
  verifyGoogle: async (idToken: string): Promise<VerifyResponse> => {
    const response = await apiClient.post<VerifyResponse>(
      '/auth/google/verify',
      { idToken },
      { headers: { 'X-Skip-Auth': 'true' } }
    )
    return response.data
  },

  me: async (): Promise<User> => {
    const response = await apiClient.get<User>('/auth/me')
    return response.data
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout')
  },

  getWsTicket: async (): Promise<{ ticket: string }> => {
    const response = await apiClient.get<{ ticket: string }>('/auth/ws-ticket')
    return response.data
  },
}
