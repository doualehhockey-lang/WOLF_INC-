// tests/load/voice-pipeline.k6.js — k6 load test for Wolf Engine voice pipeline.
// Run: k6 run tests/load/voice-pipeline.k6.js
// Requires: K6_BASE_URL env var (default: http://localhost:3000)
//
// Stages:
//   0→2 min:  ramp up to 20 VUs
//   2→7 min:  sustain 50 VUs (steady state)
//   7→9 min:  peak 100 VUs
//   9→10 min: ramp down
//
// Thresholds:
//   P95 < 2000ms, P99 < 3000ms, error rate < 2%

import http   from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Custom metrics ────────────────────────────────────────────────────────────

const errorRate        = new Rate('wolf_errors');
const nluLatency       = new Trend('wolf_nlu_latency_ms');
const pipelineLatency  = new Trend('wolf_pipeline_latency_ms');

// ── Test config ───────────────────────────────────────────────────────────────

const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3000';
const JWT_TOKEN = __ENV.K6_JWT_TOKEN || '';

export const options = {
  stages: [
    { duration: '2m',  target: 20  }, // ramp up
    { duration: '5m',  target: 50  }, // sustained load
    { duration: '2m',  target: 100 }, // peak
    { duration: '1m',  target: 0   }, // ramp down
  ],
  thresholds: {
    'http_req_duration':    ['p(95)<2000', 'p(99)<3000'],
    'wolf_errors':          ['rate<0.02'],
    'wolf_pipeline_latency_ms': ['p(95)<2000', 'p(99)<3000'],
    'http_req_failed':      ['rate<0.02'],
  },
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TWILIO_PARAMS = [
  { CallSid: 'CA000001', From: '+33611111111', SpeechResult: 'Créer un rendez-vous demain à 14h30' },
  { CallSid: 'CA000002', From: '+33622222222', SpeechResult: 'Annuler mon rendez-vous de lundi' },
  { CallSid: 'CA000003', From: '+33633333333', SpeechResult: 'Modifier mon rendez-vous' },
  { CallSid: 'CA000004', From: '+33644444444', SpeechResult: 'Lister mes rendez-vous' },
  { CallSid: 'CA000005', From: '+33655555555', SpeechResult: 'Bonjour' },
];

function randomParam() {
  return TWILIO_PARAMS[Math.floor(Math.random() * TWILIO_PARAMS.length)];
}

function twilioHeaders() {
  return {
    'Content-Type':       'application/x-www-form-urlencoded',
    'X-Twilio-Signature': 'bypass-in-dev', // dev mode skips HMAC
  };
}

function authHeaders() {
  if (!JWT_TOKEN) return {};
  return { 'Authorization': `Bearer ${JWT_TOKEN}` };
}

function encodeForm(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

export default function () {
  const scenario = Math.random();

  if (scenario < 0.6) {
    // 60% — voice gather (main flow)
    _testGather();
  } else if (scenario < 0.8) {
    // 20% — voice webhook (inbound call)
    _testVoiceWebhook();
  } else if (scenario < 0.95) {
    // 15% — health check
    _testHealth();
  } else {
    // 5% — metrics endpoint
    _testMetrics();
  }

  sleep(0.5 + Math.random() * 1.5); // 0.5–2s think time
}

// ── Individual scenario functions ─────────────────────────────────────────────

function _testGather() {
  const p      = randomParam();
  const params = {
    CallSid:      p.CallSid,
    From:         p.From,
    SpeechResult: p.SpeechResult,
    Confidence:   '0.92',
  };

  const start = Date.now();
  const res   = http.post(
    `${BASE_URL}/twilio/gather`,
    encodeForm(params),
    { headers: twilioHeaders(), tags: { endpoint: 'gather' } }
  );
  pipelineLatency.add(Date.now() - start);

  const ok = check(res, {
    'gather: status 200':         (r) => r.status === 200,
    'gather: returns XML':        (r) => r.headers['Content-Type']?.includes('text/xml') ?? false,
    'gather: has <Response>':     (r) => r.body?.includes('<Response>') ?? false,
    'gather: response not empty': (r) => r.body?.length > 0 ?? false,
  });

  errorRate.add(!ok);
}

function _testVoiceWebhook() {
  const p      = randomParam();
  const params = {
    CallSid:    p.CallSid,
    From:       p.From,
    CallStatus: 'ringing',
    Direction:  'inbound',
  };

  const res = http.post(
    `${BASE_URL}/twilio/voice`,
    encodeForm(params),
    { headers: twilioHeaders(), tags: { endpoint: 'voice' } }
  );

  const ok = check(res, {
    'voice: status 200':     (r) => r.status === 200,
    'voice: has <Response>': (r) => r.body?.includes('<Response>') ?? false,
  });

  errorRate.add(!ok);
}

function _testHealth() {
  const res = http.get(`${BASE_URL}/health/live`, {
    tags: { endpoint: 'health' },
  });

  const ok = check(res, {
    'health: status 200':   (r) => r.status === 200,
    'health: ok in body':   (r) => r.json('status') === 'ok',
    'health: fast (<200ms)':(r) => r.timings.duration < 200,
  });

  errorRate.add(!ok);
}

function _testMetrics() {
  const res = http.get(`${BASE_URL}/metrics`, {
    headers: authHeaders(),
    tags: { endpoint: 'metrics' },
  });

  check(res, {
    'metrics: status 200 or 401': (r) => r.status === 200 || r.status === 401,
  });
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

export function setup() {
  // Verify the server is reachable before starting
  const res = http.get(`${BASE_URL}/health/live`);
  if (res.status !== 200) {
    throw new Error(`Wolf Engine not reachable at ${BASE_URL} — got HTTP ${res.status}`);
  }
  console.log(`Wolf Engine load test starting — target: ${BASE_URL}`);
  return { baseUrl: BASE_URL };
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values?.['p(95)'] ?? 0;
  const p99 = data.metrics.http_req_duration?.values?.['p(99)'] ?? 0;
  const errRate = (data.metrics.wolf_errors?.values?.rate ?? 0) * 100;

  console.log('\n═══════════════════ Wolf Engine Load Test Summary ═══════════════════');
  console.log(`  P95 latency:  ${p95.toFixed(0)}ms  (threshold: <2000ms)`);
  console.log(`  P99 latency:  ${p99.toFixed(0)}ms  (threshold: <3000ms)`);
  console.log(`  Error rate:   ${errRate.toFixed(2)}%  (threshold: <2%)`);
  console.log('════════════════════════════════════════════════════════════════════\n');

  return {
    stdout: JSON.stringify(data, null, 2),
  };
}
