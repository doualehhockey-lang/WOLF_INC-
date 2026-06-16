// @ts-nocheck
// tests/core/config.otel.test.js
// Covers core/config.js line 68:
//   OTEL_ENABLED: z.string().transform(v => v === 'true').default('false')
//   The transform v => v === 'true' only fires when OTEL_ENABLED is explicitly set.
//   Setting OTEL_ENABLED='true' triggers the transform and returns true.

// Set env BEFORE import so schema.parse(process.env) sees it
const savedOtelEnabled = process.env.OTEL_ENABLED;
const savedNodeEnv     = process.env.NODE_ENV;

process.env.OTEL_ENABLED = 'true';
process.env.NODE_ENV     = process.env.NODE_ENV ?? 'test';

const { config } = await import('../../src/core/config.js');

// Restore env
if (savedOtelEnabled !== undefined) process.env.OTEL_ENABLED = savedOtelEnabled;
else delete process.env.OTEL_ENABLED;

// ═════════════════════════════════════════════════════════════════════════════
// Line 68: OTEL_ENABLED transform v => v === 'true'
// ═════════════════════════════════════════════════════════════════════════════

describe('config.js — OTEL_ENABLED Zod transform (line 68)', () => {
  test('transform converts "true" string to boolean true', () => {
    // The transform v => v === 'true' was called with 'true' → returns true
    expect(config.OTEL_ENABLED).toBe(true);
  });
});
