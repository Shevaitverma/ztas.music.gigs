'use client'

import { useAtom } from 'jotai'
import { type ReactNode, useEffect } from 'react'
import { authApi } from '@/lib/api/auth'
import { userAtom } from '@/lib/atoms/auth'

/**
 * Hydrate the in-memory userAtom from /auth/me whenever the dashboard mounts
 * without a cached user (e.g. on hard reload). Middleware has already ensured
 * we have an admin session, so a 401 here means cookies expired between
 * middleware and the client mount — let the api client's refresh interceptor
 * handle it.
 */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const [user, setUser] = useAtom(userAtom)

  useEffect(() => {
    if (user) return
    let cancelled = false
    authApi
      .me()
      .then((u) => {
        if (!cancelled) setUser(u)
      })
      .catch(() => {
        /* interceptor handles redirect on hard 401 */
      })
    return () => {
      cancelled = true
    }
  }, [user, setUser])

  return <>{children}</>
}
