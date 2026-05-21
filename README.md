# Wolf Engine

A production-grade Node.js backend for AI-powered voice and SMS assistants. Built around a modular feature architecture, a resilient AI client with circuit breaking, and enterprise-quality observability.

---

## What It Does

Wolf Engine receives voice calls and SMS messages via Twilio, processes them through a natural language understanding (NLU) pipeline, dispatches intents to an event/agent layer, and responds with synthesized speech or text. The AI layer can run locally via Ollama during development and switches to the Claude API for production.

**Core capabilities:**

- **Voice pipeline** — receives Twilio webhooks, transcribes speech (Whisper), understands intent (NLU), dispatches actions, and returns TwiML with synthesized audio (ElevenLabs / Azure / Piper)
- **SMS pipeline** — same NLU + dispatch loop over SMS, with tone control per conversation
- **NLU** — Claude API (production) or Ollama (local prototype), with rule-based fallback when both are unavailable
- **Conversational memory** — Redis-backed session store with in-memory fallback; 15-minute TTL, 6-turn context window
- **Agent dispatch** — routes calendar/event intents to PostgreSQL (production) or a JSON file store (dev/offline)
- **Authentication** — JWT access tokens (15 min) + refresh tokens (7 days) with Redis-backed revocation
- **Feature flags** — Redis-backed kill switches for every subsystem (voice, SMS, NLU, TTS, rate limiting, audit log), with 30 s in-process cache and live admin controls
- **Observability** — Prometheus metrics, Pino structured logs, OpenTelemetry traces (Jaeger/Grafana Tempo), Prometheus-guarded `/metrics` endpoint

---

## Architecture

```
src/
├── api/                    # HTTP layer
│   ├── middleware/         # CORS, request ID, Twilio HMAC, error handler, validation
│   ├── router.js           # Top-level route mounting + /metrics auth
│   └── server.js           # Express app factory
│
├── core/                   # Shared infrastructure (no business logic)
│   ├── config.js           # Centralised env var validation (Zod)
│   ├── featureFlags.js     # Redis-backed kill switches with in-process cache
│   ├── logger.js           # Pino structured logger
│   ├── metrics.js          # Prometheus counters/histograms
│   └── tracing.js          # OpenTelemetry SDK bootstrap
│
├── features/               # Domain modules (one folder = one capability)
│   ├── admin/              # GET /admin/flags + PATCH /admin/flags/:name
│   ├── agent/              # Intent dispatch → PostgreSQL or JSON store
│   ├── auth/               # JWT issue/verify/refresh + auth middleware
│   ├── lang/               # Language detection + Twilio locale mapping
│   ├── memory/             # Conversational session store (Redis + in-memory)
│   ├── nlu/                # NLU orchestration: Claude → Ollama → rule-based
│   ├── responder/          # Response generation layer
│   ├── sms/                # SMS webhook controller + router
│   ├── tts/                # TTS service with provider abstraction
│   │   └── providers/      # ElevenLabs, Azure, Piper, mock
│   └── voice/              # Voice pipeline + rate limiter + TwiML builder
│
├── infra/                  # External system clients
│   ├── db/                 # Knex/PostgreSQL client
│   ├── http/               # Fetch wrapper with timeout
│   └── redis/              # ioredis wrapper with get/set/del helpers
│
└── services/               # Cross-cutting AI/resilience services
    ├── circuitBreaker.js   # Circuit breaker + withRetry + HttpError
    ├── claude.client.js    # Claude API client (NLU + translate)
    ├── metrics.js          # Request/failure/latency recording helpers
    └── ollama.client.js    # Ollama client (local prototype)
```

### How the modules connect

```
Twilio webhook
    │
    ▼
voice/pipeline.js
    ├── isEnabled(PIPELINE_VOICE)      ← feature flag kill switch
    ├── nlu/nlu.service.js             ← understand intent
    │       ├── claude.client.js       ← Claude API (prod)  ┐
    │       └── ollama.client.js       ← Ollama (local)     ┘ with circuit breaker + retry
    ├── memory/memory.service.js       ← conversation context (Redis)
    ├── agent/agent.service.js         ← dispatch intent → DB or JSON store
    ├── tts/tts.service.js             ← synthesize response audio
    └── TwiML response to Twilio
```

---

## Authentication

Access and refresh tokens are issued by `src/features/auth/token.service.js`:

- **Access token** — HS256-signed JWT, 15-minute expiry, verified on every protected route by `auth.middleware.js`
- **Refresh token** — HS256-signed JWT with a UUID `jti`, 7-day expiry. The `jti` is stored in Redis on issue and deleted on rotation, enabling immediate revocation
- **Rotation** — each refresh call issues a new token pair and invalidates the old `jti`

Machine-to-machine routes (Twilio, Prometheus) use static API keys or Bearer tokens configured via environment variables.

---

## AI Strategy: Prototype → Production

| Stage | NLU backend | When used |
|-------|-------------|-----------|
| **Local prototype** | Ollama (local LLM) | `CLAUDE_API_KEY` absent |
| **Production** | Claude API (`claude-haiku-4-5` / `claude-opus-4-6`) | `CLAUDE_API_KEY` set |
| **Emergency fallback** | Rule-based regex extractor | Circuit open or both APIs unavailable |

