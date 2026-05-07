import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios'
import type { ApiError, ApiResponse } from '@/lib/types'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1'

/**
 * Custom API Error class with user-friendly messages
 */
export class ApiClientError extends Error {
  public statusCode: number
  public code: string
  public details?: unknown

  constructor(message: string, statusCode: number, code: string = 'UNKNOWN_ERROR', details?: unknown) {
    super(message)
    this.name = 'ApiClientError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }

  /**
   * Create from Axios error with user-friendly message
   */
  static fromAxiosError(error: AxiosError<ApiError>): ApiClientError {
    // Network errors (no response)
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        return new ApiClientError(
          'Request timed out. Please check your connection and try again.',
          0,
          'TIMEOUT'
        )
      }
      if (error.code === 'ERR_NETWORK' || error.message.includes('Network Error')) {
        return new ApiClientError(
          'Unable to connect to server. Please check if the backend is running.',
          0,
          'NETWORK_ERROR'
        )
      }
      return new ApiClientError(
        'Connection failed. Please check your internet connection.',
        0,
        'CONNECTION_ERROR'
      )
    }

    const status = error.response.status
    const data = error.response.data

    // Extract message from various response formats
    let serverMessage: string | null = null
    if (data?.message) {
      serverMessage = data.message
    } else if (typeof data?.error === 'string') {
      serverMessage = data.error
    } else if (data?.error?.message) {
      serverMessage = data.error.message
    } else if (typeof data === 'string') {
      serverMessage = data
    }

    // Map status codes to user-friendly messages
    switch (status) {
      case 400:
        return new ApiClientError(
          serverMessage || 'Invalid request. Please check your input and try again.',
          status,
          'BAD_REQUEST',
          data
        )
      case 401:
        return new ApiClientError(
          serverMessage || 'Authentication failed. Please sign in again.',
          status,
          'UNAUTHORIZED'
        )
      case 403:
        return new ApiClientError(
          serverMessage || 'You do not have permission to perform this action.',
          status,
          'FORBIDDEN'
        )
      case 404:
        return new ApiClientError(
          serverMessage || 'The requested resource was not found.',
          status,
          'NOT_FOUND'
        )
      case 409:
        return new ApiClientError(
          serverMessage || 'This action conflicts with existing data.',
          status,
          'CONFLICT'
        )
      case 422:
        return new ApiClientError(
          serverMessage || 'Validation failed. Please check your input.',
          status,
          'VALIDATION_ERROR',
          data
        )
      case 429:
        return new ApiClientError(
          'Too many requests. Please wait a moment and try again.',
          status,
          'RATE_LIMITED'
        )
      case 500:
        return new ApiClientError(
          'Server error. Our team has been notified. Please try again later.',
          status,
          'SERVER_ERROR'
        )
      case 502:
      case 503:
      case 504:
        return new ApiClientError(
          'Service temporarily unavailable. Please try again in a few moments.',
          status,
          'SERVICE_UNAVAILABLE'
        )
      default:
        return new ApiClientError(
          serverMessage || `Request failed (Error ${status}). Please try again.`,
          status,
          'UNKNOWN_ERROR',
          data
        )
    }
  }
}

// Module-level singleflight state for refresh-token requests.
// When N parallel requests get 401, only the first triggers a refresh; the
// rest await the in-flight promise and retry. With httpOnly cookies the
// server sets the new cookies on the refresh response automatically.
let refreshPromise: Promise<void> | null = null

class ApiClient {
  private client: AxiosInstance

  /**
   * Logs the user out by calling the server's logout endpoint (best-effort,
   * 2s timeout), clearing in-memory user state via jotai's default store, and
   * navigating to /login. Cookies are cleared server-side.
   */
  private async clearAuthAndRedirect() {
    // Fire-and-forget logout with a 2s ceiling so a hung backend doesn't
    // delay the redirect. We dynamically import to avoid pulling jotai/atoms
    // into this file's static graph (and to keep this method usable from
    // contexts that don't have a React tree).
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2000)
      await axios
        .post(
          `${API_BASE_URL}/auth/logout`,
          undefined,
          { withCredentials: true, signal: controller.signal }
        )
        .catch(() => {
          /* ignore — we're logging out anyway */
        })
        .finally(() => clearTimeout(timeout))
    } catch {
      // ignore — proceed with client-side cleanup
    }

    try {
      const [{ getDefaultStore }, { userAtom }] = await Promise.all([
        import('jotai'),
        import('@/lib/atoms/auth'),
      ])
      getDefaultStore().set(userAtom, null)
    } catch {
      // best-effort
    }

    // Navigate immediately — a deferred redirect leaves a window where a
    // follow-up request can fire without a session. Skip if we're already on
    // the login page to avoid a reload→bootstrap→401→redirect loop.
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
  }

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
      // Cookies (httpOnly accessToken/refreshToken) now carry auth on every
      // request. The server is configured with CORS credentials: true and
      // explicit origins (see cross-team contract).
      withCredentials: true,
    })

    // Request interceptor.
    // Auth is now carried by httpOnly cookies set by the server; we no longer
    // attach an Authorization: Bearer header. The X-Skip-Auth marker is kept
    // (and stripped here) so callers that previously opted out of Bearer keep
    // working — it's effectively a no-op for cookie-based auth, but the verify
    // endpoints still set it and removing it would be a noisy diff.
    this.client.interceptors.request.use(
      (config) => {
        if (config.headers && config.headers['X-Skip-Auth'] === 'true') {
          delete config.headers['X-Skip-Auth']
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor for token refresh and error handling.
    // On 401, we hit /auth/refresh once (singleflight). The server reads the
    // refreshToken cookie and rotates both cookies on the response — there
    // are no token strings to thread through in JS.
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiError>) => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

        // Skip refresh-and-retry for the auth endpoints themselves — a 401
        // from /auth/me, /auth/refresh, or /auth/logout must not trigger
        // another refresh (causes a reload loop on the login page when there's
        // no valid session cookie).
        const reqUrl = originalRequest.url || ''
        const isAuthEndpoint =
          reqUrl.includes('/auth/me') ||
          reqUrl.includes('/auth/refresh') ||
          reqUrl.includes('/auth/logout')

        if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
          originalRequest._retry = true

          if (!refreshPromise) {
            refreshPromise = (async () => {
              await axios.post(
                `${API_BASE_URL}/auth/refresh`,
                {},
                { withCredentials: true }
              )
            })().finally(() => {
              refreshPromise = null
            })
          }

          try {
            await refreshPromise
            return this.client(originalRequest)
          } catch {
            // Refresh failed for everyone — clear auth once and redirect.
            void this.clearAuthAndRedirect()
            throw new ApiClientError('Session expired. Please sign in again.', 401, 'SESSION_EXPIRED')
          }
        }

        // Transform to user-friendly error
        throw ApiClientError.fromAxiosError(error)
      }
    )
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.get<ApiResponse<T>>(url, config)
    return response.data
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.post<ApiResponse<T>>(url, data, config)
    return response.data
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.put<ApiResponse<T>>(url, data, config)
    return response.data
  }

  async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.patch<ApiResponse<T>>(url, data, config)
    return response.data
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.delete<ApiResponse<T>>(url, config)
    return response.data
  }
}

export const apiClient = new ApiClient()
