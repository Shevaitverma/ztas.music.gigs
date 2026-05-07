# ZTS Music Platform — Project Context

This file captures the engineering context for the three repos under this directory so a fresh clone has everything needed to onboard. Last updated: 2026-05-07.

## Repos

```
project music/
├── ai.zts.music.server/    Bun + Elysia + MongoDB Atlas + Firebase Admin SDK   :8080
├── zts-music-frontend/     Next.js 16 (App Router, Turbopack) + React 19       :3000
└── ai.zts.music.admin/     Next.js 16 admin panel (auth + 3 moderation         :3001
                            surfaces wired end-to-end)
```

## What it is (one line)

A gig-bidding marketplace where music **artists** bid on gigs posted by **clients** (event organizers), with OTP-based event check-in for ground truth, KYC verification, and an admin tier for moderation/verification.

Domain vocab: `UserRole = 'client' | 'artist' | 'admin'`. `AdminRole = 'SUPER_ADMIN' | 'MODERATOR' | 'VERIFIER' | 'ANALYST'`. Core entities: `Gig`, `Bid`, `OrganizerVerification`, `ArtistVerification`, `EventCheckIn`, `Review`, `Notification`, `Report`.

## Business model summary

**Pricing primitive:** reverse auction — clients post a max budget, artists bid lower with proposals. **Take rate (planned, unimplemented):** % commission on completed bookings (default 10%, optional tiered: 15% under ₹10k → 8% above ₹100k). **Geography:** India-only signals throughout (Aadhaar/PAN/GST, INR, Mumbai sample data, Bollywood/Sufi/Ghazal genres). **Maturity:** late MVP / pre-launch. Payments + escrow + KYC verification flow + notifications are scaffolded but not wired.

**Strongest moats baked in code:** OTP check-in + dual end-event confirmation gating payment release; India-specific KYC at both sides (Aadhaar/PAN/GST + UPI payouts); structured escrow + dispute states (PENDING_PAYMENT → ESCROW → RELEASED/DISPUTED/REFUNDED); two-way reviews with sub-ratings + moderation pipeline.

**Strategic concerns** (from a 2026-05-07 evaluation pass): reverse-auction is the wrong primitive for quality-supply — top artists refuse bidding wars. Disintermediation risk is fatal in low-frequency-buyer events (weddings) unless the platform owns insurance/guarantees. The whole monetization spine is unbuilt. Recommended pivot: fixed-quote with optional negotiation, keep escrow+OTP+review moat, add supply-side subscription on top of commission.

**Closest analogue globally:** Poptop (UK) — quote-based marketplace with ~10–20% commission on confirmed bookings.

## Architecture decisions (don't relitigate without reason)

### Authentication (httpOnly cookies)
- Login flow: Firebase Web SDK → Firebase ID token → backend `/auth/phone/verify` or `/auth/google/verify` → backend issues JWT access (1h) + refresh (7d).
- Tokens are returned BOTH as JSON `{ accessToken, refreshToken }` AND set as httpOnly `Secure SameSite=Lax` cookies (additive). The cookie path is the source of truth going forward; the JSON path remains for backward compat.
- Server's auth derive accepts `Authorization: Bearer` OR `accessToken` cookie. Refresh accepts cookie OR body.
- Frontend uses `axios.withCredentials: true` and does NOT store tokens in localStorage. The Bearer request interceptor was removed.
- Frontend `middleware.ts` does a server-side `fetch /auth/me` with the incoming `Cookie:` header forwarded (3s `AbortController` timeout, `cache: 'no-store'`). On 200 the user passes; on 401 they redirect to `/login?next=<path>`.
- Admin's `proxy.ts` does the same `/auth/me` round-trip AND additionally asserts `user.role === 'admin'`. Non-admin authed users get bounced to `/login?error=not_admin`.

### New-user signup (structured response)
- Verify endpoints return `200` with `{ requiresRole: true, signupToken, providerProfile }` when the user has no account. The `signupToken` is a 10-min `type:'signup'` JWT (HS256, `JWT_SECRET`).
- Frontend detects `'requiresRole' in response` and routes to role selection, then calls `POST /auth/complete-signup` with `{ signupToken, role: 'client' | 'artist', name? }`.
- The server's auth derive rejects signup tokens (`payload.type` must be `'access'`).
- Admin login NEVER hits the signup path — if `requiresRole` comes back, the admin login UI shows "Account not found. Contact your administrator." Admin accounts are minted server-side only.

