import { redirect } from 'next/navigation'
import { ADMIN_URL } from '@/lib/links'

/**
 * `/admin` is not part of this app — the admin console is a separate Next app.
 * Three places route ADMIN users here (app/page.tsx, login, register), and all
 * three 404'd. Redirecting in one place fixes every caller.
 *
 * `force-dynamic` is load-bearing: statically prerendered, this froze the
 * build-time value of NEXT_PUBLIC_ADMIN_URL (i.e. the localhost:3001 fallback)
 * into admin.html and shipped it to production. Resolve it per request.
 */
export const dynamic = 'force-dynamic'

export default function AdminRedirectPage() {
  if (!ADMIN_URL) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold text-foreground mb-2">
            Admin console not configured
          </h1>
          <p className="text-foreground-muted">
            This deployment was built without <code>NEXT_PUBLIC_ADMIN_URL</code>. Set it and
            rebuild to reach the admin console.
          </p>
        </div>
      </div>
    )
  }
  redirect(ADMIN_URL)
}
