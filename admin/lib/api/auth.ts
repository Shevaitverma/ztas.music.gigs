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
