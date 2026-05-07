'use client'

import { createContext, useContext, useCallback, type ReactNode } from 'react'
import { useAtom } from 'jotai'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { userAtom } from '@/lib/atoms'
import { authApi } from '@/lib/api'
import type { User, AuthTokens } from '@/lib/types'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  // `tokens` is accepted for backwards compatibility with existing call sites
  // (login pages pass through what verifyPhone/verifyGoogle return), but the
  // tokens are no longer stored client-side — the server set httpOnly cookies
  // on the verify response and those carry auth from here on.
  login: (tokens: AuthTokens, user: User) => void
  logout: () => Promise<void>
  refetchUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useAtom(userAtom)
  const queryClient = useQueryClient()

  // Bootstrap: always attempt to fetch /auth/me on mount. Cookies (if any)
  // travel automatically. If 401, the user is simply logged out — no redirect
  // is fired here; the middleware handles route protection.
  const { refetch, isPending } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        const userData = await authApi.getMe()
        setUser(userData)
        return userData
      } catch (err: any) {
        // Only treat actual auth failures (401/403) as "session is dead".
        // Transient 5xx / network blips during a refocus refetch must not
        // log the user out.
        const status =
          err?.statusCode ??
          err?.response?.status ??
          err?.status
        if (status === 401 || status === 403) {
          setUser(null)
          return null
        }
        // Re-throw so react-query records it as a query error; the user
        // stays logged in and the query can retry on next focus/mount.
        throw err
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: true,
  })

  const login = useCallback(
    (_tokens: AuthTokens, userData: User) => {
      // Tokens are already stored as httpOnly cookies by the server response
      // that produced these values; we just need to update the in-memory user.
      setUser(userData)
    },
    [setUser]
  )

  const logout = useCallback(async () => {
    // Best-effort: tell the server to clear cookies + revoke refresh token.
    // We bound this to ~2s so a hung backend doesn't block the redirect.
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2000)
      await Promise.race([
        authApi.logout(),
        new Promise((_, reject) =>
          controller.signal.addEventListener('abort', () => reject(new Error('timeout')))
        ),
      ]).catch(() => {
        /* ignore — proceed regardless */
      })
      clearTimeout(timeout)
    } catch {
      /* ignore */
    }

    setUser(null)
    queryClient.clear()

    // Navigate to /login. Use a hard nav so any stale in-memory state in
    // sibling components (react-query, hooks holding refs) is cleared too.
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }, [queryClient, setUser])

  const refetchUser = useCallback(async () => {
    await refetch()
  }, [refetch])

  // Loading only during the initial /auth/me fetch when we have no user yet.
  // Once we know whether or not the cookie was valid, we're done loading.
  const isLoading = isPending && !user

  const isAuthenticated = !!user

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        login,
        logout,
        refetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
