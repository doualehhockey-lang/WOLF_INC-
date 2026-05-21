# packaging/docker/ollama.Dockerfile — Ollama LLM service.
#
# Extends the official Ollama image with:
#   - A pre-pull init script that downloads the model at image build time
#     (optional: can skip and use initContainer in Helm instead)
#   - Non-root user
#   - Health check
#
# NOTE: LLM images are large (several GB). In production, use a PVC
# + Helm initContainer to pull the model at pod startup rather than
# baking it into the image layer.
#
# To pre-bake the model (slower build, faster cold-start):
#   --build-arg PREBAKE_MODEL=true
#
# To skip pre-baking (default, faster build):
#   --build-arg PREBAKE_MODEL=false

# ── Stage 1: builder ──────────────────────────────────────────────────────────
# Exists for multi-stage convention consistency and future model pre-bake
# caching separated from the runtime image layer.

FROM ollama/ollama:latest AS builder

# Nothing to compile — the upstream image ships a complete Go binary.
# Future use: pre-pull model weights here and COPY --from=builder below.

# ── Stage 2: runtime ──────────────────────────────────────────────────────────

FROM ollama/ollama:latest AS runtime

ARG APP_VERSION=dev
ARG BUILD_DATE
ARG VCS_REF
ARG OLLAMA_MODEL=llama3.2:3b
ARG PREBAKE_MODEL=false

LABEL org.opencontainers.image.title="Wolf Engine — Ollama LLM" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}"

# Install curl for healthcheck + tini for signal handling.
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends curl tini \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user; Ollama stores models in /root/.ollama by default —
# re-point it to a path accessible to the wolf user.
RUN useradd --uid 1000 --system --no-create-home wolf \
    && mkdir -p /home/wolf/.ollama \
    && chown -R wolf:wolf /home/wolf

ENV OLLAMA_MODELS=/home/wolf/.ollama/models \
    OLLAMA_HOST=0.0.0.0:11434 \
    APP_VERSION="${APP_VERSION}"

# ── Optional model pre-bake ────────────────────────────────────────────────────
# Runs ollama pull during build. Significantly increases image size.
# Disabled by default; use initContainer in Helm for PVC-backed pulling.
RUN if [ "${PREBAKE_MODEL}" = "true" ]; then \
      ollama serve & \
      OLLAMA_PID=$! && \
      sleep 5 && \
      ollama pull "${OLLAMA_MODEL}" && \
      kill $OLLAMA_PID; \
    fi

# ── init script ───────────────────────────────────────────────────────────────
# Pull model at container startup if not already present (PVC scenario).
COPY --chown=wolf:wolf <<'EOF' /usr/local/bin/ollama-entrypoint.sh
#!/bin/sh
set -e
MODEL="${OLLAMA_MODEL:-llama3.2:3b}"
echo "[ollama] Starting server in background..."
ollama serve &
SERVER_PID=$!

# Wait for Ollama to be ready.
retries=0
until curl -fsS http://localhost:11434/ > /dev/null 2>&1; do
  retries=$((retries + 1))
  if [ $retries -gt 30 ]; then
    echo "[ollama] Timeout waiting for server"
    exit 1
  fi
  sleep 2
done

# Pull model if not already cached.
if ! ollama list | grep -q "^${MODEL}"; then
  echo "[ollama] Pulling model: ${MODEL}"
  ollama pull "${MODEL}"
fi

echo "[ollama] Ready — model ${MODEL} loaded."
# Hand off to the main server process.
wait $SERVER_PID
EOF

RUN chmod +x /usr/local/bin/ollama-entrypoint.sh

USER wolf

EXPOSE 11434

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/ollama-entrypoint.sh"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
  CMD curl -fsS http://localhost:11434/ || exit 1
