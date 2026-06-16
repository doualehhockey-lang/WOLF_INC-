# packaging/docker/claude.Dockerfile — Claude NLU proxy service.
#
# Runs the same Wolf Engine codebase but in "claude" mode:
#   NODE_SERVICE=claude instructs server.js to mount only the Claude NLU routes.
#
# Lighter than agent: no TTS binary, no audio volume.

# ── Stage 1: deps ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++ libc6-compat

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ── Stage 2: build / prune ────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm prune --omit=dev

# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

ARG APP_VERSION=dev
ARG BUILD_DATE
ARG VCS_REF

LABEL org.opencontainers.image.title="Wolf Engine — Claude NLU" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="https://github.com/doualeh/wolf_inc-"

WORKDIR /app

RUN apk add --no-cache curl tini

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src          ./src
COPY --from=build /app/server.js    ./server.js
COPY --from=build /app/package.json ./package.json

RUN chown -R node:node /app

ENV APP_VERSION="${APP_VERSION}" \
    NODE_ENV=production \
    PORT=3000 \
    # Signals to server.js which route slice to load.
    NODE_SERVICE=claude

USER node

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:3000/health/live || exit 1
