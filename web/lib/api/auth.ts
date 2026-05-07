import { apiClient } from './client'
import type { LoginResponse, User, UserRole } from '@/lib/types'

/**
 * Tolerate both wire shapes: a `{ success, data, ... }` envelope produced by
 * the server's transformPlugin AND a flat payload (some routes return early
 * without going through the plugin). If `body.data` looks like our payload
 * (has any expected key), use it; otherwise fall back to the body itself.
 */
function unwrap<T>(body: any): T {
  if (body && typeof body === 'object' && 'data' in body && body.data && typeof body.data === 'object') {
    return body.data as T
  }
  return body as T
}

// Extended login response with isNewUser flag
export type AuthResponse = LoginResponse & { isNewUser?: boolean }

/**
 * Provider-supplied profile data echoed back when the backend doesn't yet
 * have a role on file for the authenticating user. Mirrors the server's
 * `requiresRole` payload.
 */
export interface ProviderProfile {
  email?: string
  phoneNumber?: string
  displayName?: string
}

/**
 * Returned by /auth/{google,phone}/verify when the account exists at the
 * Firebase layer but has no role yet. The frontend must collect a role and
 * POST it back to /auth/complete-signup along with the short-lived
 * `signupToken` to finish account creation.
 */
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
   * Phone OTP verification - Firebase token goes in header.
   * Resolves with either a full AuthResponse OR a RequiresRoleResponse when
   * the account has no role yet (HTTP 200, structured payload — not a throw).
   */
  // TODO(wire-shape): phone verify currently sends Firebase token via X-Firebase-Token header
  // while google verify uses body { idToken }. Align by moving phone to body once server accepts it.
  verifyPhone: async (
    idToken: string,
    phoneNumber: string,
    role?: UserRole,
    name?: string
  ): Promise<VerifyResponse> => {
    const response = await apiClient.post<VerifyResponse>(
      '/auth/phone/verify',
      { phoneNumber, role, name },
      {
        headers: {
          'X-Firebase-Token': idToken,
          // Do NOT attach a stale access token — a partially-logged-in user
          // re-verifying a phone could otherwise be authenticated server-side
          // as a different user. The client interceptor strips this marker.
          'X-Skip-Auth': 'true',
        },
      }
    )
    return unwrap<VerifyResponse>(response)
  },

  /**
   * Google sign-in verification - idToken goes in body.
   * Resolves with either a full AuthResponse OR a RequiresRoleResponse when
   * the account has no role yet (HTTP 200, structured payload — not a throw).
   */
  verifyGoogle: async (
    idToken: string,
    role?: UserRole,
    name?: string
  ): Promise<VerifyResponse> => {
    const response = await apiClient.post<VerifyResponse>(
      '/auth/google/verify',
      {
        idToken,
        role,
        name,
      },
      {
        headers: {
          // See note in verifyPhone — never send Bearer to the verify endpoint.
          'X-Skip-Auth': 'true',
        },
      }
    )
    return unwrap<VerifyResponse>(response)
  },

  /**
   * Complete signup for an account that came back with `requiresRole: true`.
   * Exchanges the short-lived signupToken plus a chosen role (and any other
   * profile fields) for a normal { accessToken, refreshToken, user } payload.
   */
  completeSignup: async (input: {
    signupToken: string
    role: UserRole
    name?: string
  }): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>(
      '/auth/complete-signup',
      input,
      {
        headers: {
          // No Bearer — this endpoint authenticates via the signupToken in body.
          'X-Skip-Auth': 'true',
        },
      }
    )
    return unwrap<AuthResponse>(response)
  },

  /**
   * Refresh access token
   */
  refresh: async (refreshToken: string): Promise<{ accessToken: string }> => {
    const response = await apiClient.post<{ accessToken: string }>('/auth/refresh', {
      refreshToken,
    })
    return unwrap<{ accessToken: string }>(response)
  },

  /**
   * Logout current user
   */
  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout')
  },

  /**
   * Get current authenticated user
   */
  getMe: async (): Promise<User> => {
    const response = await apiClient.get<User>('/auth/me')
    return unwrap<User>(response)
  },

  /**
   * Fetch a short-lived (~30s) WebSocket ticket. The browser cannot attach
   * httpOnly cookies to a WebSocket handshake's Authorization header, so we
   * exchange the cookie session for a single-use ticket and pass that as a
   * `?ticket=...` query param on the WS URL. Each reconnect must fetch a new
   * ticket — they expire fast on purpose.
   */
  getWsTicket: async (): Promise<{ ticket: string }> => {
    const response = await apiClient.get<{ ticket: string }>('/auth/ws-ticket')
    return unwrap<{ ticket: string }>(response)
  },
}
