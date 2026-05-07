# ZTS Music Platform - Bun + Elysia Backend

**Production-Ready API Server** - Built with [Bun](https://bun.sh) and [Elysia](https://elysiajs.com) for maximum performance.

## 🎯 Project Overview

A music gig marketplace backend connecting **Artists** with **Clients** (Managers/Venues), featuring:

- 🔐 Firebase + JWT hybrid authentication
- 🔄 Real-time bidding with WebSocket
- 📊 MongoDB with Mongoose (5 entities)
- ☁️ AWS S3 file uploads
- 🗺️ Geospatial queries for location-based gig discovery
- 👤 Role-based access control (Artist, Client, Admin)
- 🛡️ Security hardening (rate limiting, security headers)
- 📈 Structured logging for production

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

### Available Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start development server with hot reload |
| `bun run start` | Start production server |
| `bun run build` | Build for production (minified + sourcemaps) |
| `bun run test` | Run tests |
| `bun run test:watch` | Run tests in watch mode |
| `bun run typecheck` | Run TypeScript type checking |
| `bun run clean` | Clean build artifacts |

### Endpoints

Once running, access:

| Endpoint | Description |
|----------|-------------|
| `http://localhost:8080` | API root info |
| `http://localhost:8080/api/docs` | Swagger documentation |
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
│   │   └── models/          # Mongoose models (5 entities)
│   ├── modules/             # Feature modules
│   │   ├── auth/            # Authentication
│   │   ├── users/           # User management
│   │   ├── gigs/            # Gig posting/discovery
│   │   ├── bids/            # Real-time bidding + WebSocket
│   │   ├── applications/    # Application management
│   │   ├── venues/          # Venue management
│   │   └── admin/           # Admin panel + WebSocket
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

### Rate Limiting
- **100 requests/minute** in production
- **1000 requests/minute** in development
- IP-based tracking with `X-Forwarded-For` support
- Returns `429 Too Many Requests` with `Retry-After` header

### Security Headers
All responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (disables geolocation, microphone, camera)
- `Strict-Transport-Security` (production only)

### Request Tracking
- Every request gets a unique `X-Request-ID`
- Rate limit headers on all responses

## 📚 API Patterns

### Protected Routes

```typescript
.post('/gigs', handler, { 
  isProtected: true,
  roles: [UserRole.CLIENT] 
})
```

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
