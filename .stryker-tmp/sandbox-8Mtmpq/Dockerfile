# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Non-root user for security
RUN addgroup -S wolf && adduser -S wolf -G wolf

WORKDIR /app

# Copy deps from build stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY --chown=wolf:wolf . .

# Remove dev artifacts
RUN rm -rf tests .github infra

# Create audio output dir owned by app user
RUN mkdir -p public/audio data && chown -R wolf:wolf public data

USER wolf

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000 \
    AUDIO_DIR=./public/audio

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health/live || exit 1

CMD ["node", "server.js"]
