# ZTS Music Platform - Bun + Elysia Backend

**Production-Ready API Server** - Built with [Bun](https://bun.sh) and [Elysia](https://elysiajs.com) for maximum performance.

## 🎯 Project Overview

A music gig marketplace backend connecting **Artists** with **Clients** (Managers/Venues), featuring:

- 🔐 Firebase + JWT hybrid authentication (httpOnly cookies)
- 🔄 Real-time bidding with WebSocket
- 📊 MongoDB with Mongoose (13 models)
- ☁️ AWS S3 file uploads
- 🗺️ Geospatial queries for location-based gig discovery
- 👤 Role-based access control (Artist, Client, Admin) + granular `adminRole` permissions
- 🔒 AES-256-GCM field-level encryption for KYC PII
- 📈 Structured logging for production

**Not included, despite what other docs may say:** no payments, escrow or
payouts (no `Transaction` model, no gateway); no notification *delivery* (DB
records only — no push/SMS/email). And note the rate limiter, while present in
`security.plugin.ts`, **does not currently execute** — see the Security section
below before relying on it.

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- MongoDB (local or Atlas)
- Firebase project (for authentication)

### Installation

```bash
# Install dependencies
bun install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# Then start development server
bun run dev
```

`.env.example` is current — it lists every key `src/config/` reads. Three that
are easy to overlook:

| Var | Notes |
|---|---|
| `ENCRYPTION_KEY` | 64 hex chars (32 bytes). **Required in production** — boot throws without it. Omitting it in dev falls back to a key derived from a fixed string and logs a warning. Never use the fallback outside localhost |
| `TRUSTED_PROXIES` | Comma-separated source IPs allowed to set `X-Forwarded-For`. Defaults to `127.0.0.1,::1` |
| `ENABLE_ACTIVITY_LOGGING` | Gates admin activity-log writes |

### Available Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start development server with hot reload |
| `bun run start` | Start production server |
| `bun run build` | Build for production (minified + sourcemaps) |
| `bun run test` | Run tests |
| `bun run test:watch` | Run tests in watch mode |
| `bun run typecheck` | Run TypeScript type checking |
| `bun run lint` | Same as `typecheck` (`tsc --noEmit`) — there is no ESLint config in this repo |
| `bun run clean` | Clean build artifacts |

### Endpoints

Once running, access:

| Endpoint | Description |
|----------|-------------|
| `http://localhost:8080` | API root info |
| `http://localhost:8080/api/docs` | Swagger documentation (**non-production only** — deliberately not mounted when `NODE_ENV=production`) |
| `http://localhost:8080/health` | Deep health check |
| `http://localhost:8080/live` | Liveness probe (K8s) |
| `http://localhost:8080/ready` | Readiness probe (K8s) |
| `http://localhost:8080/api/v1` | API v1 routes |

## 📁 Project Structure

```
ai.zts.music.server/
├── src/
│   ├── config/              # Environment configuration
│   ├── plugins/             # Elysia plugins
│   │   ├── error.plugin.ts       # Global error handling
│   │   ├── logging.plugin.ts     # Request/response logging
│   │   ├── security.plugin.ts    # Rate limiting, headers
│   │   ├── compression.plugin.ts # Gzip compression
│   │   ├── transform.plugin.ts   # Response wrapper
│   │   ├── cors.plugin.ts        # CORS configuration
│   │   └── swagger.plugin.ts     # API documentation
│   ├── db/
│   │   ├── index.ts         # MongoDB connection
│   │   └── models/          # Mongoose models (13)
│   ├── modules/             # Feature modules (12)
│   │   ├── auth/            # Authentication
│   │   ├── users/           # User management
│   │   ├── gigs/            # Gig posting/discovery
│   │   ├── bids/            # Real-time bidding + WebSocket
│   │   ├── applications/    # Application management
│   │   ├── venues/          # Venue management
│   │   ├── admin/           # Admin panel + WebSocket
│   │   ├── reviews/         # Two-way reviews + moderation
│   │   ├── reports/         # User/content reports
│   │   ├── checkin/         # Event check-in OTP (no client UI yet)
│   │   ├── verification/    # KYC (artist + organizer)
│   │   └── notifications/   # DB records only — no delivery channel
│   ├── shared/
│   │   ├── enums/           # All enums
│   │   ├── constants/       # Constants
│   │   ├── errors/          # Custom error classes
│   │   ├── types/           # TypeScript types
│   │   └── utils/           # Helper functions
│   ├── services/            # Infrastructure services
│   ├── test/                # Bun tests
│   ├── app.ts               # Main Elysia app
│   └── index.ts             # Entry point
├── package.json
├── tsconfig.json
├── bunfig.toml
├── Dockerfile
└── .env.example
```

## 🔒 Security Features

### Rate Limiting — ⚠️ CONFIGURED BUT NOT ENFORCED

**The rate limiter does not run. Treat every endpoint as unthrottled.**

`securityPlugin` is a *named* Elysia instance (`new Elysia({ name: 'security' })`),
and in Elysia a lifecycle hook on a named plugin defaults to `local` scope — so
the bare `.onBeforeHandle(...)` that implements rate limiting
(`src/plugins/security.plugin.ts:136`) never fires for parent-app routes. No
`X-RateLimit-*` headers are emitted and no 429 is ever returned. The CSRF hook
directly above it passes `{ as: 'global' }` and does work; the rate-limit hook
needs the same. Verified empirically 2026-08-04.

The configured-but-inert settings are:
- **100 requests/minute** in production, **1000/minute** in development
- Tighter per-route caps in `DEFAULT_ROUTE_LIMITS` (login 5/15min, check-in OTP
  5/5min, reviews & reports 5/min, uploads 5/min)
- IP-based tracking; `X-Forwarded-For` honoured **only** when the socket peer is
  in `TRUSTED_PROXIES` (this logic is correct, just unreached)
- Would return `429 Too Many Requests` with `Retry-After`

The one brute-force control that *is* live is the check-in OTP's own 5-strike /
15-minute per-record lockout in the check-in service, which is independent of
this plugin.

### Security Headers
Set by an `.onRequest` hook in the same named `security` plugin as the dead rate
limiter. **Unverified whether these actually reach responses** — given the
scoping bug above, confirm with `curl -I` before citing them as a control. The
intended set:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (disables geolocation, microphone, camera)
- `Strict-Transport-Security` (production only)

### Request Tracking
- Every request gets a unique `X-Request-ID` (`crypto.randomUUID()` via `.derive`)
- ⚠️ `X-RateLimit-*` headers are **not** emitted — they are set inside the
  rate-limit hook, which never executes

### CSRF Protection (this one does work)
State-changing requests (non-GET/HEAD/OPTIONS) must carry an `Origin` or
`Referer` on the CORS allowlist, or they get a 403. Requests with neither header
are allowed through — those are non-browser clients (curl, mobile) which cannot
be CSRF'd. Covered by `src/test/csrf.test.ts`.

## 📚 API Patterns

### Protected Routes

> Corrected 2026-08-04 — the `{ isProtected: true, roles: [...] }` option this
> section used to show **does not exist**. There is no such route option
> anywhere in the codebase; `grep -rn isProtected src/` returns nothing. Auth
> and role checks are done imperatively in the handler:

```typescript
import { getAuthUser } from '../../shared/types/auth.types';
import { ForbiddenException } from '../../plugins/error.plugin';

.post('/gigs', async (ctx) => {
  // Throws UnauthorizedException (401) if unauthenticated.
  // Also normalises role to lowercase.
  const user = getAuthUser(ctx);

  if (user.role !== UserRole.CLIENT && user.role !== UserRole.ADMIN) {
    throw new ForbiddenException('Only clients can post gigs');
  }
  // ...
})
```

Path params are validated with `validateObjectId(id, 'gigId')` before any
`Model.findById`; Mongoose `CastError` maps to HTTP 400 in `error.plugin.ts`.

### Validation (TypeBox)

```typescript
const Schema = t.Object({
  title: t.String({ minLength: 1, maxLength: 100 }),
  budget: t.Number({ minimum: 0 })
});

.post('/gigs', handler, { body: Schema })
```

### Error Handling

```typescript
import { NotFoundException } from './plugins';

throw new NotFoundException('Gig not found');
```

## 🧪 Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test src/test/utils.test.ts

# Watch mode
bun test --watch
```

## 🐳 Docker / Kubernetes

### Build & Run

```bash
docker build -t zts-music-api .
docker run -p 8080:8080 --env-file .env zts-music-api
```

### Health Checks

```yaml
# Kubernetes deployment
livenessProbe:
  httpGet:
    path: /live
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
```

## 📊 Logging

### Development
Human-readable colored output:
```
[2024-01-15T10:30:00.000Z] [abc12345] → GET /api/v1/gigs
[2024-01-15T10:30:00.050Z] [abc12345] ← GET /api/v1/gigs 200 50.23ms
```

### Production
Structured JSON for log aggregators:
```json
{"timestamp":"2024-01-15T10:30:00.000Z","requestId":"abc12345","method":"GET","path":"/api/v1/gigs","status":200,"duration":"50.23ms"}
```

## 📈 Performance

Built for speed with:
- **Bun runtime** - Faster than Node.js
- **Elysia framework** - Fastest TypeScript web framework
- **Bun.nanoseconds()** - Microsecond precision timing
- **Native gzip compression** - Using `Bun.gzipSync()`
- **Mongoose lean queries** - Reduced memory overhead

## 📝 License

MIT
