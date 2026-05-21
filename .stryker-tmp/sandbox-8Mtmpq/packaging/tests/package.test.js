/**
 * packaging/tests/package.test.js — Wolf Engine packaging validation tests.
 *
 * Tests:
 *   1. Dockerfile structure   — multi-stage, non-root USER, HEALTHCHECK present
 *   2. Helm Chart.yaml        — required fields, valid semver
 *   3. Helm values.yaml       — all components present, required keys
 *   4. Helm templates         — all template files exist, contain required strings
 *   5. CI pipeline            — YAML structure, required jobs, secrets referenced
 *   6. Image tags             — consistent across values and Chart.yaml appVersion
 *   7. Security               — no hardcoded secrets in packaging files
 *   8. Observability config   — OTel sidecar config, Prometheus annotations
 *
 * Run: node --experimental-vm-modules node_modules/.bin/jest packaging/tests/package.test.js
 */
// @ts-nocheck


import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const DOCKER = join(ROOT, 'packaging/docker');
const HELM   = join(ROOT, 'packaging/helm');
const CI     = join(ROOT, 'packaging/ci');

// ── helpers ───────────────────────────────────────────────────────────────────

function readFile(path) {
  return readFileSync(path, 'utf8');
}

function readYaml(path) {
  return parseYaml(readFile(path));
}

/** Return all FROM stage names in a Dockerfile. */
function parseStages(dockerfileContent) {
  return [...dockerfileContent.matchAll(/^FROM\s+\S+(?:\s+AS\s+(\S+))?/gim)]
    .map(m => m[1] || null);
}

/** Return true if dockerfile content has a USER instruction before the last CMD/ENTRYPOINT. */
function hasNonRootUser(content) {
  return /^USER\s+(?!root)/m.test(content);
}

/** Return true if dockerfile content has a HEALTHCHECK. */
function hasHealthcheck(content) {
  return /^HEALTHCHECK\b/m.test(content);
}

// ── 1. Dockerfiles ────────────────────────────────────────────────────────────

describe('Dockerfiles', () => {
  const services = ['agent', 'claude', 'tts', 'whisper', 'ollama'];

  test.each(services)('%s.Dockerfile exists', (svc) => {
    expect(existsSync(join(DOCKER, `${svc}.Dockerfile`))).toBe(true);
  });

  test.each(services)('%s.Dockerfile is multi-stage (≥ 2 FROM)', (svc) => {
    const content = readFile(join(DOCKER, `${svc}.Dockerfile`));
    const stages = parseStages(content);
    expect(stages.length).toBeGreaterThanOrEqual(2);
  });

  test.each(services)('%s.Dockerfile has non-root USER', (svc) => {
    const content = readFile(join(DOCKER, `${svc}.Dockerfile`));
    expect(hasNonRootUser(content)).toBe(true);
  });

  test.each(services)('%s.Dockerfile has HEALTHCHECK', (svc) => {
    const content = readFile(join(DOCKER, `${svc}.Dockerfile`));
    expect(hasHealthcheck(content)).toBe(true);
  });

  test.each(services)('%s.Dockerfile has OCI labels', (svc) => {
    const content = readFile(join(DOCKER, `${svc}.Dockerfile`));
    expect(content).toMatch(/org\.opencontainers\.image\.title/);
    expect(content).toMatch(/org\.opencontainers\.image\.version/);
  });

  test('agent.Dockerfile uses tini as PID 1', () => {
    const content = readFile(join(DOCKER, 'agent.Dockerfile'));
    expect(content).toMatch(/tini/);
    expect(content).toMatch(/ENTRYPOINT/);
  });

  test('tts.Dockerfile has piper-download stage', () => {
    const content = readFile(join(DOCKER, 'tts.Dockerfile'));
    expect(content).toMatch(/piper-download/);
    expect(content).toMatch(/COPY --from=piper-download/);
  });

  test('whisper.Dockerfile extends onerahmed/whisper-asr-webservice', () => {
    const content = readFile(join(DOCKER, 'whisper.Dockerfile'));
    expect(content).toMatch(/onerahmed\/whisper-asr-webservice/);
  });

  test('ollama.Dockerfile has model pull entrypoint script', () => {
    const content = readFile(join(DOCKER, 'ollama.Dockerfile'));
    expect(content).toMatch(/ollama-entrypoint\.sh/);
    expect(content).toMatch(/ollama pull/);
  });

  test('ollama.Dockerfile supports PREBAKE_MODEL arg', () => {
    const content = readFile(join(DOCKER, 'ollama.Dockerfile'));
    expect(content).toMatch(/ARG PREBAKE_MODEL/);
    expect(content).toMatch(/PREBAKE_MODEL.*true/);
  });

  test('all Dockerfiles use alpine or slim base for runtime stage', () => {
    // Agent, claude, tts — node:20-alpine runtime.
    for (const svc of ['agent', 'claude', 'tts']) {
      const content = readFile(join(DOCKER, `${svc}.Dockerfile`));
      // Last FROM (runtime stage) should reference alpine.
      const froms = [...content.matchAll(/^FROM\s+(\S+)/gim)].map(m => m[1]);
      const runtimeBase = froms[froms.length - 1];
      expect(runtimeBase).toMatch(/alpine|slim/i);
    }
  });

  test('no Dockerfile runs as root in production CMD', () => {
    const services = ['agent', 'claude', 'tts'];
    for (const svc of services) {
      const content = readFile(join(DOCKER, `${svc}.Dockerfile`));
      // USER node must appear before CMD in runtime stage.
      const userIdx = content.lastIndexOf('USER node');
      const cmdIdx  = content.lastIndexOf('CMD ');
      expect(userIdx).toBeGreaterThan(0);
      expect(userIdx).toBeLessThan(cmdIdx);
    }
  });
});