### WebSocket auth (ws-ticket)
- Browsers can't set headers on the `WebSocket` constructor. Instead of putting the long-lived access token in the URL, the frontend calls `GET /auth/ws-ticket` (cookies travel) → 30-second `type:'ws-ticket'` JWT → uses it as `?ticket=<jwt>` on the WS URL.
- Server WS gateways accept (in order): `Authorization: Bearer` header > `?ticket=` (ws-ticket) > `?token=` (legacy access JWT, deprecation-warned).
- Reconnect fetches a fresh ticket each time (the old one expires in 30s).
- Frontend WS singleton uses per-room refcount (only emits LEAVE on last unmount); reconnect uses exponential backoff `1s→30s` with ±20% jitter, max 10 attempts.

### Cryptography
- **PII at rest** (Aadhaar, PAN, GST, bank account, IFSC): AES-256-GCM with field-bound AAD like `"users.panNumber|<userId>"`. Helpers: `encryptPii(plaintext, aad)` / `decryptPii(ciphertext, aad)` in `src/shared/utils/crypto.ts`. ENCRYPTION_KEY is required in production; dev fallback derives from a fixed string for ergonomics.
- **JWT secrets**: HS256 for access/refresh/signup/ws-ticket tokens. Same `JWT_SECRET` for all (intentional — keeps key management simple; types are namespaced via the `type` claim).
- **Refresh tokens** stored in DB as SHA-256 hex (NOT raw JWT). Compared via `crypto.timingSafeEqual` on hash buffers.
- **OTPs** for event check-in use `crypto.randomInt`. 5-strike per-record lockout for 15 min, returns 429.

### Rate limiting / proxy trust
- Real socket peer is read via Bun's `server.requestIP(request).address`. `X-Forwarded-For` is honored ONLY when the socket peer is in `TRUSTED_PROXIES`. Don't trust XFF unconditionally — that was a critical bug in v0.

### CORS
- `@elysiajs/cors` with explicit origin allowlist (`http://localhost:3000,3001,5173` in dev) and `credentials: true`. Never use a wildcard with credentials enabled.

