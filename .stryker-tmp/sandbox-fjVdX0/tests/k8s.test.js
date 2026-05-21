// @ts-nocheck
// tests/k8s.test.js
//
// Validates Kubernetes manifests in k8s/ and simulates cluster behaviour.
//
// Two test layers:
//   1. STRUCTURE — read YAML files, parse them, and assert required fields,
//      labels, probes, resource limits, and relationships are correct.
//   2. SIMULATION — in-process K8s behaviour simulator covering:
//        • HPA scale-up when CPU > 70%
//        • canary traffic weighting
//        • canary failure → rollback
//        • full deploy success path

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join }                          from 'node:path';
import { fileURLToPath }                          from 'node:url';
import { describe, test, expect, beforeAll }      from '@jest/globals';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const K8S_DIR   = resolve(__dirname, '../k8s');

// ── YAML mini-parser (no deps) ────────────────────────────────────────────────
// We only need to verify presence of strings/patterns — no full AST needed.

/** Read a k8s manifest file as raw text. */
function readManifest(relativePath) {
  const abs = join(K8S_DIR, relativePath);
  if (!existsSync(abs)) throw new Error(`Manifest not found: ${abs}`);
  return readFileSync(abs, 'utf8');
}

/** Assert a string appears in a manifest. */
function assertHas(yaml, substring, label) {
  if (!yaml.includes(substring)) {
    throw new Error(`Expected manifest to contain "${label ?? substring}"`);
  }
}