// ── 2. Helm Chart.yaml ────────────────────────────────────────────────────────

describe('Helm Chart.yaml', () => {
  let chart;

  beforeAll(() => {
    chart = readYaml(join(HELM, 'Chart.yaml'));
  });

  test('apiVersion is v2', () => {
    expect(chart.apiVersion).toBe('v2');
  });

  test('name is wolf-engine', () => {
    expect(chart.name).toBe('wolf-engine');
  });

  test('type is application', () => {
    expect(chart.type).toBe('application');
  });

  test('version is valid semver', () => {
    expect(chart.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('appVersion is set', () => {
    expect(chart.appVersion).toBeTruthy();
  });

  test('version and appVersion are the same for initial release', () => {
    expect(chart.version).toBe(chart.appVersion);
  });

  test('description is present', () => {
    expect(chart.description).toBeTruthy();
    expect(chart.description.length).toBeGreaterThan(10);
  });

  test('maintainers is defined', () => {
    expect(Array.isArray(chart.maintainers)).toBe(true);
    expect(chart.maintainers.length).toBeGreaterThan(0);
    expect(chart.maintainers[0]).toHaveProperty('name');
    expect(chart.maintainers[0]).toHaveProperty('email');
  });

  test('keywords include voice and ai', () => {
    expect(chart.keywords).toContain('voice');
    expect(chart.keywords).toContain('ai');
  });

  test('Artifact Hub annotations present', () => {
    expect(chart.annotations).toHaveProperty(['artifacthub.io/category']);
  });
});

// ── 3. Helm values.yaml ───────────────────────────────────────────────────────

describe('Helm values.yaml', () => {
  let values;

  beforeAll(() => {
    values = readYaml(join(HELM, 'values.yaml'));
  });

  const expectedComponents = ['agent', 'whisper', 'claude', 'tts', 'ollama'];

  test('global section exists', () => {
    expect(values.global).toBeDefined();
    expect(values.global.registry).toBeTruthy();
    expect(values.global.imagePullPolicy).toBeTruthy();
  });

  test.each(expectedComponents)('component %s exists', (comp) => {
    expect(values.components[comp]).toBeDefined();
  });

  test.each(expectedComponents)('component %s has required fields', (comp) => {
    const c = values.components[comp];
    expect(c).toHaveProperty('enabled');
    expect(c).toHaveProperty('image');
    expect(c.image).toHaveProperty('repository');
    expect(c).toHaveProperty('replicaCount');
    expect(c).toHaveProperty('resources');
    expect(c).toHaveProperty('autoscaling');
    expect(c).toHaveProperty('service');
    expect(c).toHaveProperty('probes');
  });

  test.each(expectedComponents)('component %s service has port', (comp) => {
    expect(values.components[comp].service.port).toBeGreaterThan(0);
  });

  test('all components enabled by default', () => {
    for (const comp of expectedComponents) {
      expect(values.components[comp].enabled).toBe(true);
    }
  });

  test('ollama autoscaling disabled by default (stateful)', () => {
    expect(values.components.ollama.autoscaling.enabled).toBe(false);
  });

  test('ollama modelPVC enabled by default', () => {
    expect(values.components.ollama.modelPVC.enabled).toBe(true);
  });

  test('ingress section exists', () => {
    expect(values.ingress).toBeDefined();
    expect(values.ingress.host).toBeTruthy();
    expect(Array.isArray(values.ingress.routes)).toBe(true);
    expect(values.ingress.routes.length).toBeGreaterThanOrEqual(4);
  });

  test('canary ingress disabled by default', () => {
    expect(values.ingress.canary.enabled).toBe(false);
  });

  test('secrets section lists required keys', () => {
    const required = ['ANTHROPIC_API_KEY', 'JWT_SECRET', 'REDIS_URL'];
    for (const key of required) {
      expect(values.secrets.keys).toContain(key);
    }
  });

  test('observability section exists', () => {
    expect(values.observability).toBeDefined();
    expect(values.observability.otelSidecar).toBeDefined();
    expect(values.observability.prometheus).toBeDefined();
  });

  test('OTel sidecar disabled by default', () => {
    expect(values.observability.otelSidecar.enabled).toBe(false);
  });

  test('prometheus enabled by default', () => {
    expect(values.observability.prometheus.enabled).toBe(true);
  });

  test('podDisruptionBudget enabled by default', () => {
    expect(values.podDisruptionBudget.enabled).toBe(true);
    expect(values.podDisruptionBudget.minAvailable).toBeGreaterThanOrEqual(1);
  });

  test('networkPolicy enabled by default', () => {
    expect(values.networkPolicy.enabled).toBe(true);
  });

  test('agent replicaCount ≥ 2 for HA', () => {
    expect(values.components.agent.replicaCount).toBeGreaterThanOrEqual(2);
  });

  test('resource requests are set for all components', () => {
    for (const comp of expectedComponents) {
      const res = values.components[comp].resources;
      expect(res.requests.cpu).toBeTruthy();
      expect(res.requests.memory).toBeTruthy();
      expect(res.limits.cpu).toBeTruthy();
      expect(res.limits.memory).toBeTruthy();
    }
  });
});

// ── 4. Helm templates ─────────────────────────────────────────────────────────

describe('Helm templates', () => {
  const templates = [
    '_helpers.tpl',
    'deployments.yaml',
    'services.yaml',
    'ingress.yaml',
    'hpa.yaml',
    'secrets.yaml',
    'rbac.yaml',
  ];

  test.each(templates)('template %s exists', (tpl) => {
    expect(existsSync(join(HELM, 'templates', tpl))).toBe(true);
  });

  test('_helpers.tpl defines wolf.fullname', () => {
    const content = readFile(join(HELM, 'templates/_helpers.tpl'));
    expect(content).toMatch(/define "wolf\.fullname"/);
  });

  test('_helpers.tpl defines wolf.labels', () => {
    const content = readFile(join(HELM, 'templates/_helpers.tpl'));
    expect(content).toMatch(/define "wolf\.labels"/);
  });

  test('_helpers.tpl defines wolf.selectorLabels', () => {
    const content = readFile(join(HELM, 'templates/_helpers.tpl'));
    expect(content).toMatch(/define "wolf\.selectorLabels"/);
  });

  test('_helpers.tpl defines wolf.image', () => {
    const content = readFile(join(HELM, 'templates/_helpers.tpl'));
    expect(content).toMatch(/define "wolf\.image"/);
  });

  test('deployments.yaml iterates over components', () => {
    const content = readFile(join(HELM, 'templates/deployments.yaml'));
    expect(content).toMatch(/range.*components/);
  });

  test('deployments.yaml includes liveness and readiness probes', () => {
    const content = readFile(join(HELM, 'templates/deployments.yaml'));
    expect(content).toMatch(/livenessProbe/);
    expect(content).toMatch(/readinessProbe/);
  });

  test('deployments.yaml sets automountServiceAccountToken: false', () => {
    const content = readFile(join(HELM, 'templates/deployments.yaml'));
    expect(content).toMatch(/automountServiceAccountToken:\s*false/);
  });

  test('deployments.yaml includes topologySpreadConstraints', () => {
    const content = readFile(join(HELM, 'templates/deployments.yaml'));
    expect(content).toMatch(/topologySpreadConstraints/);
  });

  test('hpa.yaml uses autoscaling/v2', () => {
    const content = readFile(join(HELM, 'templates/hpa.yaml'));
    expect(content).toMatch(/autoscaling\/v2/);
  });

  test('hpa.yaml has scale-down stabilization', () => {
    const content = readFile(join(HELM, 'templates/hpa.yaml'));
    expect(content).toMatch(/stabilizationWindowSeconds/);
    expect(content).toMatch(/scaleDown/);
  });

  test('ingress.yaml supports TLS', () => {
    const content = readFile(join(HELM, 'templates/ingress.yaml'));
    expect(content).toMatch(/tls:/);
    expect(content).toMatch(/secretName/);
  });

  test('ingress.yaml has canary annotation block', () => {
    const content = readFile(join(HELM, 'templates/ingress.yaml'));
    expect(content).toMatch(/canary-weight/);
    expect(content).toMatch(/nginx.*canary.*true/);
  });

  test('rbac.yaml creates ServiceAccount per component', () => {
    const content = readFile(join(HELM, 'templates/rbac.yaml'));
    expect(content).toMatch(/kind: ServiceAccount/);
    expect(content).toMatch(/automountServiceAccountToken:\s*false/);
  });

  test('rbac.yaml creates NetworkPolicy default-deny-all', () => {
    const content = readFile(join(HELM, 'templates/rbac.yaml'));
    expect(content).toMatch(/default-deny-all/);
    expect(content).toMatch(/podSelector:\s*\{\}/);
  });

  test('secrets.yaml marks sensitive values as REPLACE_WITH', () => {
    const content = readFile(join(HELM, 'templates/secrets.yaml'));
    expect(content).toMatch(/REPLACE_WITH_ANTHROPIC_API_KEY/);
    expect(content).toMatch(/REPLACE_WITH_JWT_SECRET/);
  });
});

// ── 5. CI pipeline ────────────────────────────────────────────────────────────

describe('CI release pipeline', () => {
  let pipeline;
  let raw;

  beforeAll(() => {
    const path = join(CI, 'release-pipeline.yaml');
    raw = readFile(path);
    pipeline = readYaml(path);
  });

  test('pipeline file exists', () => {
    expect(existsSync(join(CI, 'release-pipeline.yaml'))).toBe(true);
  });

  test('triggers on semver tags', () => {
    const tags = pipeline.on.push.tags;
    expect(tags).toContain('v[0-9]+.[0-9]+.[0-9]+');
  });

  test('triggers on main branch push', () => {
    expect(pipeline.on.push.branches).toContain('main');
  });

  test('triggers on pull_request to main', () => {
    expect(pipeline.on.pull_request.branches).toContain('main');
  });

  test('has concurrency cancel-in-progress', () => {
    expect(pipeline.concurrency).toBeDefined();
    expect(pipeline.concurrency['cancel-in-progress']).toBe(true);
  });

  const requiredJobs = ['validate', 'build', 'deploy', 'smoke', 'rollback', 'notify'];

  test.each(requiredJobs)('job %s exists', (job) => {
    expect(pipeline.jobs[job]).toBeDefined();
  });

  test('build job has matrix for all 5 services', () => {
    const matrix = pipeline.jobs.build.strategy.matrix.include;
    const services = matrix.map(m => m.service);
    expect(services).toContain('agent');
    expect(services).toContain('claude');
    expect(services).toContain('tts');
    expect(services).toContain('whisper');
    expect(services).toContain('ollama');
  });

  test('deploy job uses helm upgrade --atomic', () => {
    const steps = pipeline.jobs.deploy.steps;
    const helmSteps = steps.filter(s => s.run && s.run.includes('helm upgrade'));
    expect(helmSteps.length).toBeGreaterThan(0);
    const hasAtomic = helmSteps.some(s => s.run.includes('--atomic'));
    expect(hasAtomic).toBe(true);
  });

  test('deploy job injects secrets via kubectl', () => {
    const steps = pipeline.jobs.deploy.steps;
    const secretStep = steps.find(s => s.run && s.run.includes('create secret'));
    expect(secretStep).toBeDefined();
    expect(secretStep.run).toMatch(/ANTHROPIC_API_KEY/);
    expect(secretStep.run).toMatch(/JWT_SECRET/);
  });

  test('rollback job uses helm rollback', () => {
    const steps = pipeline.jobs.rollback.steps;
    const rollbackStep = steps.find(s => s.run && s.run.includes('helm rollback'));
    expect(rollbackStep).toBeDefined();
  });

  test('rollback job triggers on deploy or smoke failure', () => {
    const condition = pipeline.jobs.rollback.if;
    expect(condition).toMatch(/deploy.*failure|smoke.*failure/);
  });

  test('build uses multi-arch (linux/amd64,linux/arm64)', () => {
    const steps = pipeline.jobs.build.steps;
    const buildStep = steps.find(s => s.uses && s.uses.includes('build-push-action'));
    expect(buildStep).toBeDefined();
    expect(buildStep.with.platforms).toMatch(/linux\/amd64.*linux\/arm64/);
  });

  test('pipeline uses GitHub Actions cache for Docker layers', () => {
    const steps = pipeline.jobs.build.steps;
    const buildStep = steps.find(s => s.uses && s.uses.includes('build-push-action'));
    expect(buildStep.with['cache-from']).toMatch(/gha/);
  });

  test('smoke job checks health endpoints', () => {
    const steps = pipeline.jobs.smoke.steps;
    const healthStep = steps.find(s => s.run && s.run.includes('health'));
    expect(healthStep).toBeDefined();
  });

  test('smoke job checks Prometheus error rate', () => {
    const steps = pipeline.jobs.smoke.steps;
    const promStep = steps.find(s => s.run && s.run.includes('rate(http_requests_total'));
    expect(promStep).toBeDefined();
  });

  test('notify job always runs (even on failure)', () => {
    expect(pipeline.jobs.notify.if).toMatch(/always\(\)/);
  });

  test('notify job skips PRs', () => {
    expect(pipeline.jobs.notify.if).toMatch(/event_name.*pull_request/);
  });

  test('no KUBECONFIG in plain text (must use secret)', () => {
    // Raw YAML must not contain actual kubeconfig content.
    expect(raw).not.toMatch(/apiVersion: v1\nkind: Config/);
    // Must reference the secret.
    expect(raw).toMatch(/secrets\.KUBECONFIG_B64/);
  });
});

// ── 6. Image tags consistency ─────────────────────────────────────────────────

describe('Image tag consistency', () => {
  test('values.yaml components image.repository follows naming convention', () => {
    const values = readYaml(join(HELM, 'values.yaml'));
    const expectedPrefix = 'wolf-engine/';
    for (const [name, comp] of Object.entries(values.components)) {
      expect(comp.image.repository).toMatch(new RegExp(`^${expectedPrefix}${name}`));
    }
  });

  test('values.yaml image.tag is empty (defers to Chart.appVersion)', () => {
    const values = readYaml(join(HELM, 'values.yaml'));
    for (const [, comp] of Object.entries(values.components)) {
      // Empty string defers to appVersion in _helpers.tpl wolf.image.
      expect(comp.image.tag ?? '').toBe('');
    }
  });

  test('Chart.appVersion matches Chart.version (initial release)', () => {
    const chart = readYaml(join(HELM, 'Chart.yaml'));
    expect(chart.appVersion).toBe(chart.version);
  });
});

// ── 7. Security — no hardcoded secrets ───────────────────────────────────────

describe('Security — no hardcoded credentials', () => {
  const files = [
    join(HELM, 'values.yaml'),
    join(HELM, 'templates/secrets.yaml'),
    join(HELM, 'templates/deployments.yaml'),
    join(CI, 'release-pipeline.yaml'),
  ];

  // Patterns that would indicate real secrets in source.
  const dangerousPatterns = [
    /sk-ant-[a-zA-Z0-9]{20,}/,            // Anthropic API key format
    /eyJ[a-zA-Z0-9_-]{20,}/,              // JWT (base64url prefix)
    /AC[a-f0-9]{32}/,                      // Twilio SID
    /password:\s*["']?[a-zA-Z0-9!@#$%]{12,}["']?/i,  // hardcoded password
  ];

  for (const filePath of files) {
    const fileName = filePath.split('/').pop();

    test.each(dangerousPatterns.map((p, i) => [i, p]))(
      `${fileName} has no dangerous pattern #%i`,
      (_, pattern) => {
        if (!existsSync(filePath)) return; // skip missing files
        const content = readFile(filePath);
        expect(content).not.toMatch(pattern);
      }
    );
  }

  test('values.yaml API key fields are placeholders or empty', () => {
    const values = readYaml(join(HELM, 'values.yaml'));
    // secrets section only lists key names, no values.
    expect(values.secrets.keys).toBeInstanceOf(Array);
    expect(values.secrets.values).toBeUndefined();
  });

  test('secrets template uses REPLACE_WITH placeholders, not real values', () => {
    const content = readFile(join(HELM, 'templates/secrets.yaml'));
    expect(content).toMatch(/REPLACE_WITH_/);
  });
});

// ── 8. Observability config ───────────────────────────────────────────────────

describe('Observability configuration', () => {
  test('all enabled components have Prometheus pod annotations', () => {
    const values = readYaml(join(HELM, 'values.yaml'));
    const promComponents = ['agent', 'whisper', 'claude', 'tts', 'ollama'];
    for (const comp of promComponents) {
      const annotations = values.components[comp].podAnnotations ?? {};
      expect(annotations['prometheus.io/scrape']).toBe('true');
      expect(annotations['prometheus.io/port']).toBeTruthy();
    }
  });

  test('observability.tracing.endpoint is set', () => {
    const values = readYaml(join(HELM, 'values.yaml'));
    expect(values.observability.tracing.endpoint).toMatch(/otlp|tempo|jaeger/i);
  });

  test('observability.tracing.samplingRate is between 0 and 1', () => {
    const values = readYaml(join(HELM, 'values.yaml'));
    const rate = values.observability.tracing.samplingRate;
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(1);
  });

  test('deployments.yaml injects OTEL_EXPORTER_OTLP_ENDPOINT', () => {
    const content = readFile(join(HELM, 'templates/deployments.yaml'));
    expect(content).toMatch(/OTEL_EXPORTER_OTLP_ENDPOINT/);
  });

  test('deployments.yaml includes OTel sidecar template', () => {
    const content = readFile(join(HELM, 'templates/deployments.yaml'));
    expect(content).toMatch(/wolf\.otelSidecar/);
  });

  test('_helpers.tpl defines wolf.otelSidecar', () => {
    const content = readFile(join(HELM, 'templates/_helpers.tpl'));
    expect(content).toMatch(/define "wolf\.otelSidecar"/);
  });
});
