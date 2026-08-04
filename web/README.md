# ZTS Gigs — Web app

Client + artist frontend for the ZTS Gigs marketplace. Next.js 16 (App Router,
Turbopack) + React 19, Tailwind v4, TanStack Query.

> This file was create-next-app boilerplate until 2026-08-04 — it described `npm
> run dev` and Vercel deploys and said nothing about this project. Replaced with
> the actual setup.

## Quick start

```bash
pnpm install
cp .env.example .env.local   # fill in the Firebase Web SDK keys
pnpm dev                     # :3000
```

Requires the backend running on :8080. `.env.example` is current — the keys that
matter are `NEXT_PUBLIC_API_URL` (`http://localhost:8080/api/v1`),
`NEXT_PUBLIC_WS_URL` (`ws://localhost:8080/ws/bids`) and the four
`NEXT_PUBLIC_FIREBASE_*` values. `NEXT_PUBLIC_*` is inlined into the client
bundle and is public — never put a secret there, and never add Firebase
service-account JSON to this repo.

⚠️ All three Next apps in this repo default to :3000 and none of the `dev`
scripts pins a port. Start this one first, or pass `--port` to the others.

| Command | Description |
|---|---|
| `pnpm dev` | Dev server on :3000 |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |

## Auth

Firebase phone OTP / Google → backend `/auth/phone/verify` or
`/auth/google/verify` → the backend issues JWTs and sets them as httpOnly
cookies. **Tokens are never stored in localStorage** and there is no Bearer
request interceptor; `axios` runs with `withCredentials: true`.

New users come back as `{ requiresRole: true, signupToken, providerProfile }`
(HTTP 200, not an error) — the UI routes to role selection and then calls
`POST /auth/complete-signup`. Only `client` and `artist` are accepted; `admin`
accounts are minted server-side.

`middleware.ts` does a server-side `fetch /auth/me` forwarding the incoming
`Cookie:` header (3s timeout, `cache: 'no-store'`); 401 redirects to
`/login?next=<path>`.

WebSocket auth uses a short-lived ticket: `GET /auth/ws-ticket` returns a 30s JWT
used as `?ticket=` on the WS URL, because browsers cannot set headers on the
`WebSocket` constructor. Reconnect fetches a fresh ticket each time.

## What works, and where it stops

Honest status as of 2026-08-04, because the flow docs overstate this:

| Flow | Status |
|---|---|
| Signup, onboarding, profile | ✅ Works |
| Client: post a gig, review bids, accept a bid | ✅ Works |
| Artist: discover gigs, place a bid, track bid status | ✅ Works |
| Reviews | ⚠️ **Read-only.** `artist/reviews` renders reviews received. There is no review-submission UI anywhere, though the server API supports creating them |
| Event check-in (OTP) | ❌ **No UI.** `lib/api/checkin.ts` is a fully typed client with **zero call sites**. The server endpoints work; nothing calls them |
| Payments / earnings | ❌ **Nothing.** No payments exist server-side either. `artist/earnings` is an informational page saying artists are paid directly by the client |
| Notifications | ⚠️ DB records only — the backend has no push/SMS/email delivery |

Net effect: **the user journey dead-ends once a bid is accepted.** The client gig
detail page shows "Booked — event check-in & payment coming soon" where the
post-booking flow should be. (Orphan `Transaction` / `TransactionStatus` types
sat in `lib/types.ts` until 2026-08-04 and were deleted — there is no
`Transaction` model on the server, so don't reintroduce them client-first.)

## Conventions

- Root layout, no `src/`: `app/`, `lib/`, `components/`.
- Forms use `zod` schemas in `lib/schemas/` with `safeParse` on submit. Never
  `parseInt(value) || 0`.
- Tailwind v4 (`@tailwindcss/postcss`), no `tailwind.config.js`. Theme via CSS
  variables in `app/globals.css`.
- This app uses `middleware.ts` with `export function middleware`. The admin app
  runs an older Next 16 minor that requires `proxy.ts` / `export function proxy`
  instead — don't unify them without checking each repo's Next version.

See `PROJECT_CONTEXT.md` at the repo root for the backend contract.