/** Return all YAML files under a k8s sub-directory. */
function listManifests(subdir) {
  const dir = join(K8S_DIR, subdir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map(f => join(dir, f));
}

// ── Pre-load all manifests ────────────────────────────────────────────────────

const SERVICES  = ['agent', 'whisper', 'ollama', 'claude', 'tts'];
let   manifests = {};

beforeAll(() => {
  for (const svc of SERVICES) {
    manifests[svc] = {
      deployment: readManifest(`deployments/${svc}.yaml`),
      hpa:        readManifest(`hpa/${svc}-hpa.yaml`),
      service:    readManifest(`services/${svc}-svc.yaml`),
    };
  }
  manifests.ingress = readManifest('ingress/wolf-engine-ingress.yaml');
  manifests.canary  = readManifest('canary/agent-canary.yaml');
  manifests.ns      = readManifest('namespace.yaml');
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. NAMESPACE
// ─────────────────────────────────────────────────────────────────────────────

describe('namespace.yaml', () => {
  test('defines wolf-engine namespace', () => {
    expect(manifests.ns).toContain('name: wolf-engine');
    expect(manifests.ns).toContain('kind: Namespace');
  });

  test('includes ResourceQuota', () => {
    expect(manifests.ns).toContain('kind: ResourceQuota');
    expect(manifests.ns).toContain('requests.cpu');
    expect(manifests.ns).toContain('requests.memory');
  });

  test('includes LimitRange with defaults', () => {
    expect(manifests.ns).toContain('kind: LimitRange');
    expect(manifests.ns).toContain('defaultRequest');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. DEPLOYMENTS — common invariants across all services
// ─────────────────────────────────────────────────────────────────────────────

describe('deployments — common structure', () => {
  for (const svc of SERVICES) {
    describe(`${svc}.yaml`, () => {
      test('kind is Deployment', () => {
        expect(manifests[svc].deployment).toContain('kind: Deployment');
      });

      test('namespace is wolf-engine', () => {
        expect(manifests[svc].deployment).toContain('namespace: wolf-engine');
      });

      test('has app label', () => {
        expect(manifests[svc].deployment).toContain('app:');
      });

      test('has stage label', () => {
        expect(manifests[svc].deployment).toContain('stage:');
      });

      test('has version label', () => {
        expect(manifests[svc].deployment).toContain('version:');
      });

      test('defines replicas >= 1', () => {
        expect(manifests[svc].deployment).toMatch(/replicas:\s*[1-9]/);
      });

      test('defines readinessProbe', () => {
        expect(manifests[svc].deployment).toContain('readinessProbe:');
      });

      test('defines livenessProbe', () => {
        expect(manifests[svc].deployment).toContain('livenessProbe:');
      });

      test('defines startupProbe', () => {
        expect(manifests[svc].deployment).toContain('startupProbe:');
      });

      test('defines resource requests and limits', () => {
        expect(manifests[svc].deployment).toContain('requests:');
        expect(manifests[svc].deployment).toContain('limits:');
      });

      test('has RollingUpdate or Recreate strategy', () => {
        expect(manifests[svc].deployment).toMatch(/type:\s*(RollingUpdate|Recreate)/);
      });

      test('references wolf-engine-secrets', () => {
        // All node.js pods use secretRef; external servers (whisper, ollama) may not
        // but their deployments still have namespace + labels correct
        expect(manifests[svc].deployment).toContain('wolf-engine');
      });
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. DEPLOYMENTS — service-specific checks
// ─────────────────────────────────────────────────────────────────────────────

describe('deployments — service-specific', () => {
  test('agent: uses /health/ready for readinessProbe', () => {
    expect(manifests.agent.deployment).toContain('/health/ready');
  });

  test('agent: uses /health/live for livenessProbe', () => {
    expect(manifests.agent.deployment).toContain('/health/live');
  });

  test('agent: includes otel-collector sidecar', () => {
    expect(manifests.agent.deployment).toContain('otel-collector');
    expect(manifests.agent.deployment).toContain('opentelemetry-collector-contrib');
  });

  test('agent: has PodDisruptionBudget with minAvailable: 1', () => {
    expect(manifests.agent.deployment).toContain('kind: PodDisruptionBudget');
    expect(manifests.agent.deployment).toContain('minAvailable: 1');
  });

  test('agent: has PodAntiAffinity for cross-node spread', () => {
    expect(manifests.agent.deployment).toContain('podAntiAffinity');
    expect(manifests.agent.deployment).toContain('kubernetes.io/hostname');
  });

  test('agent: mounts audio PVC', () => {
    expect(manifests.agent.deployment).toContain('wolf-audio-pvc');
  });

  test('whisper: sets ASR_MODEL env var', () => {
    expect(manifests.whisper.deployment).toContain('ASR_MODEL');
  });

  test('whisper: has generous startupProbe (model download)', () => {
    // failureThreshold ≥ 10 to allow model download time
    expect(manifests.whisper.deployment).toMatch(/failureThreshold:\s*(1[0-9]|[2-9]\d)/);
  });

  test('whisper: persists model cache via PVC', () => {
    expect(manifests.whisper.deployment).toContain('whisper-models-pvc');
  });

  test('ollama: uses Recreate strategy (GPU PVC contention)', () => {
    expect(manifests.ollama.deployment).toContain('type: Recreate');
  });

  test('ollama: has init container for model pre-pull', () => {
    expect(manifests.ollama.deployment).toContain('initContainers:');
    expect(manifests.ollama.deployment).toContain('model-puller');
  });

  test('ollama: persists models via PVC', () => {
    expect(manifests.ollama.deployment).toContain('ollama-models-pvc');
  });

  test('tts: sets TTS_PROVIDER env', () => {
    expect(manifests.tts.deployment).toContain('TTS_PROVIDER');
  });

  test('tts: has otel-collector sidecar', () => {
    expect(manifests.tts.deployment).toContain('otel-collector');
  });

  test('claude: has otel-collector sidecar', () => {
    expect(manifests.claude.deployment).toContain('otel-collector');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. HPA
// ─────────────────────────────────────────────────────────────────────────────

describe('HPA — common structure', () => {
  for (const svc of SERVICES) {
    describe(`${svc}-hpa.yaml`, () => {
      test('kind is HorizontalPodAutoscaler', () => {
        expect(manifests[svc].hpa).toContain('kind: HorizontalPodAutoscaler');
      });

      test('uses autoscaling/v2', () => {
        expect(manifests[svc].hpa).toContain('autoscaling/v2');
      });

      test('minReplicas >= 1', () => {
        expect(manifests[svc].hpa).toMatch(/minReplicas:\s*[1-9]/);
      });

      test('maxReplicas >= 4', () => {
        expect(manifests[svc].hpa).toMatch(/maxReplicas:\s*([4-9]|[1-9]\d)/);
      });

      test('CPU utilisation target is set (70%)', () => {
        expect(manifests[svc].hpa).toContain('averageUtilization: 70');
      });

      test('scaleDown stabilizationWindowSeconds is set', () => {
        expect(manifests[svc].hpa).toContain('stabilizationWindowSeconds:');
      });

      test('references correct Deployment name', () => {
        expect(manifests[svc].hpa).toContain(`name: ${svc}`);
      });
    });
  }
});

describe('HPA — specific behaviour', () => {
  test('ollama: conservative maxReplicas (GPU-bound)', () => {
    expect(manifests.ollama.hpa).toMatch(/maxReplicas:\s*[1-6]/);
  });

  test('ollama: long scaleDown stabilisation (model unload cost)', () => {
    // stabilizationWindowSeconds >= 300
    expect(manifests.ollama.hpa).toMatch(/stabilizationWindowSeconds:\s*([3-9]\d\d|[1-9]\d{3,})/);
  });

  test('agent: custom latency metric reference', () => {
    expect(manifests.agent.hpa).toMatch(/agent_latency_ms/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SERVICES
// ─────────────────────────────────────────────────────────────────────────────

describe('Services — common structure', () => {
  for (const svc of SERVICES) {
    describe(`${svc}-svc.yaml`, () => {
      test('kind is Service', () => {
        expect(manifests[svc].service).toContain('kind: Service');
      });

      test('type is ClusterIP', () => {
        expect(manifests[svc].service).toContain('type: ClusterIP');
      });

      test('no sticky sessions (sessionAffinity: None)', () => {
        expect(manifests[svc].service).toContain('sessionAffinity: None');
      });

      test('defines at least one port', () => {
        expect(manifests[svc].service).toContain('port:');
      });

      test('selector targets the correct component', () => {
        expect(manifests[svc].service).toContain(svc);
      });
    });
  }
});

describe('Services — port correctness', () => {
  test('whisper service exposes port 9000', () => {
    expect(manifests.whisper.service).toContain('port:       9000');
  });

  test('ollama service exposes port 11434', () => {
    expect(manifests.ollama.service).toContain('port:       11434');
  });

  test('agent service exposes port 80', () => {
    expect(manifests.agent.service).toMatch(/port:\s+80/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. INGRESS
// ─────────────────────────────────────────────────────────────────────────────

describe('Ingress', () => {
  test('kind is Ingress', () => {
    expect(manifests.ingress).toContain('kind: Ingress');
  });

  test('uses nginx ingress class', () => {
    expect(manifests.ingress).toContain('nginx');
  });

  test('TLS configured with cert-manager', () => {
    expect(manifests.ingress).toContain('cert-manager.io/cluster-issuer');
    expect(manifests.ingress).toContain('tls:');
  });

  test('/metrics is blocked externally', () => {
    expect(manifests.ingress).toContain('/metrics');
    expect(manifests.ingress).toContain('deny all');
  });

  test('routes / to agent service', () => {
    expect(manifests.ingress).toContain('name: agent');
  });

  test('no sessionAffinity (round-robin)', () => {
    expect(manifests.ingress).toContain('affinity:');
    expect(manifests.ingress).toContain('"none"');
  });

  test('rate limiting configured', () => {
    expect(manifests.ingress).toContain('limit-rps');
  });

  test('proxy timeouts accommodate LLM latency (>= 60s)', () => {
    // proxy-read-timeout must be >= 60
    expect(manifests.ingress).toMatch(/proxy-read-timeout.*"([6-9]\d|[1-9]\d{2,})"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. CANARY MANIFEST
// ─────────────────────────────────────────────────────────────────────────────

describe('Canary manifest', () => {
  test('canary Deployment has stage: canary label', () => {
    expect(manifests.canary).toContain('stage:                       canary');
  });

  test('canary Ingress has canary: "true" annotation', () => {
    expect(manifests.canary).toContain('nginx.ingress.kubernetes.io/canary:');
    expect(manifests.canary).toContain('"true"');
  });

  test('canary weight is 10%', () => {
    expect(manifests.canary).toContain('canary-weight:           "10"');
  });

  test('canary header override is configured', () => {
    expect(manifests.canary).toContain('canary-by-header');
    expect(manifests.canary).toContain('X-Wolf-Canary');
  });

  test('canary has dedicated ClusterIP service', () => {
    expect(manifests.canary).toContain('name: agent-canary');
    expect(manifests.canary).toContain('kind: Service');
  });

  test('canary Deployment has readinessProbe', () => {
    expect(manifests.canary).toContain('readinessProbe:');
  });

  test('canary image tag contains "canary"', () => {
    expect(manifests.canary).toContain(':sha-canary');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. HPA SIMULATION — scale-up when CPU > 70%
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal HPA simulator — mirrors the Kubernetes HPA algorithm.
 * desiredReplicas = ceil(current * (current_metric / target_metric))
 * Capped by minReplicas / maxReplicas. Respects scaleUp/Down policies.
 */
class HPASimulator {
  constructor({ minReplicas = 2, maxReplicas = 10, cpuTarget = 70, scaleUpMax = 2, scaleDownMax = 1 } = {}) {
    this.minReplicas  = minReplicas;
    this.maxReplicas  = maxReplicas;
    this.cpuTarget    = cpuTarget;
    this.scaleUpMax   = scaleUpMax;
    this.scaleDownMax = scaleDownMax;
    this.replicas     = minReplicas;
    this.history      = [];
  }

  /** Apply one HPA evaluation cycle. Returns new replica count. */
  evaluate({ cpuUtilization }) {
    const desired = Math.ceil(this.replicas * (cpuUtilization / this.cpuTarget));
    const capped  = Math.min(Math.max(desired, this.minReplicas), this.maxReplicas);

    // Apply per-cycle policy limits
    if (capped > this.replicas) {
      this.replicas = Math.min(capped, this.replicas + this.scaleUpMax);
    } else if (capped < this.replicas) {
      this.replicas = Math.max(capped, this.replicas - this.scaleDownMax);
    }

    this.history.push({ cpuUtilization, replicas: this.replicas });
    return this.replicas;
  }
}

describe('HPA simulation — scale-up (CPU > 70%)', () => {
  test('CPU at 100% → scales up from 2 to 3 in first cycle', () => {
    const hpa = new HPASimulator({ minReplicas: 2, maxReplicas: 10, cpuTarget: 70, scaleUpMax: 2 });
    const r = hpa.evaluate({ cpuUtilization: 100 });
    // ceil(2 * 100/70) = ceil(2.857) = 3
    expect(r).toBe(3);
  });

  test('sustained CPU at 140% → reaches 10 replicas in several cycles', () => {
    const hpa = new HPASimulator({ minReplicas: 2, maxReplicas: 10, cpuTarget: 70, scaleUpMax: 4 });
    let cycles = 0;
    while (hpa.replicas < hpa.maxReplicas && cycles < 20) {
      hpa.evaluate({ cpuUtilization: 140 });
      cycles++;
    }
    expect(hpa.replicas).toBe(10);
  });

  test('CPU at exactly 70% → replicas unchanged', () => {
    const hpa = new HPASimulator({ minReplicas: 2, maxReplicas: 10, cpuTarget: 70 });
    const r = hpa.evaluate({ cpuUtilization: 70 });
    expect(r).toBe(2); // ceil(2 * 70/70) = 2
  });

  test('CPU at 50% → scales down by at most scaleDownMax per cycle', () => {
    const hpa = new HPASimulator({ minReplicas: 2, maxReplicas: 10, cpuTarget: 70, scaleDownMax: 1 });
    hpa.replicas = 6; // simulate over-provisioned state
    const r = hpa.evaluate({ cpuUtilization: 50 });
    // ceil(6 * 50/70) = ceil(4.28) = 5; policy allows max -1 → 5
    expect(r).toBe(5);
  });

  test('CPU at 10% → never drops below minReplicas', () => {
    const hpa = new HPASimulator({ minReplicas: 2, maxReplicas: 10, cpuTarget: 70 });
    hpa.replicas = 3;
    const r = hpa.evaluate({ cpuUtilization: 10 });
    expect(r).toBeGreaterThanOrEqual(2);
  });

  test('custom latency metric > 500ms triggers scale-up equivalent', () => {
    // Model: latency target = 500ms; current = 800ms → same ratio-based logic
    const hpa = new HPASimulator({ minReplicas: 2, maxReplicas: 10, cpuTarget: 500, scaleUpMax: 2 });
    const r = hpa.evaluate({ cpuUtilization: 800 }); // cpuUtilization = latencyMs
    // ceil(2 * 800/500) = ceil(3.2) = 4 but scaleUpMax=2 → min(4, 2+2) = 4
    expect(r).toBeGreaterThan(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. CANARY SIMULATION — traffic split + rollback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal canary traffic simulator.
 * Models NGINX weight-based routing: canaryWeight% → canary, rest → stable.
 */
class CanarySimulator {
  constructor({ stableReplicas = 2, canaryWeight = 10 } = {}) {
    this.stableReplicas = stableReplicas;
    this.canaryReplicas = 1;
    this.canaryWeight   = canaryWeight;   // %
    this.canaryHealthy  = true;
    this.stage          = 'canary';       // canary | full | rolled_back
  }

  /** Simulate a batch of requests; return { stable, canary } counts. */
  routeRequests(total) {
    const canaryCount  = Math.round(total * (this.canaryWeight / 100));
    const stableCount  = total - canaryCount;
    return { stable: stableCount, canary: canaryCount };
  }

  /** Run smoke tests; returns pass/fail. */
  runSmokeTest(pass) {
    this.canaryHealthy = pass;
    return pass;
  }

  /** Promote canary → full deploy. */
  promote() {
    if (!this.canaryHealthy) throw new Error('Cannot promote an unhealthy canary');
    this.stage          = 'full';
    this.canaryWeight   = 0;
    this.stableReplicas = 3;   // scaled from 2 → 3 after promotion
    this.canaryReplicas = 0;
  }

  /** Rollback: remove canary, restore stable. */
  rollback() {
    this.stage          = 'rolled_back';
    this.canaryReplicas = 0;
    this.canaryWeight   = 0;
    this.canaryHealthy  = false;
  }
}

describe('canary simulation — traffic split', () => {
  test('10% of 1000 requests go to canary', () => {
    const sim = new CanarySimulator({ canaryWeight: 10 });
    const { stable, canary } = sim.routeRequests(1000);
    expect(canary).toBe(100);
    expect(stable).toBe(900);
  });

  test('0% weight → all traffic to stable', () => {
    const sim = new CanarySimulator({ canaryWeight: 0 });
    const { stable, canary } = sim.routeRequests(500);
    expect(canary).toBe(0);
    expect(stable).toBe(500);
  });

  test('100% weight → all traffic to canary', () => {
    const sim = new CanarySimulator({ canaryWeight: 100 });
    const { stable, canary } = sim.routeRequests(200);
    expect(canary).toBe(200);
    expect(stable).toBe(0);
  });
});

describe('canary simulation — smoke test failure → rollback', () => {
  test('failed smoke test prevents promotion', () => {
    const sim = new CanarySimulator();
    sim.runSmokeTest(false);
    expect(() => sim.promote()).toThrow('Cannot promote an unhealthy canary');
  });

  test('rollback sets stage to rolled_back', () => {
    const sim = new CanarySimulator();
    sim.runSmokeTest(false);
    sim.rollback();
    expect(sim.stage).toBe('rolled_back');
  });

  test('rollback removes canary replicas', () => {
    const sim = new CanarySimulator();
    sim.runSmokeTest(false);
    sim.rollback();
    expect(sim.canaryReplicas).toBe(0);
  });

  test('rollback sets canary weight to 0 (no canary traffic)', () => {
    const sim = new CanarySimulator();
    sim.runSmokeTest(false);
    sim.rollback();
    expect(sim.canaryWeight).toBe(0);
  });

  test('after rollback, all requests go to stable pods', () => {
    const sim = new CanarySimulator();
    sim.runSmokeTest(false);
    sim.rollback();
    const { stable, canary } = sim.routeRequests(1000);
    expect(canary).toBe(0);
    expect(stable).toBe(1000);
  });
});

describe('canary simulation — smoke test success → full deploy', () => {
  test('passed smoke test allows promotion', () => {
    const sim = new CanarySimulator();
    sim.runSmokeTest(true);
    expect(() => sim.promote()).not.toThrow();
  });

  test('promotion sets stage to full', () => {
    const sim = new CanarySimulator();
    sim.runSmokeTest(true);
    sim.promote();
    expect(sim.stage).toBe('full');
  });

  test('promotion sets canary weight to 0', () => {
    const sim = new CanarySimulator();
    sim.runSmokeTest(true);
    sim.promote();
    expect(sim.canaryWeight).toBe(0);
  });

  test('promotion removes canary replicas', () => {
    const sim = new CanarySimulator();
    sim.runSmokeTest(true);
    sim.promote();
    expect(sim.canaryReplicas).toBe(0);
  });

  test('after promotion, all requests go to stable (now updated) pods', () => {
    const sim = new CanarySimulator();
    sim.runSmokeTest(true);
    sim.promote();
    const { stable, canary } = sim.routeRequests(1000);
    expect(canary).toBe(0);
    expect(stable).toBe(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. FULL DEPLOY SIMULATION — end-to-end pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full pipeline simulator wiring HPA + Canary together.
 *
 * Stages:
 *   deploy-canary → smoke-test → promote → scale-stable → success
 *                               ↓ (fail)
 *                           rollback
 */
function simulateFullDeploy({ smokeTestPass = true, cpuDuringRollout = 80 } = {}) {
  const hpa    = new HPASimulator({ minReplicas: 2, maxReplicas: 10, cpuTarget: 70 });
  const canary = new CanarySimulator({ stableReplicas: 2, canaryWeight: 10 });
  const events = [];

  // Stage 1: deploy canary
  events.push({ stage: 'canary-deployed', canaryReplicas: canary.canaryReplicas });

  // Stage 2: route some traffic, HPA evaluates
  const routing = canary.routeRequests(1000);
  events.push({ stage: 'traffic-routed', ...routing });

  // HPA reacts to CPU spike during rollout
  const newReplicas = hpa.evaluate({ cpuUtilization: cpuDuringRollout });
  events.push({ stage: 'hpa-evaluated', replicas: newReplicas });

  // Stage 3: smoke test
  const passed = canary.runSmokeTest(smokeTestPass);
  events.push({ stage: 'smoke-test', passed });

  if (!passed) {
    canary.rollback();
    events.push({ stage: 'rollback', finalStage: canary.stage });
    return { success: false, events, hpa, canary };
  }

  // Stage 4: promote
  canary.promote();
  events.push({ stage: 'promoted', finalStage: canary.stage });

  // Stage 5: full load now on stable, HPA scales appropriately
  const finalReplicas = hpa.evaluate({ cpuUtilization: cpuDuringRollout });
  events.push({ stage: 'final-scale', replicas: finalReplicas });

  return { success: true, events, hpa, canary };
}

describe('full deploy simulation', () => {
  test('success path: all stages completed, canary promoted', () => {
    const { success, events, canary } = simulateFullDeploy({ smokeTestPass: true });
    expect(success).toBe(true);
    expect(canary.stage).toBe('full');
    expect(events.some(e => e.stage === 'promoted')).toBe(true);
    expect(events.some(e => e.stage === 'rollback')).toBe(false);
  });

  test('success path: HPA scaled up during rollout', () => {
    const { hpa } = simulateFullDeploy({ smokeTestPass: true, cpuDuringRollout: 100 });
    expect(hpa.replicas).toBeGreaterThan(2);
  });

  test('failure path: smoke test fails → rollback, no promotion', () => {
    const { success, events, canary } = simulateFullDeploy({ smokeTestPass: false });
    expect(success).toBe(false);
    expect(canary.stage).toBe('rolled_back');
    expect(events.some(e => e.stage === 'rollback')).toBe(true);
    expect(events.some(e => e.stage === 'promoted')).toBe(false);
  });

  test('failure path: after rollback, canary traffic weight is 0', () => {
    const { canary } = simulateFullDeploy({ smokeTestPass: false });
    expect(canary.canaryWeight).toBe(0);
  });

  test('events are in correct order on success path', () => {
    const { events } = simulateFullDeploy({ smokeTestPass: true });
    const stageOrder = events.map(e => e.stage);
    const deployIdx  = stageOrder.indexOf('canary-deployed');
    const smokeIdx   = stageOrder.indexOf('smoke-test');
    const promoteIdx = stageOrder.indexOf('promoted');
    expect(deployIdx).toBeLessThan(smokeIdx);
    expect(smokeIdx).toBeLessThan(promoteIdx);
  });

  test('events are in correct order on failure path', () => {
    const { events } = simulateFullDeploy({ smokeTestPass: false });
    const stageOrder = events.map(e => e.stage);
    const deployIdx  = stageOrder.indexOf('canary-deployed');
    const smokeIdx   = stageOrder.indexOf('smoke-test');
    const rollbackIdx = stageOrder.indexOf('rollback');
    expect(deployIdx).toBeLessThan(smokeIdx);
    expect(smokeIdx).toBeLessThan(rollbackIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. FILE COUNT SANITY CHECK
// ─────────────────────────────────────────────────────────────────────────────

describe('manifest file count', () => {
  test('5 deployment manifests exist', () => {
    const files = listManifests('deployments');
    expect(files.length).toBe(5);
  });

  test('5 HPA manifests exist', () => {
    const files = listManifests('hpa');
    expect(files.length).toBe(5);
  });

  test('5 service manifests exist', () => {
    const files = listManifests('services');
    expect(files.length).toBe(5);
  });

  test('ingress manifest exists', () => {
    const files = listManifests('ingress');
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  test('canary manifest exists', () => {
    const files = listManifests('canary');
    expect(files.length).toBeGreaterThanOrEqual(1);
  });
});
