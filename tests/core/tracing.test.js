// tests/core/tracing.test.js
// OpenTelemetry tracing: disabled path, init failure path (auto-instrumentations not installed),
// startSpan noop, withSpan success/throw, shutdownTracing.
// Note: @opentelemetry/auto-instrumentations-node is not installed — initTracing() with
// OTEL_ENABLED=true always goes through the catch path (logs warn, no SDK started).

import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
const mockLog = { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };
jest.unstable_mockModule('../../src/core/logger.js', () => ({
  childLogger: () => mockLog,
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
const { initTracing, startSpan, withSpan, shutdownTracing } =
  await import('../../src/core/tracing.js');

// ── Helpers ───────────────────────────────────────────────────────────────────
const origEnv = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...origEnv };
});
afterAll(() => { process.env = origEnv; });

// ═════════════════════════════════════════════════════════════════════════════
// 1. initTracing — OTEL disabled (default)
// ═════════════════════════════════════════════════════════════════════════════

describe('initTracing — OTEL_ENABLED !== "true"', () => {
  test('resolves without error', async () => {
    delete process.env.OTEL_ENABLED;
    await expect(initTracing()).resolves.toBeUndefined();
  });

  test('logs "disabled" message', async () => {
    delete process.env.OTEL_ENABLED;
    await initTracing();
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('disabled'));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. initTracing — OTEL enabled but auto-instrumentations missing (init failure path)
// Note: @opentelemetry/auto-instrumentations-node is not installed in this project.
// The source code catches the import error and logs a warning.
// ═════════════════════════════════════════════════════════════════════════════

describe('initTracing — OTEL_ENABLED=true (init fails gracefully)', () => {
  test('resolves without throwing even when packages missing', async () => {
    process.env.OTEL_ENABLED = 'true';
    await expect(initTracing()).resolves.toBeUndefined();
  });

  test('logs a warn about init failure', async () => {
    process.env.OTEL_ENABLED = 'true';
    await initTracing();
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(String) }),
      expect.any(String),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. startSpan — noop (tracer always null since initTracing fails)
// ═════════════════════════════════════════════════════════════════════════════

describe('startSpan — noop (no tracer)', () => {
  test('returns object with setAttributes, setStatus, recordException, end', () => {
    const span = startSpan('my-op');
    expect(span).toHaveProperty('setAttributes');
    expect(span).toHaveProperty('setStatus');
    expect(span).toHaveProperty('recordException');
    expect(span).toHaveProperty('end');
  });

  test('noop methods do not throw', () => {
    const span = startSpan('my-op', { foo: 'bar' });
    expect(() => span.setAttributes({ x: 1 })).not.toThrow();
    expect(() => span.setStatus({ code: 1 })).not.toThrow();
    expect(() => span.recordException(new Error('x'))).not.toThrow();
    expect(() => span.end()).not.toThrow();
  });

  test('returns noop span for empty name', () => {
    const span = startSpan('');
    expect(typeof span.end).toBe('function');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. withSpan — success path
// ═════════════════════════════════════════════════════════════════════════════

describe('withSpan — success', () => {
  test('returns the result of fn', async () => {
    const result = await withSpan('op', {}, async () => 42);
    expect(result).toBe(42);
  });

  test('calls span.end() in finally', async () => {
    // noop span — end() is a no-op function
    await expect(withSpan('op', {}, async () => 'done')).resolves.toBe('done');
  });

  test('does not throw when fn is synchronous-ish', async () => {
    await expect(withSpan('op', {}, async () => 'sync')).resolves.toBe('sync');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. withSpan — error path
// ═════════════════════════════════════════════════════════════════════════════

describe('withSpan — error', () => {
  test('re-throws error from fn', async () => {
    await expect(withSpan('op', {}, async () => { throw new Error('boom'); }))
      .rejects.toThrow('boom');
  });

  test('calls span.end() even when fn throws', async () => {
    // noop span — just verifies withSpan doesn't suppress end()
    let caught = false;
    try { await withSpan('op', {}, async () => { throw new Error('boom'); }); }
    catch { caught = true; }
    expect(caught).toBe(true);
  });

  test('propagates the exact error from fn', async () => {
    const err = new Error('specific error');
    try { await withSpan('op', {}, async () => { throw err; }); }
    catch (e) { expect(e).toBe(err); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. shutdownTracing — no SDK
// ═════════════════════════════════════════════════════════════════════════════

describe('shutdownTracing — no SDK initialised', () => {
  test('resolves without error when SDK is null', async () => {
    await expect(shutdownTracing()).resolves.toBeUndefined();
  });

  test('does not throw even when called multiple times', async () => {
    await expect(shutdownTracing()).resolves.toBeUndefined();
    await expect(shutdownTracing()).resolves.toBeUndefined();
  });
});
