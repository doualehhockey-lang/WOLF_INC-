<<<<<<< HEAD
# ── Stage 1: frontend build ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ── Stage 2: backend deps (production only) ───────────────────────────────────
=======
# ── Build stage ───────────────────────────────────────────────────────────────
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
FROM node:20-alpine AS deps

WORKDIR /app

<<<<<<< HEAD
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ── Stage 3: production runner ────────────────────────────────────────────────
=======
# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ── Production stage ──────────────────────────────────────────────────────────
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
FROM node:20-alpine AS production

# Non-root user for security
RUN addgroup -S wolf && adduser -S wolf -G wolf

WORKDIR /app

<<<<<<< HEAD
# Copy production deps
COPY --from=deps /app/node_modules ./node_modules

# Copy application source (backend)
COPY --chown=wolf:wolf . .

# Copy built frontend (Next.js .next output + public)
COPY --from=frontend-builder --chown=wolf:wolf /app/frontend/.next ./frontend/.next
COPY --from=frontend-builder --chown=wolf:wolf /app/frontend/public ./frontend/public

# Remove dev/CI artifacts not needed at runtime
RUN rm -rf tests .github infra frontend/node_modules

# Create runtime directories
=======
# Copy deps from build stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY --chown=wolf:wolf . .

# Remove dev artifacts
RUN rm -rf tests .github infra

# Create audio output dir owned by app user
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
RUN mkdir -p public/audio data && chown -R wolf:wolf public data

USER wolf

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000 \
    AUDIO_DIR=./public/audio

<<<<<<< HEAD
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
=======
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  CMD wget -qO- http://localhost:3000/health/live || exit 1

CMD ["node", "server.js"]
