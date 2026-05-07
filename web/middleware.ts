import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that require authentication
const protectedRoutes = ['/artist', '/client', '/admin', '/onboarding']

// Routes that should redirect to dashboard if already authenticated
const authRoutes = ['/login', '/register']

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1'

const ME_FETCH_TIMEOUT_MS = 3000

/**
 * Forward the incoming Cookie header to the server's /auth/me endpoint to
 * determine whether the current request carries a valid session. The actual
 * cookie values are httpOnly, so we cannot read them in middleware — we just
 * relay the header verbatim.
 *
 * Returns:
 *   - true  → server returned 200 (authenticated)
 *   - false → server returned 401/403 (unauthenticated)
 *   - null  → network error / 5xx (caller decides what to do — see below)
 */
async function isAuthenticated(request: NextRequest): Promise<boolean | null> {
  const cookieHeader = request.headers.get('cookie') ?? ''
  if (!cookieHeader) {
    // No cookies at all → definitely not authenticated; skip the round-trip.
    return false
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ME_FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      signal: controller.signal,
      // Edge runtime fetch: don't cache; auth state is per-request/per-user.
      cache: 'no-store',
    })

    if (res.status === 200) return true
    if (res.status === 401 || res.status === 403) return false
    // 5xx or other unexpected status → ambiguous.
    return null
  } catch {
    // Network error / abort → ambiguous.
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  )
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))

  // Fast path: nothing to enforce on this route.
  if (!isProtectedRoute && !isAuthRoute) {
    return NextResponse.next()
  }

  const authed = await isAuthenticated(request)

  // Failure-mode policy (documented):
  //   - On a protected route, ambiguous result (5xx/network) → redirect to
  //     /login. Better to send the user through the login flow than to render
  //     a dashboard that's about to make failing API calls.
  //   - On an auth route (login/register), ambiguous result → let through.
  //     The user can attempt to sign in; if they're already logged in, the
  //     next navigation will redirect them.
  if (isProtectedRoute) {
    if (authed === true) return NextResponse.next()
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthRoute) {
    if (authed === true) {
      // Common landing — actual role-based redirect happens client-side once
      // /auth/me is fetched.
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|manifest\\.json).*)',
  ],
}
