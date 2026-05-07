# ============================================
# ZTS Music Platform API - Production Dockerfile
# ============================================
# Multi-stage build for minimal image size

# Stage 1: Build
FROM oven/bun:1.3 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build (optional - Bun can run TypeScript directly)
RUN bun build src/index.ts --outdir dist --target bun

# Stage 2: Production
FROM oven/bun:1.3-slim AS production

WORKDIR /app

# Create non-root user for security (using useradd for slim image compatibility)
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs bunjs

# Copy only necessary files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Set environment
ENV NODE_ENV=production
ENV PORT=8085

# Expose port
EXPOSE 8085

# Switch to non-root user
USER bunjs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8085/live || exit 1

# Start server
CMD ["bun", "run", "dist/index.js"]
