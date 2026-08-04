# ai.zts.admin

Moderation panel for the ZTS Gigs marketplace. Next.js 16 (App Router), Tailwind
v4, TanStack Query. Talks to the same backend as the web app.

## Quick start

```bash
pnpm install
cp .env.example .env.local   # fill in the Firebase Web SDK keys
pnpm dev --port 3001
```

⚠️ **Pass `--port 3001` explicitly.** The `dev` script is a bare `next dev`, so
without it this app starts on :3000 and collides with the web app. The backend
CORS allowlist and the login flow assume :3001.

Requires the server running on :8080 (`NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1`).

| Command | Description |
|---|---|
| `pnpm dev --port 3001` | Dev server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |

## Auth

Firebase phone/Google → backend `/auth/*/verify` → httpOnly cookies. **Not
email/password** — some older planning docs say otherwise; they are wrong.

`proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts` and requires the export
be named `proxy`) does a server-side `/auth/me` round-trip on every request and
additionally asserts `user.role === 'admin'`. Non-admin authenticated users are
bounced to `/login?error=not_admin`. Admin accounts are minted server-side only —
the signup path is never reachable from here.

## Surfaces

Five route groups, all read-and-moderate. There is **no analytics, financial or
payout screen** (and no payments exist to monitor).

| Route | What it does |
|---|---|
| `/users`, `/users/[id]` | List with URL-synced filters; suspend / ban / reactivate; activity log tab |
| `/reports`, `/reports/[id]` | Report queue, resolve with verdict + notes |
| `/verifications`, `/verifications/[type]/[id]` | KYC queue, approve / reject per section |

### Wire contract for `/verifications` — read before editing

This surface shipped broken and was fixed on 2026-08-04. Two mismatches made it
completely non-functional, and both are easy to reintroduce:

1. **`VerificationStatus` values are UPPERCASE** (`PENDING | APPROVED | REJECTED`).
   The queue previously sent `status: 'pending'`, which matched nothing, so the
   list came back empty on every load and the queue looked permanently clear.
   Correct value is set at `lib/api/verifications.ts:43`.
2. **The artist-vs-organizer discriminant on the wire is `type`, not `kind`.**
   Detail links previously built URLs from a `kind` field the server never
   returns, so every row 404'd. The server routes are
   `GET /verification/admin/list?type=&status=` and
   `GET /verification/admin/:id/:type`.

The local TS alias is called `VerificationKind` while the wire field is `type` —
that naming drift is exactly what caused the bug. If you rename anything here,
keep the wire field `type`.

### PII handling

The server returns verification fields **pre-masked** (`numberMasked`,
`panMasked`, …); full PII never reaches the browser. There is no "reveal full"
endpoint — `pii-field.tsx` un-hides only the last 4 digits the server already
sent. `[admin-pii-reveal]` is logged to console as a placeholder for a real
audit trail. Document URLs are 5-minute presigned S3 links rendered as external
`<a target="_blank">` — never iframe them.

## Known contract gaps

- No `GET /admin/users/:id`. The detail page falls back to filtering the first
  page of the list and shows a notice.
- No dedicated dismiss endpoint for reports — dismiss is modelled as
  `resolve(NO_ACTION)`, and the server marks the report `RESOLVED` either way.
- `PUT /admin/users/:id/status` is **PUT**, not PATCH.
- `USER_SUSPENDED` / `USER_BANNED` resolutions are intentionally not exposed in
  the reports UI; destructive actions live in the Users panel only.

See `PROJECT_CONTEXT.md` at the repo root for the full API catalog.
