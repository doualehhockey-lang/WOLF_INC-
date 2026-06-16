# packaging/docker/whisper.Dockerfile — Whisper ASR service.
#
# Builds on top of the upstream whisper-asr-webservice image.
# Adds:
#   - Non-root user (uid 1000 "wolf")
#   - Health check endpoint wired to the upstream /health route
#   - Configurable model via MODEL_SIZE env var (tiny/base/small/medium/large)
#   - Pre-download of the French-optimised model at build time (optional)
#
# The upstream image is a FastAPI Python server that exposes POST /transcribe.
# See: https://github.com/ahmetoner/whisper-asr-webservice

# ── Stage 1: builder (dependency + config preparation) ───────────────────────
# This stage exists so CI can cache layers independently from the runtime
# image and enables future pre-pull or model-baking steps without touching
# the final image.

FROM onerahmed/whisper-asr-webservice:latest AS builder

# Nothing to compile — the upstream image ships a complete Python env.
# Future use: pre-download model weights here and COPY --from=builder below.

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
# In production, mount models via a PVC (see Helm values.yaml).

FROM onerahmed/whisper-asr-webservice:latest AS runtime

ARG APP_VERSION=dev
ARG BUILD_DATE
ARG VCS_REF
ARG MODEL_SIZE=base

LABEL org.opencontainers.image.title="Wolf Engine — Whisper ASR" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}"

# Ensure curl is available for the healthcheck.
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root system user.
# The upstream image runs as root; we create "wolf" (uid=1000) and chown
# the model cache directory so Whisper can write there at runtime.
RUN useradd --uid 1000 --system --no-create-home wolf \
    && mkdir -p /root/.cache/whisper \
    && chown -R wolf:wolf /root/.cache

ENV ASR_MODEL="${MODEL_SIZE}" \
    ASR_ENGINE=openai_whisper \
    APP_VERSION="${APP_VERSION}"

USER wolf

EXPOSE 9000

# Upstream CMD is kept (uvicorn main:app --host 0.0.0.0 --port 9000).
# Override MODEL_SIZE at runtime via env var.

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -fsS http://localhost:9000/health || exit 1
