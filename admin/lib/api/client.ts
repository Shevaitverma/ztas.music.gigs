import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios'
import type { ApiError, ApiResponse } from '@/lib/types'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1'

/** Custom API error with user-friendly messages. */
export class ApiClientError extends Error {
  public statusCode: number
  public code: string
  public details?: unknown

  constructor(message: string, statusCode: number, code = 'UNKNOWN_ERROR', details?: unknown) {
    super(message)
    this.name = 'ApiClientError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }

  static fromAxiosError(error: AxiosError<ApiError>): ApiClientError {
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        return new ApiClientError('Request timed out. Please try again.', 0, 'TIMEOUT')
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
    let serverMessage: string | null = null
    if (data?.message) serverMessage = data.message
    else if (typeof data?.error === 'string') serverMessage = data.error
    else if (data && typeof data === 'object' && 'error' in data && data.error && typeof data.error === 'object' && 'message' in data.error)
      serverMessage = (data.error as { message: string }).message
    else if (typeof data === 'string') serverMessage = data

    switch (status) {
      case 400:
        return new ApiClientError(serverMessage || 'Invalid request.', status, 'BAD_REQUEST', data)
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
          'Server error. Please try again later.',
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
          serverMessage || `Request failed (Error ${status}).`,
          status,
          'UNKNOWN_ERROR',
          data
        )
    }
  }
}

// Singleflight refresh: only one /auth/refresh roundtrip when N requests get 401.
let refreshPromise: Promise<void> | null = null

class ApiClient {
  private client: AxiosInstance

  private async clearAuthAndRedirect() {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2000)
      await axios
        .post(`${API_BASE_URL}/auth/logout`, undefined, {
          withCredentials: true,
          signal: controller.signal,
        })
        .catch(() => {})
        .finally(() => clearTimeout(timeout))
    } catch {
      /* ignore */
    }

    try {
      const [{ getDefaultStore }, { userAtom }] = await Promise.all([
        import('jotai'),
        import('@/lib/atoms/auth'),
      ])
      getDefaultStore().set(userAtom, null)
    } catch {
      /* best-effort */
    }

    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
      withCredentials: true,
    })

    this.client.interceptors.request.use(
      (config) => {
        if (config.headers && config.headers['X-Skip-Auth'] === 'true') {
          delete config.headers['X-Skip-Auth']
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiError>) => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

        if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
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
            void this.clearAuthAndRedirect()
            throw new ApiClientError(
              'Session expired. Please sign in again.',
              401,
              'SESSION_EXPIRED'
            )
          }
        }

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