### MongoDB indexing
- `2dsphere` on `users.artistProfile.location.geoPoint` is declared at field level only (don't add a duplicate `schema.index(...)`).

### Server resilience
- `uncaughtException` and `unhandledRejection` are LOGGED, not fatal. Only `SIGTERM`/`SIGINT` triggers graceful shutdown. Intentional fatal errors must call `shutdown()` explicitly.

### Validation
- Path params hit `validateObjectId` before `Model.findById`. Mongoose `CastError` is mapped to HTTP 400 in `error.plugin.ts`.
- `parsePositiveInt` is strict — rejects junk with 400 instead of silently defaulting.
- Forms use `zod` schemas in `lib/schemas/` with `safeParse` on submit; never `parseInt(value) || 0`.

## Auth role contract
- `UserRole` server-side enum: `'client' | 'artist' | 'admin'` (lowercase strings).
- `/auth/complete-signup` accepts `'client'` and `'artist'` only. `'admin'` accounts are minted server-side and rejected by signup.
- `user.role` is **immutable post-signup** — no admin endpoint to mutate it. The admin Users panel hides role-change controls accordingly.
- `user.adminRole` (granular permission tier: `SUPER_ADMIN | MODERATOR | VERIFIER | ANALYST`) drives the permissions matrix in `src/shared/constants/admin-permissions.ts`. Only `SUPER_ADMIN` can mutate other admin accounts.

## Admin panel feature surface

The admin runs at `:3001` with three moderation surfaces wired end-to-end:

### `/verifications` — KYC queue
- Pending queue (filter by type: All / Artists / Organizers)
- Detail view at `/verifications/[type]/[id]` with section selector (`identity | business | bank | professional | venue`)
- Approve / reject mutations (reject requires reason 10–500 chars via RHF + zod)
- **PII handling**: server returns fields **pre-masked** (`numberMasked`, `panMasked`, etc.); the unmasked values are encrypted at rest. There is **no "reveal full" endpoint** — `pii-field.tsx` un-hides only the last-4 the server already returned. `[admin-pii-reveal]` is logged to console for future audit-trail wiring.
- Document URLs are short-lived presigned S3 (5min). Rendered as external `<a target="_blank">` links — never iframed.

### `/users` — moderation
- List with URL-synced filters (search / role / status), pagination, sortable columns
- Detail at `/users/[id]` with three tabs: Profile / Activity / Actions
- Actions: Suspend / Ban / Reactivate (gated by current state — never offers "Ban" if already banned, etc.). Reason textarea required.
- Activity tab pulls `GET /admin/activity-logs/user/:userId`
- Admin-target rows are read-only (server enforces, UI hides controls)
- **Contract gap flagged**: there is no `GET /admin/users/:id` endpoint — detail page falls back to filtering the first-100 list page with friendly notice. Add `GET /admin/users/:id` server-side when convenient.

### `/reports` — moderation
- Queue defaults to `status: PENDING`, filters by type / reason / category / target
- Detail at `/reports/[id]` shows reporter, target (cross-link to `/users/[id]` only — destructive actions on report targets stay in the Users panel)
- Resolve action takes `verdict + notes` and maps to server's `ReportResolutionAction`: `valid → CONTENT_REMOVED`, `invalid → NO_ACTION`, `inconclusive → WARNING`. **`USER_SUSPENDED` and `USER_BANNED` are intentionally NOT exposed here** — admins must use the Users panel for those.
- "Other reports against this target" panel uses `GET /reports/admin/entity/:type/:id`
- **Contract gap flagged**: no dedicated dismiss endpoint — modeled as `resolve` with `action: NO_ACTION`. Server marks status `RESOLVED` regardless. If a separate `DISMISSED` terminal state is desired, server change required.

### Admin API client structure
- `lib/api/users.ts` — owns `usersApi` + `usersQueryKeys`
- `lib/api/verifications.ts` — owns `verificationsApi` + `verificationQueryKeys` (singular — minor naming drift but consistent)
- `lib/api/reports.ts` — owns `reportsApi` + `reportsQueryKeys`
- `lib/api/admin.ts` — aggregator that re-exports all three + `adminQueryKeys` composite for legacy call sites
- `lib/api/auth.ts` — `verifyPhone`, `verifyGoogle`, `me`, `logout`, `getWsTicket`. Login flow rejects non-admin (`role !== 'admin'`) by calling `authApi.logout()` then surfacing "Not authorized" toast

### Admin server endpoint catalog (discovered during integration)
- `GET /verification/admin/list?type&status&page&limit`
- `GET /verification/admin/:id/:type`
- `POST /verification/admin/approve` — body `{ verificationId, section, venueId?, notes? }`
- `POST /verification/admin/reject` — body `{ verificationId, section, venueId?, reason (10-500) }`
- `POST /verification/admin/professional` — artist professional review (not yet wired in UI)
- `GET /admin/users` — supports `page, limit, role, status, search, isVerified`. Returns `{ data, pagination }` (note: server uses `pagination` key, not `meta`)
- **`PUT /admin/users/:id/status`** (NOT PATCH — server is `PUT`) — body `{ status, reason? }`. Permission: `BAN_USERS`. Force-emits an activity log entry.
- `PUT /admin/users/:id/verify` — body `{ isVerified }`. Permission: `EDIT_USERS`. Manual KYC override.
- `GET /admin/activity-logs/user/:userId?limit` — Permission: `VIEW_ACTIVITY_LOGS`
- `GET /reports/admin/search` — paged. Filters: `status, type, category, priority, entityType, entityId, reporter, assignedTo, sortBy, sortOrder`
- `GET /reports/:id` — admins see all
- `GET /reports/admin/entity/:entityType/:entityId` — non-paginated history
- `POST /reports/admin/:id/resolve` — body `{ action, notes }`. `action`: `NO_ACTION | WARNING | CONTENT_REMOVED | USER_SUSPENDED | USER_BANNED`. Notes 10–2000 chars.
- `PUT /reports/admin/:id` — update status/priority/assignee/adminNotes (not yet wired in UI)

## Live migrations / TODOs

These are deliberate transitional states — don't trip over them:

| TODO | Where | Remove when |
|---|---|---|
| Crypto AAD legacy fallback (`decryptPii` retries without AAD) | `src/shared/utils/crypto.ts` (~lines 149–161) | After `scripts/reencrypt-pii-with-aad.ts` runs and `legacyDecrypts === 0` |
| Refresh-token raw-JWT legacy branch | `src/modules/auth/auth.service.ts` | **2026-05-21** — hard cutover (rejects unhashed JWT after) |
| Phone vs Google verify wire-shape inconsistency (`X-Firebase-Token` header vs body `idToken`) | `lib/api/auth.ts` `verifyPhone`; server `auth.routes.ts:60` | When server adds body `idToken` reading for phone verify |
| `accessTokenAtom`/`refreshTokenAtom` shims | (already deleted as of 2026-05-07) | — |
| WS gateway `?token=` legacy fallback (vs `?ticket=`) | `src/modules/{admin,bids}/*.gateway.ts` | When all clients have migrated; deprecation warning currently fires once per process |
| Admin user detail fallback to list filter (no `GET /admin/users/:id`) | `app/(dashboard)/users/[id]/page.tsx` | When server adds `GET /admin/users/:id` |
| Admin reports `dismiss` modeled as `resolve(NO_ACTION)` | `lib/api/reports.ts` | When server adds dedicated `DISMISSED` terminal state (if desired) |

## PII re-encryption migration

The crypto AAD fallback currently lets old PII rows decrypt (with a one-time process warning) for backward compat. To clear it:

```bash
cd ai.zts.music.server

# Read-only: count AAD vs legacy decrypts per field
bun run scripts/reencrypt-pii-with-aad.ts --verify-only

# Test with 5 docs per collection — full read path, no save
bun run scripts/reencrypt-pii-with-aad.ts --dry-run --limit 5

# Live — re-saves every PII field through Mongoose setters so AAD is bound
bun run scripts/reencrypt-pii-with-aad.ts
```

The script is idempotent. After a clean live run shows `legacyDecrypts: 0`, delete the legacy fallback block in `src/shared/utils/crypto.ts` (lines ~149–161) flagged by `TODO(crypto-aad-migration)`.

`getCryptoFallbackCounter()` and `resetCryptoFallbackCounter()` are exposed in `crypto.ts` for the script's instrumentation; they're tree-shakeable so leaving them in is harmless.

## Critical security posture
- **Never** put service-account JSON or admin SDK keys in the frontend or admin repo. Both `lib/firebase/firebase-config.ts` files read project ID from env / hardcoded `"zts-music"`. The Web SDK config (apiKey/messagingSenderId/appId) IS public per Firebase, so `NEXT_PUBLIC_*` is fine.
- **Never** commit `.env`, `token.txt`, `generate_token.ts`, `firebase-config.json`, or `*-service-account.json`. All gitignored.
- **Never** put Bearer tokens in URLs (other than the 30s ws-ticket which is short-lived by design).
- PII fields render masked-by-default in admin verification UI; "Reveal" is per-field, click-to-show, and logs an audit line.
- Refresh-token rotation has reuse-detection — concurrent multi-device sessions trigger ping-pong logout. Multi-device support requires a per-session `jti` + `Sessions` collection (deferred).

## Local dev setup

```bash
# Server (uses MongoDB Atlas — no local Mongo needed)
cd ai.zts.music.server && bun install && bun run dev   # :8080

# Frontend
cd zts-music-frontend && pnpm install && pnpm dev      # :3000

# Admin
cd ai.zts.music.admin && pnpm install && pnpm dev      # :3001
```

`.env` for server is required (Atlas URL, Firebase admin private key, JWT secrets). `.env.local` for frontend and admin should mirror `.env.example` in each repo (Firebase Web SDK keys + `NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1`).

## Health checks (curl)

```bash
# Server
curl -s http://localhost:8080/health                                                           # → {"status":"healthy",...}
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8080/api/v1/auth/logout      # → 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/v1/auth/ws-ticket           # → 401

# Frontend
curl -sI http://localhost:3000                                                                 # → 200
curl -s -o /dev/null -w "%{http_code}\n" --max-redirs 0 http://localhost:3000/client/gigs      # → 307 (middleware redirect)

# Admin
curl -sI http://localhost:3001                                                                 # → 200
curl -s -o /dev/null -w "%{http_code}\n" --max-redirs 0 http://localhost:3001/users            # → 307
curl -s -o /dev/null -w "%{http_code}\n" --max-redirs 0 http://localhost:3001/verifications    # → 307
curl -s -o /dev/null -w "%{http_code}\n" --max-redirs 0 http://localhost:3001/reports          # → 307
```

## File-level conventions
- Frontend root layout (no `src/`): `app/`, `lib/`, `components/`. Admin panel mirrors this.
- **Edge middleware quirk (Next.js 16):** Admin runs Next 16.0.6 which renamed `middleware.ts` → `proxy.ts` and requires the export be `proxy` (or default). Frontend runs Next 16.1.5 which still tolerates `middleware.ts` + `export function middleware`. Don't refactor without checking each repo's Next minor version. Admin: `proxy.ts` with `export async function proxy(...)`. Frontend: `middleware.ts` with `export function middleware(...)`.
- Server: `src/index.ts` boots; `src/app.ts` composes plugins + auth derive; `src/modules/<feature>/{routes,service,schemas,*.gateway?}.ts`. Models in `src/db/models/`. Shared utilities in `src/shared/`. Scripts in `scripts/` (use `bun run scripts/...`).
- Tailwind v4 (`@tailwindcss/postcss`) with no `tailwind.config.js`. Themes via CSS variables in `app/globals.css`.
- The `transformPlugin` is a named Elysia instance (`new Elysia({ name: 'transform' })`) so the after-handle hook deduplicates.
- Admin uses dark-themed Tailwind primitives (`zinc-100/200/500/800`); frontend uses its own theming.
- Each admin moderation surface (verifications/users/reports) owns its own `confirm-dialog.tsx` and feature-scoped components under `components/<surface>/` to avoid global-primitive coupling.

## Things deliberately deferred
- **Payments / payouts / escrow** — Razorpay + UPI + GST invoicing. No integration yet. The schema models the flow (`Transaction` states: `PENDING_PAYMENT → ESCROW → RELEASED/DISPUTED/REFUNDED`) but no gateway wiring.
- **Notifications channels** — push/SMS/WhatsApp/email. Only DB notification records exist; no FCM/APNs/Twilio delivery.
- **Search/discovery quality** — geospatial query exists, but no ranking by rating/availability/price-fit.
- **Calendar / availability / double-booking prevention** — no availability model. Artists can receive conflicting bids today.
- **Multi-device sessions** — current refresh-token model has one slot per user; concurrent sessions invalidate each other. Plan: per-session `jti` + `Sessions` collection.
- **Admin panel feature surface beyond moderation** — analytics dashboards, financial reports, transaction monitoring, payout management. Server has hooks (`adminPermissions` enum) but no UI.

## Audit history snapshot (2026-05-07)

A multi-pass audit + fix run closed all of the following in code:
- **5 criticals**: Firebase service-account JSON in frontend repo; live JWT (`token.txt`) + `generate_token.ts` committed; `.env` with live creds (Mongo/AWS/Firebase/JWT — flagged but rotation deferred per prototype mode); rate-limiter trusted-proxy bypass via XFF header forgery; WebSocket auth missing entirely.
- **11 highs**: PII encryption AAD binding; scheduler over-broad re-sweep; check-in OTP CSPRNG + lockout; refresh-token DB hashing + timingSafeEqual; Swagger gated to non-prod; dead `authPlugin`/`authentication` cleanup; refresh-token singleflight; WS singleton refcount + exponential backoff; `Authorization` strip on auth/verify; narrow `clearAuth()` to 401/403 only; hydration-safe `atomWithStorage`.
- **10 mediums**: `validateObjectId` enforcement across 11 modules + `CastError → 400` mapping; `parsePositiveInt` strict; `uncaughtException` softening; `transformPlugin` Elysia name dedup; WS gateways prefer header; duplicate `2dsphere` index; structured new-user response + `/auth/complete-signup`; zod validation on key forms (login/register/gig-create/onboarding); wire-shape normalization (left + flagged); dead atom shim deletion.
- **httpOnly cookie migration**: server cookie issuance + auth derive from cookie + `/auth/logout` + `/auth/ws-ticket` + CORS credentials; frontend `withCredentials` + drop localStorage tokens + server-side `/auth/me` middleware + ws-ticket flow + real logout.
- **Admin panel** built from create-next-app scaffold: auth, middleware, three full moderation surfaces (verifications/users/reports) with discovered server contracts.

Real remaining work is product-feature-build, not bug-fix: payments, notifications, search ranking, availability, and the strategic pivot away from reverse-auction pricing.
