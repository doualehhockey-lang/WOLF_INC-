// tests/ci.test.js
//
// Validates the GitHub Actions CI/CD workflow file (.github/workflows/ci.yml).
//
// Two test layers:
//   1. STRUCTURE — read the YAML source and assert required keys, jobs, secrets,
//      dependencies, and conditions are present.
//   2. SIMULATION — pure-JS pipeline simulator that mirrors the canary/rollback
//      logic, allowing us to test success / canary-failure / full-deploy-failure
//      scenarios without touching a real server.

import { readFileSync } from 'node:fs';
import { resolve }      from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect, beforeAll } from '@jest/globals';

// ── Helpers ───────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const WORKFLOW_PATH = resolve(__dirname, '../.github/workflows/ci.yml');

let yaml; // raw file content — loaded once

beforeAll(() => {
  yaml = readFileSync(WORKFLOW_PATH, 'utf8');
});

/** Assert a string appears in the workflow YAML. */
function assertContains(substring, label) {
  if (!yaml.includes(substring)) {
    throw new Error(`Expected workflow to contain "${label ?? substring}"`);
  }
}

// ── 1. STRUCTURE TESTS ────────────────────────────────────────────────────────

describe('workflow file — structure', () => {

  test('file is non-empty and readable', () => {
    expect(yaml.length).toBeGreaterThan(500);
  });

  // ── Triggers

  test('triggers on push to master and main', () => {
    expect(yaml).toMatch(/branches:.*\[.*master.*\]/s);
    expect(yaml).toMatch(/branches:.*\[.*main.*\]/s);
  });

  test('triggers on pull_request to master and main', () => {
    expect(yaml).toContain('pull_request');
  });

  test('triggers on version tags (v*)', () => {
    expect(yaml).toContain("tags: ['v*']");
  });

  // ── Concurrency

  test('defines concurrency group to prevent queue pile-up', () => {
    expect(yaml).toContain('concurrency:');
    expect(yaml).toContain('cancel-in-progress: true');
  });

  // ── Required jobs

  const REQUIRED_JOBS = ['lint', 'test', 'build', 'deploy-canary', 'smoke-test', 'deploy-full', 'rollback', 'notify'];

  for (const job of REQUIRED_JOBS) {
    test(`job "${job}" is defined`, () => {
      // A job definition appears as "  jobname:" at the jobs level.
      expect(yaml).toMatch(new RegExp(`^  ${job}:`, 'm'));
    });
  }

  // ── Job dependencies (needs:)

  test('build depends on lint and test', () => {
    expect(yaml).toMatch(/needs:\s*\[lint,\s*test\]/);
  });

  test('deploy-canary depends on build', () => {
    expect(yaml).toMatch(/deploy-canary[\s\S]{0,200}needs:\s*\[build\]/m);
  });

  test('smoke-test depends on build and deploy-canary', () => {
    expect(yaml).toMatch(/smoke-test[\s\S]{0,300}needs:\s*\[build,\s*deploy-canary\]/m);
  });

  test('deploy-full depends on build and smoke-test', () => {
    expect(yaml).toMatch(/deploy-full[\s\S]{0,300}needs:\s*\[build,\s*smoke-test\]/m);
  });

  test('rollback depends on build, smoke-test, and deploy-full', () => {
    expect(yaml).toMatch(/rollback[\s\S]{0,300}needs:\s*\[build,\s*smoke-test,\s*deploy-full\]/m);
  });

  test('notify depends on build, deploy-full, and rollback', () => {
    expect(yaml).toMatch(/notify[\s\S]{0,300}needs:\s*\[build,\s*deploy-full,\s*rollback\]/m);
  });

  // ── Conditions

  test('deploy-canary only runs on push to master/main (not PRs)', () => {
    expect(yaml).toMatch(/deploy-canary[\s\S]{0,600}github\.event_name == 'push'/m);
    expect(yaml).toMatch(/deploy-canary[\s\S]{0,600}refs\/heads\/master/m);
  });

  test('deploy-full only runs when smoke-test succeeds', () => {
    expect(yaml).toMatch(/deploy-full[\s\S]{0,600}smoke-test\.result == 'success'/m);
  });

  test('rollback triggers when smoke-test or deploy-full fails', () => {
    expect(yaml).toMatch(/rollback[\s\S]{0,600}smoke-test\.result == 'failure'/m);
    expect(yaml).toMatch(/rollback[\s\S]{0,600}deploy-full\.result == 'failure'/m);
  });

  test('rollback uses always() to run even when dependencies fail', () => {
    expect(yaml).toMatch(/rollback[\s\S]{0,400}always\(\)/m);
  });

  test('notify uses always() to always send a notification', () => {
    expect(yaml).toMatch(/notify[\s\S]{0,400}always\(\)/m);
  });

  // ── Required secrets

  const REQUIRED_SECRETS = [
    'DEPLOY_HOST',
    'DEPLOY_USER',
    'DEPLOY_KEY',
    'CANARY_URL',
    'NOTIFICATION_WEBHOOK',
  ];

  for (const secret of REQUIRED_SECRETS) {
    test(`secret ${secret} is referenced`, () => {
      expect(yaml).toContain(`secrets.${secret}`);
    });
  }

  // ── Artifacts

  test('coverage report is uploaded as an artifact', () => {
    expect(yaml).toMatch(/coverage-report/);
    expect(yaml).toMatch(/path: coverage\//);
  });

  test('build metadata is uploaded as an artifact', () => {
    expect(yaml).toContain('build-metadata');
    expect(yaml).toContain('build-meta/');
  });

  test('deploy logs are uploaded (canary, full, rollback)', () => {
    expect(yaml).toContain('deploy-log-canary');
    expect(yaml).toContain('deploy-log-full');
    expect(yaml).toContain('deploy-log-rollback');
  });

  test('artifacts have retention-days set', () => {
    expect(yaml).toMatch(/retention-days: \d+/);
  });

  // ── Node.js setup

  test('uses Node.js 20 (via NODE_VERSION env)', () => {
    // The workflow sets NODE_VERSION: '20' and references it via ${{ env.NODE_VERSION }}.
    expect(yaml).toContain("NODE_VERSION: '20'");
    expect(yaml).toContain('node-version: ${{ env.NODE_VERSION }}');
  });

  test('uses npm cache', () => {
    expect(yaml).toMatch(/cache: npm/);
  });

  // ── Docker

  test('uses GHCR registry', () => {
    expect(yaml).toContain('ghcr.io');
    expect(yaml).toContain('REGISTRY:');
  });

  test('uses GHA layer cache for Docker builds', () => {
    expect(yaml).toContain('cache-from: type=gha');
    expect(yaml).toContain('cache-to:   type=gha,mode=max');
  });

  test('only pushes Docker image on non-PR events', () => {
    // The YAML key uses extra spaces for alignment; match loosely.
    expect(yaml).toMatch(/push:\s+\$\{\{ github\.event_name != 'pull_request' \}\}/);
  });

  // ── Security audit

  test('security audit runs on prod deps at HIGH level', () => {
    expect(yaml).toContain('npm audit --audit-level=high');
  });

  // ── Timeouts

  test('every deploy job has a timeout', () => {
    // All deploy-phase jobs (canary, full, rollback) must define a timeout.
    const deployJobs = ['deploy-canary', 'deploy-full', 'rollback'];
    for (const job of deployJobs) {
      // Grab the block from the job name up to the next top-level job definition.
      const pattern = new RegExp(`  ${job}:[\\s\\S]+?(?=\\n  \\w[\\w-]+:\\n    name:)`, 'g');
      const block = yaml.match(pattern)?.[0] ?? '';
      expect(block).toMatch(/timeout-minutes:/);
    }
  });

  // ── Notifications

  test('notification payload supports Slack (attachments) and Discord (embeds)', () => {
    expect(yaml).toContain('"attachments"');
    expect(yaml).toContain('"embeds"');
  });

  test('notification includes commit SHA, actor, and run URL', () => {
    expect(yaml).toContain('github.sha');
    expect(yaml).toContain('github.actor');
    expect(yaml).toContain('actions/runs');
  });
});

// ── 2. PIPELINE SIMULATION ────────────────────────────────────────────────────
//
// A minimal in-process simulator that mirrors the canary → smoke-test →
// full-deploy → rollback decision tree.  No real Docker or SSH involved.

/**
 * Simulate one pipeline run.
 *
 * @param {object} opts
 * @param {boolean} [opts.lintPass=true]
 * @param {boolean} [opts.testPass=true]
 * @param {boolean} [opts.buildPass=true]
 * @param {boolean} [opts.canaryPass=true]     canary container starts OK
 * @param {boolean} [opts.smokeTestPass=true]  external HTTP checks pass
 * @param {boolean} [opts.fullDeployPass=true] 100% rollout succeeds
 * @param {boolean} [opts.rollbackPass=true]   rollback re-deploy succeeds
 *
 * @returns {{
 *   stages: string[],
 *   finalStatus: 'success'|'rollback'|'rollback_failed'|'failed',
 *   artifacts: string[],
 *   notified: boolean,
 *   rolledBackTo: string|null
 * }}
 */
function simulatePipeline(opts = {}) {
  const {
    lintPass      = true,
    testPass      = true,
    buildPass     = true,
    canaryPass    = true,
    smokeTestPass = true,
    fullDeployPass = true,
    rollbackPass  = true,
  } = opts;

  const stages   = [];
  const artifacts = [];
  let finalStatus  = 'failed';
  let notified     = false;
  let rolledBackTo = null;

  // ── lint + test (parallel) ──────────────────────────────────────────────────
  if (!lintPass) {
    stages.push('lint:FAILED');
    finalStatus = 'failed';
    return { stages, finalStatus, artifacts, notified, rolledBackTo };
  }
  stages.push('lint:ok');

  if (!testPass) {
    stages.push('test:FAILED');
    artifacts.push('coverage-report');  // uploaded even on failure
    finalStatus = 'failed';
    return { stages, finalStatus, artifacts, notified, rolledBackTo };
  }
  stages.push('test:ok');
  artifacts.push('coverage-report');

  // ── build ───────────────────────────────────────────────────────────────────
  if (!buildPass) {
    stages.push('build:FAILED');
    finalStatus = 'failed';
    return { stages, finalStatus, artifacts, notified, rolledBackTo };
  }
  stages.push('build:ok');
  artifacts.push('build-metadata');

  // ── deploy-canary ───────────────────────────────────────────────────────────
  if (!canaryPass) {
    stages.push('deploy-canary:FAILED');
    artifacts.push('deploy-log-canary');
    // Canary failure does NOT trigger rollback (production was never touched).
    finalStatus = 'failed';
    notified = true;
    return { stages, finalStatus, artifacts, notified, rolledBackTo };
  }
  stages.push('deploy-canary:ok');
  artifacts.push('deploy-log-canary');

  // ── smoke-test ──────────────────────────────────────────────────────────────
  if (!smokeTestPass) {
    stages.push('smoke-test:FAILED');

    // Rollback (canary container is running but production was never changed —
    // rollback here means just removing the canary).
    if (rollbackPass) {
      stages.push('rollback:ok');
      artifacts.push('deploy-log-rollback');
      finalStatus = 'rollback';
    } else {
      stages.push('rollback:FAILED');
      artifacts.push('deploy-log-rollback');
      finalStatus = 'rollback_failed';
    }
    rolledBackTo = 'sha-prev';
    notified = true;
    return { stages, finalStatus, artifacts, notified, rolledBackTo };
  }
  stages.push('smoke-test:ok');

  // ── deploy-full ─────────────────────────────────────────────────────────────
  if (!fullDeployPass) {
    stages.push('deploy-full:FAILED');
    artifacts.push('deploy-log-full');

    if (rollbackPass) {
      stages.push('rollback:ok');
      artifacts.push('deploy-log-rollback');
      finalStatus = 'rollback';
    } else {
      stages.push('rollback:FAILED');
      artifacts.push('deploy-log-rollback');
      finalStatus = 'rollback_failed';
    }
    rolledBackTo = 'sha-prev';
    notified = true;
    return { stages, finalStatus, artifacts, notified, rolledBackTo };
  }
  stages.push('deploy-full:ok');
  artifacts.push('deploy-log-full');

  finalStatus = 'success';
  notified = true;
  return { stages, finalStatus, artifacts, notified, rolledBackTo };
}

describe('pipeline simulation — happy path', () => {
  test('all stages pass → success, all artifacts present, notification sent', () => {
    const result = simulatePipeline();

    expect(result.finalStatus).toBe('success');
    expect(result.notified).toBe(true);
    expect(result.rolledBackTo).toBeNull();

    expect(result.stages).toEqual([
      'lint:ok', 'test:ok', 'build:ok',
      'deploy-canary:ok', 'smoke-test:ok', 'deploy-full:ok',
    ]);

    // All expected artifacts must be present.
    expect(result.artifacts).toContain('coverage-report');
    expect(result.artifacts).toContain('build-metadata');
    expect(result.artifacts).toContain('deploy-log-canary');
    expect(result.artifacts).toContain('deploy-log-full');
    expect(result.artifacts).not.toContain('deploy-log-rollback');
  });
});

describe('pipeline simulation — lint / test failure', () => {
  test('lint failure → pipeline stops, no build/deploy', () => {
    const result = simulatePipeline({ lintPass: false });
    expect(result.finalStatus).toBe('failed');
    expect(result.stages).toEqual(['lint:FAILED']);
    expect(result.artifacts).not.toContain('build-metadata');
    expect(result.notified).toBe(false);
  });

  test('test failure → coverage artifact still uploaded, no deploy', () => {
    const result = simulatePipeline({ testPass: false });
    expect(result.finalStatus).toBe('failed');
    expect(result.stages).toContain('test:FAILED');
    expect(result.artifacts).toContain('coverage-report'); // if: always()
    expect(result.artifacts).not.toContain('deploy-log-canary');
  });

  test('build failure → stops before any deployment', () => {
    const result = simulatePipeline({ buildPass: false });
    expect(result.finalStatus).toBe('failed');
    expect(result.stages).toContain('build:FAILED');
    expect(result.stages).not.toContain('deploy-canary:ok');
  });
});

describe('pipeline simulation — canary failure', () => {
  test('canary start fails → no production change, no rollback needed', () => {
    const result = simulatePipeline({ canaryPass: false });

    expect(result.finalStatus).toBe('failed');
    // Production was never touched — rollback is not triggered.
    expect(result.stages).not.toContain('rollback:ok');
    expect(result.stages).not.toContain('rollback:FAILED');
    expect(result.artifacts).toContain('deploy-log-canary');
    expect(result.notified).toBe(true);
  });
});

describe('pipeline simulation — smoke-test failure → rollback', () => {
  test('smoke-test fails → rollback triggered and succeeds', () => {
    const result = simulatePipeline({ smokeTestPass: false, rollbackPass: true });

    expect(result.finalStatus).toBe('rollback');
    expect(result.stages).toContain('smoke-test:FAILED');
    expect(result.stages).toContain('rollback:ok');
    expect(result.rolledBackTo).toBe('sha-prev');
    expect(result.artifacts).toContain('deploy-log-rollback');
    expect(result.notified).toBe(true);
    // deploy-full must NOT have been attempted.
    expect(result.stages).not.toContain('deploy-full:ok');
  });

  test('smoke-test fails + rollback fails → rollback_failed status', () => {
    const result = simulatePipeline({ smokeTestPass: false, rollbackPass: false });

    expect(result.finalStatus).toBe('rollback_failed');
    expect(result.stages).toContain('rollback:FAILED');
    expect(result.notified).toBe(true);
  });
});

describe('pipeline simulation — full-deploy failure → rollback', () => {
  test('full deploy fails → rollback triggered and succeeds', () => {
    const result = simulatePipeline({ fullDeployPass: false, rollbackPass: true });

    expect(result.finalStatus).toBe('rollback');
    expect(result.stages).toContain('deploy-full:FAILED');
    expect(result.stages).toContain('rollback:ok');
    expect(result.rolledBackTo).toBe('sha-prev');
    expect(result.artifacts).toContain('deploy-log-rollback');
    expect(result.artifacts).toContain('deploy-log-full');
    expect(result.notified).toBe(true);
  });

  test('full deploy fails + rollback fails → rollback_failed status', () => {
    const result = simulatePipeline({ fullDeployPass: false, rollbackPass: false });

    expect(result.finalStatus).toBe('rollback_failed');
    expect(result.stages).toContain('rollback:FAILED');
  });
});

describe('pipeline simulation — stage ordering invariants', () => {
  test('lint always precedes build', () => {
    const result = simulatePipeline();
    const lintIdx  = result.stages.indexOf('lint:ok');
    const buildIdx = result.stages.indexOf('build:ok');
    expect(lintIdx).toBeLessThan(buildIdx);
  });

  test('test always precedes build', () => {
    const result = simulatePipeline();
    const testIdx  = result.stages.indexOf('test:ok');
    const buildIdx = result.stages.indexOf('build:ok');
    expect(testIdx).toBeLessThan(buildIdx);
  });

  test('deploy-canary always precedes smoke-test', () => {
    const result = simulatePipeline();
    const canaryIdx = result.stages.indexOf('deploy-canary:ok');
    const smokeIdx  = result.stages.indexOf('smoke-test:ok');
    expect(canaryIdx).toBeLessThan(smokeIdx);
  });

  test('smoke-test always precedes deploy-full', () => {
    const result = simulatePipeline();
    const smokeIdx = result.stages.indexOf('smoke-test:ok');
    const fullIdx  = result.stages.indexOf('deploy-full:ok');
    expect(smokeIdx).toBeLessThan(fullIdx);
  });

  test('rollback never runs on full success', () => {
    const result = simulatePipeline();
    expect(result.stages.some(s => s.startsWith('rollback:'))).toBe(false);
  });
});

describe('pipeline simulation — notification invariants', () => {
  test('notification always sent when deployment stages are reached', () => {
    // Any path that reaches at least deploy-canary sends a notification.
    for (const scenario of [
      {},
      { smokeTestPass: false },
      { fullDeployPass: false },
      { canaryPass: false },
    ]) {
      const result = simulatePipeline(scenario);
      if (result.stages.some(s => s.startsWith('deploy-canary'))) {
        expect(result.notified).toBe(true);
      }
    }
  });

  test('notification NOT sent on pure CI failures (no deploy attempted)', () => {
    expect(simulatePipeline({ lintPass: false }).notified).toBe(false);
    expect(simulatePipeline({ testPass: false }).notified).toBe(false);
    expect(simulatePipeline({ buildPass: false }).notified).toBe(false);
  });
});
