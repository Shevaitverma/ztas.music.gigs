# ZTS Music Platform — Project Context

This file captures the engineering context for the three repos under this directory so a fresh clone has everything needed to onboard. Last updated: 2026-08-04.

## Repos

```
project music/
├── ai.zts.music.server/    Bun + Elysia + MongoDB Atlas + Firebase Admin SDK   :8080
├── zts-music-frontend/     Next.js 16 (App Router, Turbopack) + React 19       :3000
└── ai.zts.music.admin/     Next.js 16 admin panel (auth + 3 moderation         :3001
                             surfaces: users, reports, KYC verifications)
```

## What it is (one line)

A gig-bidding marketplace where music **artists** bid on gigs posted by **clients** (event organizers), with OTP-based event check-in for ground truth, KYC verification, and an admin tier for moderation/verification.

Domain vocab: `UserRole = 'client' | 'artist' | 'admin'`. `AdminRole = 'SUPER_ADMIN' | 'MODERATOR' | 'VERIFIER' | 'ANALYST'`. Core entities: `Gig`, `Bid`, `OrganizerVerification`, `ArtistVerification`, `EventCheckIn`, `Review`, `Notification`, `Report`.

## Business model summary

**Pricing primitive:** reverse auction — clients post a max budget, artists bid lower with proposals. **Take rate (planned, unimplemented):** % commission on completed bookings (default 10%, optional tiered: 15% under ₹10k → 8% above ₹100k). **Geography:** India-only signals throughout (Aadhaar/PAN/GST, INR, Mumbai sample data, Bollywood/Sufi/Ghazal genres). **Maturity:** mid MVP / pre-launch. Payments and escrow do not exist in any form (no model, no gateway, no code). KYC verification and notifications have server APIs but incomplete client surfaces.

