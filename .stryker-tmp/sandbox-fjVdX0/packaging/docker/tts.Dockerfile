# packaging/docker/tts.Dockerfile — TTS service (Piper + Node.js wrapper).
#
# Two-stage: install Piper binary, then build Node wrapper.
#
# Piper binary is downloaded from GitHub releases; the model file is
# mounted at runtime via a PersistentVolumeClaim (/models).

# ── Stage 1: Piper binary downloader ─────────────────────────────────────────
FROM alpine:3.20 AS piper-download

ARG PIPER_VERSION=2023.11.14-2
ARG TARGETARCH=amd64

WORKDIR /tmp

RUN apk add --no-cache curl tar \
    && ARCH="${TARGETARCH:-amd64}" \
    && if [ "$ARCH" = "arm64" ]; then ARCH="arm64"; fi \
    && curl -fsSL \
       "https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_${ARCH}.tar.gz" \
       -o piper.tar.gz \
    && tar -xzf piper.tar.gz \
    && chmod +x piper/piper

# ── Stage 2: Node deps ────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app
RUN apk add --no-cache python3 make g++ libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ── Stage 3: build / prune ────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm prune --omit=dev

# ── Stage 4: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

ARG APP_VERSION=dev
ARG BUILD_DATE
ARG VCS_REF

LABEL org.opencontainers.image.title="Wolf Engine — TTS (Piper)" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}"

WORKDIR /app

# Runtime OS deps: curl (healthcheck) + shared libs for Piper.
RUN apk add --no-cache curl tini libstdc++ libgomp

# Copy Piper binary from download stage.
COPY --from=piper-download /tmp/piper/piper /usr/local/bin/piper

# Copy Node application.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src          ./src
COPY --from=build /app/server.js    ./server.js
COPY --from=build /app/package.json ./package.json

# Model files are mounted at runtime; create mount point.
RUN mkdir -p /models /app/public/audio \
    && chown -R node:node /app /models

ENV APP_VERSION="${APP_VERSION}" \
    NODE_ENV=production \
    PORT=3000 \
    NODE_SERVICE=tts \
    # Piper binary path — matches the Helm values.yaml default.
    PIPER_BINARY=/usr/local/bin/piper \
    PIPER_MODEL_PATH=/models/fr_FR-siwis-medium.onnx \
    TTS_PROVIDER=piper

USER node

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

HEALTHCHECK --interval=20s --timeout=8s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:3000/health/live || exit 1
