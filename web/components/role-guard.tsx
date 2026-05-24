'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAtomValue } from 'jotai'
import { userAtom } from '@/lib/atoms'
import { useAuth } from '@/lib/providers'

type Role = 'ARTIST' | 'CLIENT' | 'ADMIN'

interface RoleGuardProps {
  role: Role
  fallback?: string
  children: React.ReactNode
}

/**
 * Gate a subtree on the current user's role. Reads `userAtom` directly so this
 * stays usable outside of an AuthProvider tree, but also uses `useAuth` to know
 * when the initial /auth/me bootstrap is still in flight (to avoid bouncing
 * the user to /login before we know whether they have a session).
 */
export function RoleGuard({ role, fallback = '/login', children }: RoleGuardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const user = useAtomValue(userAtom)
  const { isLoading, isAuthenticated } = useAuth()

  const currentRole = user?.role?.toUpperCase()
  const isAdmin = currentRole === 'ADMIN'
  const canAccess = currentRole === role || isAdmin

  // Where to redirect when the user is logged in but with the wrong role.
  // ADMIN always passes; the only mismatched-role case is ARTIST↔CLIENT.
  const wrongRoleRedirect = role === 'ARTIST' ? '/client' : '/artist'

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      const isAuthPath =
        !pathname ||
        pathname === '/login' ||
        pathname === '/register' ||
        pathname.startsWith('/onboarding')
      if (fallback === '/login' && !isAuthPath) {
        router.replace('/login?next=' + encodeURIComponent(pathname))
      } else {
        router.replace(fallback)
      }
      return
    }

    if (!canAccess) {
      router.replace(wrongRoleRedirect)
    }
  }, [canAccess, isAuthenticated, isLoading, router, fallback, wrongRoleRedirect, pathname])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated || !canAccess) {
    return null
  }

  return <>{children}</>
}