**Moats — what is actually in code vs. planned:**
- *Built:* OTP check-in with dual end-event confirmation (`src/modules/checkin/`, `EventCheckIn` model) — server-side only, no client UI yet. India-specific KYC at both sides, Aadhaar/PAN/GST encrypted at rest (`artist-verification.model.ts`, `organizer-verification.model.ts`). Two-way reviews with sub-ratings + moderation pipeline (`src/modules/reviews/`) — server API complete, web UI is read-only.
- *PLANNED — not implemented:* escrow and dispute states. There is **no `Transaction` model, no payment gateway integration, and no payment code anywhere in the repo.** The intended state machine (`PENDING_PAYMENT → ESCROW → RELEASED/DISPUTED/REFUNDED`) exists only as a design sketch in `server/FUTURE.md` §2. (Unused `Transaction`/`TransactionStatus` TS types lingered in `web/lib/types.ts` until 2026-08-04 and have since been deleted as dead code — don't reintroduce them ahead of the server.) UPI payouts likewise unbuilt — the bank/IFSC fields collected during KYC have no consumer.

**Strategic concerns** (from a 2026-05-07 evaluation pass): reverse-auction is the wrong primitive for quality-supply — top artists refuse bidding wars. Disintermediation risk is fatal in low-frequency-buyer events (weddings) unless the platform owns insurance/guarantees. The whole monetization spine is unbuilt. Recommended pivot: fixed-quote with optional negotiation, keep escrow+OTP+review moat, add supply-side subscription on top of commission.

**Closest analogue globally:** Poptop (UK) — quote-based marketplace with ~10–20% commission on confirmed bookings.

## Architecture decisions (don't relitigate without reason)

### Authentication (httpOnly cookies)
- Login flow: Firebase Web SDK → Firebase ID token → backend `/auth/phone/verify` or `/auth/google/verify` → backend issues JWT access (1h) + refresh (7d).
- Tokens are returned BOTH as JSON `{ accessToken, refreshToken }` AND set as httpOnly cookies (additive). The cookie path is the source of truth going forward; the JSON path remains for backward compat.
- **Cookie policy is environment-dependent — it is NOT `SameSite=Lax` everywhere.** `src/shared/utils/cookies.ts:33` sets `sameSite: 'none' + secure: true` in production and `'lax' + secure: false` in dev. Reason: the API and the frontends sit on different registrable domains in production, so the auth cookie is genuinely cross-site; `Lax` meant the browser dropped it on the top-level POST→redirect, producing a 401 immediately after `/auth/google/verify` succeeded. `SameSite=None` requires `Secure`, hence the pairing. Because `None` removes the browser's own CSRF protection, the Origin/Referer allowlist check in `security.plugin.ts:120` is load-bearing in production — do not remove it.
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
- **PII at rest** (Aadhaar, PAN, GST, bank account, IFSC): AES-256-GCM with a **static field-path AAD**. Helpers: `encryptPii(plaintext, aad)` / `decryptPii(ciphertext, aad)` in `src/shared/utils/crypto.ts`. `ENCRYPTION_KEY` is required in production; dev fallback derives from a fixed string for ergonomics.
- There are exactly **six** AAD values, all hardcoded as Mongoose getter/setter bindings. The AAD is the field path and **nothing else — there is no userId or any other per-record component**, so ciphertext cannot be moved between *fields* but can in principle be moved between *rows of the same field*:
  - `artistVerifications.identity.number`, `artistVerifications.bankAccount.accountNumber`, `artistVerifications.bankAccount.ifscCode` (`src/db/models/artist-verification.model.ts:6-26`)
  - `organizerVerifications.identity.number`, `organizerVerifications.business.gstNumber`, `organizerVerifications.business.panNumber` (`src/db/models/organizer-verification.model.ts:11-22`)
- Note there is **no `users.panNumber` field** — PAN lives at `organizerVerifications.business.panNumber`. Older revisions of this doc claimed otherwise; that field never existed.
- The IFSC setter normalises (`trim`/`toUpperCase`) *inside* the setter, before encryption. Do not add Mongoose `trim`/`uppercase` to that field — built-in transforms run after custom setters and would mangle the ciphertext. See the comment at `artist-verification.model.ts:14-20` and the regression test `src/test/pii-setter-order.test.ts`.
- **JWT secrets**: HS256 for access/refresh/signup/ws-ticket tokens. Same `JWT_SECRET` for all (intentional — keeps key management simple; types are namespaced via the `type` claim).
- **Refresh tokens** stored in DB as SHA-256 hex (NOT raw JWT). Compared via `crypto.timingSafeEqual` on hash buffers.
- **OTPs** for event check-in use `crypto.randomInt`. 5-strike per-record lockout for 15 min, returns 429.

### Rate limiting / proxy trust
- ⚠️ **The rate limiter is written but DOES NOT RUN. Treat every endpoint as unthrottled.** Verified empirically — no `X-RateLimit-*` headers are emitted and no request is ever rejected with 429.
- Cause: `securityPlugin` returns `new Elysia({ name: 'security' })` (`src/plugins/security.plugin.ts:90`). In Elysia, a lifecycle hook registered on a **named** plugin defaults to `local` scope, so it only fires for routes declared on that plugin instance. The rate-limit hook at `security.plugin.ts:136` is a bare `.onBeforeHandle(...)` and therefore never sees a parent-app route. The CSRF origin check two hooks above it (`security.plugin.ts:120`) passes `{ as: 'global' }` and *does* fire — that contrast is the whole bug. Fixing it is a one-word change (`{ as: 'global' }`), but do it deliberately: the caps in `DEFAULT_ROUTE_LIMITS` have never been exercised against real traffic.
- The XFF logic itself is correct and worth keeping: the real socket peer is read via Bun's `server.requestIP(request).address`, and `X-Forwarded-For` is honored ONLY when that peer is in `TRUSTED_PROXIES`. Don't trust XFF unconditionally — that was a critical bug in v0. It is simply moot while the hook does not execute.
- Corollary: the per-route caps documented elsewhere (login 5/15min, check-in OTP 5/5min, reviews & reports 5/min) are **aspirational config**, not enforced behaviour. The check-in OTP path has its own independent 5-strike/15-min lockout in the check-in service, which *does* run — that is the only brute-force protection currently live.

### CORS + CSRF
- `@elysiajs/cors` with an explicit origin allowlist from `CORS_ORIGIN` and `credentials: true`. Never use a wildcard with credentials enabled.
- `CORS_ORIGIN` is **required in production** and boot fails if it is missing or contains `*` (`src/config/index.ts:85-93`). If it is unset in dev the config falls back to `['*']` — convenient locally, and the reason the production guard exists.
- The **CSRF origin check does work** (unlike the rate limiter) — it is the one hook in `security.plugin.ts` registered `{ as: 'global' }`. Non-GET/HEAD/OPTIONS requests whose `Origin` (or `Referer` fallback) is not on the same allowlist get a 403. Requests carrying *neither* header pass, since those are non-browser clients (curl, mobile) that cannot be CSRF'd. Covered by `src/test/csrf.test.ts`. This matters more than usual because production cookies are `SameSite=None`.

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

The admin runs at `:3001` with three moderation surfaces. `/users` and `/reports` have been exercised end-to-end. `/verifications` was **wired but non-functional until 2026-08-04** — see the contract note below before touching it.

### `/verifications` — KYC queue
> **Wire-contract — got this wrong once, don't repeat it.** Two client/server mismatches made this surface completely dead: the queue sent `status: 'pending'` against a server enum whose members are UPPERCASE, so the list came back empty on every load and the queue looked permanently clear; and the detail link used a field `kind` where the server's discriminant is `type`, so every row's detail link 404'd. Both are fixed (`admin/lib/api/verifications.ts:43` now sends `'PENDING'`; `type` is the discriminant throughout). The rules: **`VerificationStatus` values are UPPERCASE** (`PENDING | APPROVED | REJECTED`), and **the artist-vs-organizer discriminant is `type`**, matching `GET /verification/admin/list?type=&status=` and `GET /verification/admin/:id/:type`. The TS alias is named `VerificationKind` but the wire field is `type` — that naming drift is what caused the bug.

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

Verified against source on 2026-08-04. Rows whose work is finished have been deleted, not left to rot.

| TODO | Where | Remove when |
|---|---|---|
| Crypto AAD legacy fallback (`decryptPii` retries without AAD) | `src/shared/utils/crypto.ts`, the `catch (aadErr)` retry in `decryptPii`, flagged `TODO(crypto-aad-migration)` | Still live. After `scripts/reencrypt-pii-with-aad.ts` runs and `legacyDecrypts === 0` |
| WS gateway `?token=` legacy fallback (vs `?ticket=`) | `src/modules/{admin,bids}/*.gateway.ts` | Still live. When all clients have migrated; deprecation warning fires at most once per interval per process |
| Admin user detail fallback to list filter (no `GET /admin/users/:id`) | `app/(dashboard)/users/[id]/page.tsx` | Still live — server has `PUT /admin/users/:id/status` and `/verify` but no `GET /admin/users/:id` |
| Admin reports `dismiss` modeled as `resolve(NO_ACTION)` | `lib/api/reports.ts` | Still live. When server adds dedicated `DISMISSED` terminal state (if desired) |

**Closed since the last revision — do not go looking for these:**
- **Refresh-token raw-JWT legacy branch** — removed. The 2026-05-21 hard cutover passed and the branch was deleted on 2026-08-04; `TODO(refresh-token-legacy)` no longer appears in `auth.service.ts`. Refresh tokens are now hashed-only: stored as SHA-256 hex, compared with `crypto.timingSafeEqual`. An unhashed JWT presented today is rejected.
- `accessTokenAtom` / `refreshTokenAtom` shims — deleted. No occurrence remains in `web/` or `admin/`.
- Phone vs Google verify wire-shape inconsistency — resolved. The server now accepts the Firebase phone ID token from **either** the `X-Firebase-Token` header **or** body `idToken` (`src/modules/auth/auth.routes.ts:143-149`, `auth.schemas.ts:36-44`).
- `src/shared/utils/performance.utils.ts` — deleted as dead code. Nothing imported it. See `server/BUN_PERFORMANCE_OPTIMIZATIONS.md` for the (now largely historical) rationale it documented.

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

The script is idempotent. After a clean live run shows `legacyDecrypts: 0`, delete the legacy fallback block in `src/shared/utils/crypto.ts` (the `catch (aadErr)` retry inside `decryptPii`) flagged by `TODO(crypto-aad-migration)`.

`getCryptoFallbackCounter()` and `resetCryptoFallbackCounter()` are exposed in `crypto.ts` for the script's instrumentation; they're tree-shakeable so leaving them in is harmless.

## Critical security posture
- **Never** put service-account JSON or admin SDK keys in the frontend or admin repo. Both `lib/firebase/firebase-config.ts` files read project ID from env / hardcoded `"zts-music"`. The Web SDK config (apiKey/messagingSenderId/appId) IS public per Firebase, so `NEXT_PUBLIC_*` is fine.
- **Never** commit `.env`, `token.txt`, `generate_token.ts`, `firebase-config.json`, or `*-service-account.json`. All gitignored.
- **Never** put Bearer tokens in URLs (other than the 30s ws-ticket which is short-lived by design).
- ⚠️ **Rate limiting is NOT enforced.** The plugin exists and is `.use()`d, but its hook is local-scoped and never executes — see "Rate limiting / proxy trust" above. Do not cite rate limiting as a control in any security review, threat model, or customer-facing claim until `security.plugin.ts:136` carries `{ as: 'global' }` and a 429 has been observed.
- PII fields render masked-by-default in admin verification UI; "Reveal" is per-field, click-to-show, and logs an audit line. Note the server only ever sends pre-masked values, so "reveal" un-hides the last 4 digits — full PII never reaches the browser.
- Refresh-token rotation has reuse-detection — concurrent multi-device sessions trigger ping-pong logout. Multi-device support requires a per-session `jti` + `Sessions` collection (deferred).

## Local dev setup

```bash
# Server (uses MongoDB Atlas — no local Mongo needed)
cd ai.zts.music.server && bun install && bun run dev   # :8080

# Frontend
cd zts-music-frontend && pnpm install && pnpm dev      # :3000

# Admin — the port MUST be passed explicitly
cd ai.zts.music.admin && pnpm install && pnpm dev --port 3001
```

⚠️ **All three Next apps default to :3000.** None of the `dev` scripts pins a
port (`"dev": "next dev"` in every `package.json`), so running the admin or
landing app with a bare `pnpm dev` while the web app is up gets you either a
port collision or a silent bump to :3001/:3002 — and then the CORS allowlist and
the admin `proxy.ts` cookie round-trip stop lining up. Pass `--port` explicitly,
or add `-p` to the scripts. This bites people; it is not a doc typo.

`.env` for server is required — copy `server/.env.example`, which is current and lists every key the config reads. Beyond the Atlas URL / Firebase admin private key / JWT secrets, note three that are easy to miss:
- `ENCRYPTION_KEY` — 64 hex chars (32 bytes). **Required in production**; boot throws without it. In dev, omitting it falls back to a key derived from a fixed string and logs a warning — fine locally, never anywhere else.
- `TRUSTED_PROXIES` — comma-separated source IPs allowed to set `X-Forwarded-For` (default `127.0.0.1,::1`).
- `ENABLE_ACTIVITY_LOGGING` — gates admin activity-log writes.

`.env.local` for frontend and admin should mirror `.env.example` in each repo (Firebase Web SDK keys + `NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1`).

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
- **Payments / payouts / escrow** — Razorpay + UPI + GST invoicing. **Nothing exists.** Not "scaffolded", not "modelled": there is no `Transaction` model in `src/db/models/` (13 models, none of them financial), no gateway SDK in `package.json`, and no payment code. A grep for `razorpay|escrow|payout|commission` across `server/src` returns only two forward-looking comments in `scheduler.service.ts` ("once escrow is wired…"). The design sketch lives in `server/FUTURE.md` §2 and `landing/docs/` — those are proposals. Orphan `Transaction`/`TransactionStatus` TS types in `web/lib/types.ts` were deleted on 2026-08-04; nothing had ever constructed or consumed them.
- **Post-booking flow (dead-ends today)** — accepting a bid books the gig, and then the user journey stops. Check-in has a full server API (`/checkin/generate-otp`, `/verify-otp`, `/end-event`, `/status`) and a typed web client (`web/lib/api/checkin.ts`), but **no UI calls any of it** — the client gig detail page renders "Booked — event check-in & payment coming soon" instead. Reviews are the same shape: the server API is complete including create, but web only *reads* reviews (`web/app/(dashboard)/artist/reviews/page.tsx`); there is no review-submission UI anywhere. So the OTP-check-in moat is real in the backend and unreachable from the product.
- **Notifications delivery** — push/SMS/WhatsApp/email. Only DB notification records exist. There is no FCM/APNs/Twilio/SendGrid/nodemailer dependency or call site anywhere in `server/src` — notifications are write-only rows that a client must poll for.
- **Search/discovery quality** — geospatial query exists, but no ranking by rating/availability/price-fit.
- **Calendar / availability / double-booking prevention** — no availability model. Artists can receive conflicting bids today.
- **Multi-device sessions** — current refresh-token model has one slot per user; concurrent sessions invalidate each other. Plan: per-session `jti` + `Sessions` collection.
- **Admin panel feature surface beyond moderation** — the admin app has exactly 5 pages (`/`, `/users`, `/users/[id]`, `/reports`, `/reports/[id]`, `/verifications`, `/verifications/[type]/[id]`). No analytics, financial, transaction-monitoring or payout screens. Note the server is *ahead* of the UI here: `GET /admin/analytics/dashboard`, `/analytics/users`, `/analytics/gigs`, `/analytics/export` and `/storage/stats` all exist and are unconsumed. Financial/payout screens are blocked on payments existing at all.

## Audit history snapshot (2026-05-07)

> **Read this section as a record of what was *attempted*, not a warranty of what works.** A follow-up audit on 2026-08-04 found that two items below did not hold: the rate-limiter fix (see the ⚠️ under "Rate limiting / proxy trust" — the XFF hardening is correct but the hook never executes) and the admin KYC surface (shipped broken on two wire-contract mismatches; fixed 2026-08-04). The full 2026-08-04 findings are in `reports/07-full-audit-2026-08-04.md`.

A multi-pass audit + fix run closed all of the following in code:
- **5 criticals**: Firebase service-account JSON in frontend repo; live JWT (`token.txt`) + `generate_token.ts` committed; `.env` with live creds (Mongo/AWS/Firebase/JWT — flagged but rotation deferred per prototype mode); rate-limiter trusted-proxy bypass via XFF header forgery; WebSocket auth missing entirely.
- **11 highs**: PII encryption AAD binding; scheduler over-broad re-sweep; check-in OTP CSPRNG + lockout; refresh-token DB hashing + timingSafeEqual; Swagger gated to non-prod; dead `authPlugin`/`authentication` cleanup; refresh-token singleflight; WS singleton refcount + exponential backoff; `Authorization` strip on auth/verify; narrow `clearAuth()` to 401/403 only; hydration-safe `atomWithStorage`.
- **10 mediums**: `validateObjectId` enforcement across 11 modules + `CastError → 400` mapping; `parsePositiveInt` strict; `uncaughtException` softening; `transformPlugin` Elysia name dedup; WS gateways prefer header; duplicate `2dsphere` index; structured new-user response + `/auth/complete-signup`; zod validation on key forms (login/register/gig-create/onboarding); wire-shape normalization (left + flagged); dead atom shim deletion.
- **httpOnly cookie migration**: server cookie issuance + auth derive from cookie + `/auth/logout` + `/auth/ws-ticket` + CORS credentials; frontend `withCredentials` + drop localStorage tokens + server-side `/auth/me` middleware + ws-ticket flow + real logout.
- **Admin panel** built from create-next-app scaffold: auth, middleware, three moderation surfaces (verifications/users/reports) with discovered server contracts. *(Caveat added 2026-08-04: "built" ≠ "working" — the verifications surface was dead on arrival until fixed today.)*

Remaining work is mostly product-feature-build — payments, notifications delivery, the post-booking UI (check-in + reviews), search ranking, availability, and the strategic pivot away from reverse-auction pricing — plus one live security bug: the rate limiter does not execute.
