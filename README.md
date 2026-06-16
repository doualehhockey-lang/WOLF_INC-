# Wolf — AI Receptionist for Medical Clinics

Wolf is a SaaS platform that replaces the front-desk receptionist of medical and dental clinics with a human-sounding AI that answers phone calls, books appointments, and manages patient schedules — 24/7, in real time, via a regular phone call.

Built with Node.js, Claude API, Twilio, ElevenLabs, PostgreSQL, Redis, Stripe, and Next.js.

## What It Does

A patient calls the clinic's phone number. Wolf answers instantly — not with a robotic IVR menu, but with a natural French-speaking voice named Sophie. Sophie has a personality, understands context, makes small talk, shows empathy, and handles the full appointment lifecycle through a real conversation.

### Voice AI (Core Product)

- Conversational AI receptionist powered by Claude with tool-use
- Speaks naturally in French (adapts to English/Spanish automatically)
- Books, cancels, modifies, and lists appointments via voice
- Validates business hours before booking
- Handles urgencies, pricing questions, anxiety, small talk
- Pre-warmed greeting and filler audio — zero dead silence
- ElevenLabs TTS for human-quality voice synthesis
- Twilio STT + webhooks for telephony integration
- Circuit breaker + structured fallback if Claude API is down
- Conversation memory across turns (Redis-backed sessions)

### SMS Channel

- Inbound SMS processing with same NLU pipeline
- SMS appointment reminders (24h and 2h before)
- SMS cancellation via keyword ("ANNULER")
- Staff notifications for new bookings

### Multi-Tenant SaaS

- Tenant isolation via JWT claims
- Stripe Checkout + Billing Portal (49 EUR/month)
- Subscription enforcement middleware
- Per-tenant settings (business hours, closed days, SMS preferences)
- Public booking page per tenant (`/book/:tenantId`)

### Admin Dashboard (Next.js)

- Real-time call and appointment analytics
- Feature flag management (kill any subsystem without restart)
- User and API key management
- GDPR data export and deletion
- Security audit logs
- Subscription status and billing portal

### Security

- JWT access + refresh tokens with HttpOnly cookies
- JTI-based token revocation
- Twilio HMAC signature verification
- Redis-backed rate limiting (per-IP and per-phone)
- API key authentication for machine-to-machine
- Phone number hashing (GDPR compliance)
- Gather-level idempotency (SHA-256 deduplication)

## Architecture

```
Phone Call ──▶ Twilio ──▶ POST /twilio/voice
                              │
                    ┌─────────▼──────────┐
                    │  Sophie (Claude AI) │
                    │  Thinks freely      │
                    │  Uses tools:        │
                    │  - create_appointment│
                    │  - cancel_appointment│
                    │  - list_appointments │
                    │  - check_hours      │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │  ElevenLabs TTS    │
                    │  (human voice)     │
                    └─────────┬──────────┘
                              │
                    TwiML ◀───┘ (audio response)
```

Fallback chain: Claude conversational → NLU intent extraction → rule-based regex → static French responses.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20, ESM |
| API | Express 4, Zod validation, Pino structured logging |
| Database | PostgreSQL 16 (Knex migrations) |
| Cache | Redis 7 (sessions, rate limits, feature flags, TTS cache) |
| AI | Claude API (Anthropic) — conversational agent with tool-use |
| Voice | Twilio (STT webhooks, TwiML responses) |
| TTS | ElevenLabs (eleven_multilingual_v2) with Piper/Azure fallback |
| Billing | Stripe Checkout + Webhooks + Billing Portal |
| Frontend | Next.js 14, React |
| CI/CD | GitHub Actions, Docker, GHCR |
| Monitoring | Prometheus metrics, Alertmanager |

## Quick Start

```bash
cp .env.production.example .env
# Fill in: JWT_SECRET, CLAUDE_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
#          ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, STRIPE_SECRET_KEY
docker compose up -d
```

App available at `http://localhost:3000`. Database migrations run automatically.

## Environment Variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `CLAUDE_API_KEY` | Yes | Anthropic API key for conversational AI |
| `CLAUDE_MODEL` | No | Model ID (default: claude-sonnet-4-20250514) |
| `TTS_PROVIDER` | No | `elevenlabs`, `azure`, `piper`, or `mock` (default: mock) |
| `ELEVENLABS_API_KEY` | For ElevenLabs | ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | For ElevenLabs | Voice clone ID |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio auth token |
| `JWT_SECRET` | Yes | Access token signing key |
| `JWT_REFRESH_SECRET` | Yes | Refresh token signing key |
| `STRIPE_SECRET_KEY` | For billing | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | For billing | Stripe webhook signing secret |
| `STRIPE_PRICE_ID` | For billing | Stripe price ID (49 EUR/month) |
| `DB_HOST` | For PostgreSQL | Database host |
| `DB_PASSWORD` | For PostgreSQL | Database password |
| `REDIS_URL` | No | Redis connection string (in-memory fallback if absent) |
| `BASE_URL` | Yes | Public URL (e.g. https://wolf.example.com) |

## API Endpoints

### Voice (Twilio webhooks)
- `POST /twilio/voice` — Incoming call handler
- `POST /twilio/gather` — Speech result processor
- `POST /twilio/gather-result` — Async pipeline result
- `POST /twilio/status` — Call status callback
- `GET /twilio/health` — Voice subsystem health

### Auth
- `POST /auth/login` — JWT login
- `POST /auth/refresh` — Token refresh
- `POST /auth/logout` — Revoke tokens
- `POST /auth/signup` — Tenant registration

### Appointments
- `GET /api/events` — List appointments
- `POST /api/events` — Create appointment
- `PATCH /api/events/:id` — Update appointment
- `DELETE /api/events/:id` — Cancel appointment

### Admin
- `GET/POST/PUT/DELETE /admin/users` — User management
- `GET/POST/DELETE /admin/api-keys` — API key management
- `GET /admin/security-logs` — Audit log viewer

### Billing
- `POST /api/billing/checkout` — Create Stripe Checkout session
- `POST /api/billing/portal` — Create Billing Portal session
- `POST /api/billing/webhook` — Stripe webhook handler

### GDPR
- `POST /gdpr/export` — Export all patient data
- `POST /gdpr/delete` — Delete all patient data
- `POST /gdpr/consent` — Update consent preferences

## Testing

```bash
npm test                    # 126 test suites, 1845 tests
npm run test:coverage       # Coverage report
```

## Deployment

GitHub Actions CD pipeline builds Docker image and deploys via SSH.

Required GitHub Secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`.

```bash
sudo bash scripts/server-setup.sh          # One-time server prep
bash scripts/healthcheck.sh https://domain  # Post-deploy verification
```

## License

Proprietary — WOLF INC. All rights reserved.
