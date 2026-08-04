// Centralised outbound links to the marketing site.
//
// The legal pages live in `landing/` only — one copy, so they can't drift.
// Default matches the canonical URLs landing publishes in its own sitemap.
export const LANDING_URL =
  process.env.NEXT_PUBLIC_LANDING_URL || 'https://gigs.ztas.in'

export const TERMS_URL = `${LANDING_URL}/terms`
export const PRIVACY_URL = `${LANDING_URL}/privacy`

// The admin console is a separate Next app (`admin/`, dev port :3001). Several
// places route ADMIN users to `/admin`, which is not a route in this app —
// `app/admin/page.tsx` redirects there instead of 404ing.
//
// The localhost fallback is dev-only on purpose. `NEXT_PUBLIC_*` is inlined at
// build time, so a production build made without NEXT_PUBLIC_ADMIN_URL used to
// ship `http://localhost:3001` and silently send real admins nowhere. Empty in
// production is loud (the page says "not configured") instead of silent.
export const ADMIN_URL =
  process.env.NEXT_PUBLIC_ADMIN_URL ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001')
