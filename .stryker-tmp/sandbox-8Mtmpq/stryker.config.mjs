// @ts-nocheck
// stryker.config.mjs — Mutation testing configuration for Wolf Engine.
// Run: npx stryker run
// Targets the 7 most critical business-logic modules.
// Gate: break=70 (CI fails), low=75 (warning), high=85 (target).

// Inject NODE_OPTIONS into the Stryker process itself.
// Stryker spawns Jest worker sub-processes via child_process.fork() which
// inherits process.env — so setting it here propagates to every worker.
// This is the correct fix for: ESM mocks failing → mutation score 20% (false low).
process.env.NODE_OPTIONS = '--experimental-vm-modules';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner:       'jest',
  coverageAnalysis: 'perTest',

  // ── Modules to mutate ──────────────────────────────────────────────────────
  mutate: [
    'src/services/circuitBreaker.js',
    'src/features/auth/token.service.js',
    'src/features/voice/rate-limiter.js',
    'src/features/memory/memory.service.js',
    'src/services/claude.client.js',
    'src/features/nlu/nlu.service.js',
    'src/features/voice/pipeline.js',
    // Exclude infrastructure / config boilerplate
    '!src/core/config.js',
    '!src/core/logger.js',
    '!src/core/metrics.js',
    '!src/**/*.router.js',
    '!src/infra/**',
  ],

  // ── Thresholds ─────────────────────────────────────────────────────────────
  thresholds: {
    high:  85,  // green
    low:   75,  // yellow (warning)
    break: 70,  // red (CI gate — fails pipeline)
  },

  // ── Performance ────────────────────────────────────────────────────────────
  timeoutMS:       30_000,
  timeoutFactor:   2.0,
  concurrency:     4,
  incremental:     true,        // only re-test mutants affected by changed tests
  incrementalFile: '.stryker-incremental.json',

  // ── Jest integration ───────────────────────────────────────────────────────
  // jest.stryker.config.cjs sets NODE_OPTIONS=--experimental-vm-modules and
  // omits globalSetup (tests/setup.js). The env var must also be set in the
  // Stryker process before launch:
  //   NODE_OPTIONS=--experimental-vm-modules npx stryker run
  jest: {
    configFile:           'jest.stryker.config.cjs',
    enableFindRelatedTests: true,
  },

  // ── Reporters ──────────────────────────────────────────────────────────────
  reporters: ['html', 'clear-text', 'progress', 'json'],
  htmlReporter: { fileName: 'coverage/mutation/index.html' },
  jsonReporter:  { fileName: 'coverage/mutation/mutation.json' },

  // ── Ignore specific patterns (dead code / infrastructure) ─────────────────
  ignorePatterns: [
    'node_modules',
    'coverage',
    'frontend',
    '.stryker-tmp',
    // 'tests' intentionally NOT excluded — test files must be in the sandbox
  ],
};
