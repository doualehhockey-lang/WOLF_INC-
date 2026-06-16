# packaging/docker/agent.Dockerfile — Wolf Engine Agent (main orchestrator).
#
# Multi-stage build:
#   deps    → install ALL deps (including dev) for build step
#   build   → compile / validate / prune dev deps
#   runtime → minimal production image
#
# Security:
#   - Non-root user (node:1000)
#   - No secrets baked in — all via env vars at runtime
#   - Read-only filesystem (mount /tmp + /app/public/audio as volumes)
#
# Build:
#   docker build -f packaging/docker/agent.Dockerfile \
#     --build-arg APP_VERSION=1.0.0 \
#     -t ghcr.io/doualeh/wolf-engine/agent:1.0.0 .

# ── Stage 1: dependency installer ─────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Install OS deps needed by native modules (e.g. pg, canvas).
RUN apk add --no-cache python3 make g++ libc6-compat

# Copy only manifests first — cache layer invalidation on source change.
COPY package.json package-lock.json ./

# Install all deps (including dev) for the build stage.
RUN npm ci --ignore-scripts

# ── Stage 2: build / prune ────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Copy installed node_modules from deps stage.
COPY --from=deps /app/node_modules ./node_modules

# Copy full source.
COPY . .

# Run linter + any transpilation step (none currently — ESM passthrough).
# If you add TypeScript or esbuild, run it here.
RUN npm run lint --if-present

# Prune to production-only deps.
RUN npm prune --omit=dev

# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Build-time args injected by CI.
ARG APP_VERSION=dev
ARG BUILD_DATE
ARG VCS_REF

# OCI image labels (used by GHCR and Harbour for metadata).
LABEL org.opencontainers.image.title="Wolf Engine Agent" \
      org.opencontainers.image.description="Voice pipeline orchestrator (Whisper→Claude→TTS)" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="https://github.com/doualeh/wolf_inc-" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Install only runtime OS deps.
RUN apk add --no-cache curl tini

# Copy pruned node_modules + source from build stage.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src          ./src
COPY --from=build /app/server.js    ./server.js
COPY --from=build /app/package.json ./package.json

# Create writable directories (audio output, data).
RUN mkdir -p /app/public/audio /app/data \
    && chown -R node:node /app

# Set version in the environment (informational only).
ENV APP_VERSION="${APP_VERSION}" \
    NODE_ENV=production \
    PORT=3000

# Drop to non-root user.
USER node

EXPOSE 3000

# Use tini as PID 1 (proper signal forwarding + zombie reaping).
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

# Liveness / readiness probe target.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/health/live || exit 1
