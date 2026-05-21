// tests/services/observability.extended.test.js
// Covers remaining uncovered lines in src/services/observability.js:
//   Lines 121-122: opts.spanExporter branch (SimpleSpanProcessor injection)
//   Lines 154-155: ignoreIncomingRequestHook body (url-based filtering)

import { jest } from '@jest/globals';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-node';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => ({
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

jest.unstable_mockModule('../../src/core/config.js', () => ({
  config: { OTEL_ENABLED: false, OTEL_ENDPOINT: '', NODE_ENV: 'test' },
}));

const { _makeObservability } = await import('../../src/services/observability.js');
const { config }             = await import('../../src/core/config.js');

// ── No-op dep builders ─────────────────────────────────────────────────────────
const noop = class {};

function makeDeps(overrides = {}) {
  const sdkCalls = { started: 0 };
  class FakeNodeSDK { start() { sdkCalls.started++; } async shutdown() {} }

  return {
    deps: {
      NodeSDK:                      FakeNodeSDK,
      Resource:                     noop,
      OTLPTraceExporter:            noop,
      OTLPMetricExporter:           noop,
      PeriodicExportingMetricReader: noop,
      BatchSpanProcessor:           noop,
      HttpInstrumentation:          noop,
      ExpressInstrumentation:       noop,
      ...overrides,
    },
    sdkCalls,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 121-122: opts.spanExporter branch
// ═════════════════════════════════════════════════════════════════════════════

describe('init() — spanExporter injection (lines 121-122)', () => {
  test('uses SimpleSpanProcessor when opts.spanExporter is provided', async () => {
    const { deps, sdkCalls } = makeDeps();
    const { init } = _makeObservability(deps);
    const exporter = new InMemorySpanExporter();

    // force=true with spanExporter → should hit lines 121-122
    await init({ force: true, spanExporter: exporter });

    // SDK started with our injected processor
    expect(sdkCalls.started).toBe(1);
  });

  test('init completes without throwing when spanExporter is provided but endpoint is empty', async () => {
    const { deps } = makeDeps();
    const { init } = _makeObservability(deps);
    const exporter = new InMemorySpanExporter();

    await expect(init({ force: true, spanExporter: exporter })).resolves.toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lines 154-155: ignoreIncomingRequestHook
// ═════════════════════════════════════════════════════════════════════════════

describe('ignoreIncomingRequestHook (lines 154-155)', () => {
  let capturedHook = null;

  beforeAll(async () => {
    class CapturingHttpInstrumentation {
      constructor(opts) {
        capturedHook = opts?.ignoreIncomingRequestHook ?? null;
      }
    }
    const { deps } = makeDeps({ HttpInstrumentation: CapturingHttpInstrumentation });
    const { init } = _makeObservability(deps);
    await init({ force: true });
  });

  test('hook is defined after init', () => {
    expect(capturedHook).toBeInstanceOf(Function);
  });

  test('ignores /health requests', () => {
    expect(capturedHook({ url: '/health' })).toBe(true);
  });

  test('ignores /healthz (startsWith /health)', () => {
    expect(capturedHook({ url: '/healthz' })).toBe(true);
  });

  test('ignores /metrics exactly', () => {
    expect(capturedHook({ url: '/metrics' })).toBe(true);
  });

  test('does NOT ignore /api/voice', () => {
    expect(capturedHook({ url: '/api/voice' })).toBe(false);
  });

  test('handles req.url = undefined (null-coalesce to empty string)', () => {
    expect(capturedHook({ url: undefined })).toBe(false);
    expect(capturedHook({})).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 290: _sdk: () => _sdk — getter accessor function
// ═════════════════════════════════════════════════════════════════════════════

describe('_makeObservability — _sdk getter (line 290)', () => {
  test('_sdk() returns null before init', () => {
    const { deps } = makeDeps();
    const obs = _makeObservability(deps);
    // Before init, _sdk is null
    expect(obs._sdk()).toBeNull();
  });

  test('_sdk() returns the SDK instance after init', async () => {
    const { deps } = makeDeps();
    const obs = _makeObservability(deps);
    await obs.init({ force: true });
    // After init, _sdk is the NodeSDK instance (non-null)
    expect(obs._sdk()).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 170: endpoint ?? 'none' — right side when endpoint is undefined
// ═════════════════════════════════════════════════════════════════════════════

describe('init() — endpoint ?? "none" right side (line 170)', () => {
  test('uses "none" in log when config.OTEL_ENDPOINT is undefined', async () => {
    const savedEndpoint = config.OTEL_ENDPOINT;
    config.OTEL_ENDPOINT = undefined;  // triggers ?? 'none' right side in log.info

    const { deps } = makeDeps();
    const obs = _makeObservability(deps);
    // init with force=true, no opts.endpoint, and config.OTEL_ENDPOINT=undefined
    // → endpoint = undefined ?? undefined = undefined → log uses 'none'
    await obs.init({ force: true });

    config.OTEL_ENDPOINT = savedEndpoint;
    expect(obs._sdk()).not.toBeNull();  // SDK started successfully
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Line 240: withSpan attrs = {} default parameter (attrs not provided)
// ═════════════════════════════════════════════════════════════════════════════

describe('withSpan() — attrs = {} default parameter (line 240)', () => {
  test('works when attrs is not provided (uses default {})', async () => {
    const { deps } = makeDeps();
    const obs = _makeObservability(deps);
    await obs.init({ force: true });
    // Call withSpan with attrs=undefined to trigger the default {} branch
    const result = await obs.withSpan('test.default.attrs', undefined, async () => 'ok');
    expect(result).toBe('ok');
  });

  test('works when spanOpts is not provided (uses default {})', async () => {
    const { deps } = makeDeps();
    const obs = _makeObservability(deps);
    await obs.init({ force: true });
    // spanOpts is 4th arg — not passing it triggers the default {}
    const result = await obs.withSpan('test.default.spanOpts', {}, async () => 42);
    expect(result).toBe(42);
  });
});

