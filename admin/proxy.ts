import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const AUTH_ROUTES = ['/login']
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1'
const ME_FETCH_TIMEOUT_MS = 3000

interface MeUser {
  id?: string
  role?: string
  [k: string]: unknown
}

interface MeResult {
  status: 'authed-admin' | 'authed-not-admin' | 'unauthed' | 'ambiguous'
}

/**
 * Forwards the incoming Cookie header to /auth/me. Cookies are httpOnly so
 * middleware cannot inspect them; we relay verbatim and inspect the response.
 *
 * The server returns an ApiResponse-shaped body; we look at `data.role` to
 * decide whether the user is an admin. Mere cookie presence is NOT enough.
 */
async function checkAuth(request: NextRequest): Promise<MeResult> {
  const cookieHeader = request.headers.get('cookie') ?? ''
  if (!cookieHeader) return { status: 'unauthed' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ME_FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      signal: controller.signal,
      cache: 'no-store',
    })

    if (res.status === 200) {
      try {
        const body = (await res.json()) as { data?: MeUser } | MeUser
        // Tolerate either a raw user or { success, data: user } envelope.
        const user: MeUser | undefined =
          body && typeof body === 'object' && 'data' in body ? body.data : (body as MeUser)
        if (user?.role === 'admin') return { status: 'authed-admin' }
        return { status: 'authed-not-admin' }
      } catch {
        return { status: 'ambiguous' }
      }
    }
    if (res.status === 401 || res.status === 403) return { status: 'unauthed' }
    return { status: 'ambiguous' }
  } catch {
    return { status: 'ambiguous' }
  } finally {
    clearTimeout(timeout)
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))

  const result = await checkAuth(request)

  if (isAuthRoute) {
    // /login: send admins to dashboard, let everyone else through.
    if (result.status === 'authed-admin') {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  // Protected (everything else matched by config below).
  if (result.status === 'authed-admin') return NextResponse.next()

  if (result.status === 'authed-not-admin') {
    const url = new URL('/login', request.url)
    url.searchParams.set('error', 'not_admin')
    return NextResponse.redirect(url)
  }

  // unauthed or ambiguous → /login. Better to bounce than render a dashboard
  // that can't talk to the backend.
  const url = new URL('/login', request.url)
  if (pathname !== '/') url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    // Skip Next internals, static assets, and any path with an extension.
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|manifest\\.json).*)',
  ],
}
