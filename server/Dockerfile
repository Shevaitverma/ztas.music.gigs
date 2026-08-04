# ============================================
# ZTS Music Platform API - Production Dockerfile
# ============================================
# Runs from TypeScript source (Bun executes .ts natively), matching
# nixpacks.toml's `bun run start` so both deploy paths ship the same artifact.

# Bun is pinned to an exact patch, NOT the floating `1.3` tag. A `bun update`
# once pulled bson@7.3.1, which throws at import time on some Bun patches
# (`node:v8 isBuildingSnapshot is not yet implemented`) — the server would not
# boot. With a floating tag that class of failure can reach production without
# any code change. Bump this deliberately, and let CI's smoke test vet it.
# Keep in sync with .github/workflows/ci.yml.

# Stage 1: production dependencies only (no devDependencies)
FROM oven/bun:1.3.14 AS deps

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile --production

# Stage 2: Production
FROM oven/bun:1.3.14-slim AS production

WORKDIR /app

# Create non-root user for security (using useradd for slim image compatibility)
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs bunjs

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json bunfig.toml ./
COPY src ./src

# Set environment
ENV NODE_ENV=production

# Expose port (8080 is the convention: .env.example, docker-compose.yml,
# and src/config/index.ts default). PORT is left to the platform to inject.
EXPOSE 8080

# Switch to non-root user
USER bunjs

# Health check. Uses `bun -e` (same probe as docker-compose.yml) because
# oven/bun:*-slim ships neither wget nor curl. Honours an injected $PORT.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://localhost:' + (process.env.PORT || 8080) + '/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Start server
CMD ["bun", "run", "start"]