The NLU service in `src/features/nlu/nlu.service.js` selects the backend dynamically at request time — no restart required to switch from Ollama to Claude. The Claude client wraps every API call in a circuit breaker (5 consecutive failures or >50% error rate in 60 s opens the circuit) with exponential-backoff retry (2 retries, skips 4xx).

---

## Feature Flags

Every major subsystem has a Redis-backed kill switch, togglable at runtime without a deploy:

| Flag | Controls |
|------|----------|
| `pipeline.voice` | Voice call processing |
| `pipeline.sms` | SMS message processing |
| `memory.context` | Conversational memory reads/writes |
| `translation` | Multilingual response translation |
| `claude.nlu` | Claude API NLU (falls back to rule-based) |
| `rate.limit` | Per-caller rate limiting |
| `tts.elevenlabs` | ElevenLabs TTS provider |
| `tts.azure` | Azure TTS provider |
| `tts.piper` | Piper TTS provider |
| `audit.log` | Audit trail writes |

**Admin API:**
```
GET  /admin/flags           → current state of all flags
PATCH /admin/flags/:name    → { "enabled": true|false }
```

---

## Quality & Testing

### Test suite

```bash
npm test                  # full Jest suite
npm run test:coverage     # with V8 coverage report
```

The project has layered test coverage:

- **Unit tests** — each service and feature module tested in isolation with `jest.unstable_mockModule`
- **Integration-style tests** — circuit breaker, auth flow, rate limiter, feature flag wiring
- **Targeted mutation killers** — dedicated test files written specifically to kill surviving Stryker mutants (boundary conditions, operator inversions, null-path guards)

### Mutation testing (Stryker)

```bash
npm run stryker           # full 7-file mutation suite (~1 000 mutants)
```

Stryker injects faults (operator inversions, literal replacements, removed branches) and verifies that the test suite catches each one. Current scores:

| File | Mutation score |
|------|---------------|
| `circuitBreaker.js` | **95%** |
| `token.service.js` | **100%** |
| `claude.client.js` | **85%** |
| `memory.service.js` | **83%** |
| `rate-limiter.js` | **81%** |
| `nlu.service.js` | **74%** |
| `pipeline.js` | **72%** |
| **Overall** | **~82%** |

Gate: CI blocks merge if the overall score drops below **70%**.

### Why enterprise-ready

- Every subsystem has a kill switch — degraded mode without a deploy
- Circuit breaker prevents cascade failures from AI API outages
- All secrets validated at startup (Zod) — no silent misconfiguration
- Prometheus metrics + structured logs on every request path
- Audit log with IP hashing, session turn, token counts, and flag snapshot
- K8s manifests (namespace, deployments, HPA, ingress, RBAC, secrets) in `/k8s`
- Database migrations with rollback support (`npm run db:migrate` / `db:rollback`)

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- PostgreSQL (optional — falls back to JSON store)
- Redis (optional — falls back to in-memory)
- Ollama running locally (for AI in dev without a Claude API key)

### Setup

```bash
cp .env.example .env
# Edit .env — at minimum set PHONE_SALT, JWT_SECRET, JWT_REFRESH_SECRET, API_KEYS

npm install
npm run db:migrate        # optional, requires DB_HOST etc. in .env
npm run dev               # starts with nodemon
```

### Key environment variables

| Variable | Purpose |
|----------|---------|
| `CLAUDE_API_KEY` | Enables Claude API NLU (absent = Ollama fallback) |
| `CLAUDE_MODEL` | Model ID (default: `claude-haiku-4-5-20251001`) |
| `JWT_SECRET` | Access token signing key (min 32 chars) |
| `JWT_REFRESH_SECRET` | Refresh token signing key (different from above) |
| `TWILIO_ACCOUNT_SID` / `AUTH_TOKEN` | Twilio webhook HMAC validation |
| `REDIS_URL` | Redis connection (absent = in-memory fallback) |
| `METRICS_TOKEN` | Bearer token protecting `/metrics` in production |
| `OTEL_ENABLED` | Enable OpenTelemetry traces (`true`/`false`) |

Full reference: `.env.example`

---

## Roadmap

### Phase 1 — Local prototype (current)
- Ollama as local LLM backend
- JSON file store for events
- ngrok for Twilio webhook exposure
- In-memory session store

### Phase 2 — Production hardening (in progress)
- Claude API as primary NLU backend
- PostgreSQL for event persistence
- Redis for sessions, feature flags, and token revocation
- K8s deployment on staging namespace `wolf-engine-staging`
- Prometheus + Grafana observability stack

### Phase 3 — Scale & extend
- Multi-tenant support (per-account feature flags)
- Streaming TTS for lower voice latency
- Fine-tuned intent models per domain
- Webhook event replay and audit log UI
- Rate limiting per phone number at Redis level

---

## Scripts Reference

```bash
npm run dev               # development server (nodemon)
npm start                 # production server
npm test                  # Jest test suite
npm run test:coverage     # Jest + V8 coverage
npm run lint              # ESLint
npm run lint:fix          # ESLint --fix
npm run format            # Prettier write
npm run format:check      # Prettier check (CI)
npm run db:migrate        # Run pending migrations
npm run db:rollback       # Rollback last migration batch
npm run audit             # npm audit
npm run stryker           # Stryker mutation test suite
```

---

## License

Private — WOLF INC. All rights reserved.
