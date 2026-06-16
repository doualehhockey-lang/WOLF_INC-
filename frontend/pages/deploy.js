// frontend/pages/deploy.js — CI/CD deployment control panel.
//
// Provides canary deploy, promote, and rollback actions via the Wolf Engine
// deploy API.  The backend is expected to expose:
//   POST /deploy/canary   { tag }
//   POST /deploy/promote  {}
//   POST /deploy/rollback { tag }
//   GET  /deploy/status
//
// All state-mutating actions require inline confirmation (in DeployControls).

import useSWR                from 'swr';
import { Rocket, RefreshCw } from 'lucide-react';
import Layout                from '../components/Layout.js';
import DeployControls        from '../components/DeployControls.js';
import ChartPanel            from '../components/ChartPanel.js';
import { apiFetcher, apiPost } from '../lib/api.js';

const SWR_OPTS = { refreshInterval: 15_000 };

// ── Deployment status strip ───────────────────────────────────────────────────

function DeployStatusCards({ status, loading, error }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <ChartPanel
        title="Current Stable"
        subtitle="Running image tag"
        value={status?.stableTag ?? '—'}
        loading={loading}
        error={error}
      />
      <ChartPanel
        title="Canary Tag"
        subtitle="Running canary (if any)"
        value={status?.canaryTag ?? 'None'}
        loading={loading}
        error={error}
      />
      <ChartPanel
        title="Stable Replicas"
        subtitle="Ready / desired"
        value={status?.stableReplicas != null
          ? `${status.stableReplicas.ready}/${status.stableReplicas.desired}`
          : '—'}
        loading={loading}
        error={error}
      />
      <ChartPanel
        title="Last Deploy"
        subtitle="UTC timestamp"
        value={status?.lastDeployAt
          ? new Date(status.lastDeployAt).toLocaleString('fr-FR')
          : '—'}
        loading={loading}
        error={error}
      />
    </div>
  );
}

// ── Pipeline run history ──────────────────────────────────────────────────────

function PipelineHistory({ runs }) {
  if (!runs?.length) return null;

  const STATUS_BADGE = {
    success: 'badge-green',
    failure: 'badge-red',
    running: 'badge-yellow',
  };

  return (
    <section aria-label="Recent CI runs" className="card">
      <h3 className="text-sm font-medium mb-3">Recent Pipeline Runs</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="CI pipeline runs">
          <thead className="border-b border-border">
            <tr>
              {['Run', 'Commit', 'Branch', 'Status', 'Duration', 'Triggered'].map(h => (
                <th key={h} scope="col"
                  className="pb-2 text-left text-xs font-medium text-text-muted px-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.map((run, i) => (
              <tr key={run.id ?? i} className="hover:bg-surface transition-colors">
                <td className="px-2 py-2 font-mono text-xs">#{run.id ?? i + 1}</td>
                <td className="px-2 py-2 font-mono text-xs truncate max-w-[80px]">
                  {run.sha?.slice(0, 7) ?? '—'}
                </td>
                <td className="px-2 py-2 text-xs text-text-muted">{run.branch ?? '—'}</td>
                <td className="px-2 py-2">
                  <span className={STATUS_BADGE[run.status] ?? 'badge-gray'}>
                    {run.status ?? 'unknown'}
                  </span>
                </td>
                <td className="px-2 py-2 font-mono text-xs text-text-muted">
                  {run.durationSec ? `${run.durationSec}s` : '—'}
                </td>
                <td className="px-2 py-2 text-xs text-text-muted">
                  {run.triggeredBy ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DeployPage() {
  const {
    data: status,
    error: statusError,
    isLoading: statusLoading,
    mutate,
  } = useSWR('/deploy/status', apiFetcher, SWR_OPTS);

  const {
    data: runsData,
    isLoading: runsLoading,
  } = useSWR('/deploy/runs', apiFetcher, SWR_OPTS);

  const handleTriggerCanary = async tag => {
    await apiPost('/deploy/canary', { tag });
    mutate();
  };

  const handlePromote = async () => {
    await apiPost('/deploy/promote', {});
    mutate();
  };

  const handleRollback = async tag => {
    await apiPost('/deploy/rollback', { tag });
    mutate();
  };

  return (
    <Layout title="Deploy" description="Canary deploy · promote · rollback">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Rocket className="h-5 w-5 text-wolf-500 shrink-0" aria-hidden="true" />
          <p className="text-sm text-text-muted">
            Canary deployments route 10% of traffic.  Promote only after smoke tests pass.
          </p>
          <button
            className="btn-ghost ml-auto py-1 px-2"
            onClick={() => mutate()}
            aria-label="Refresh deploy status"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <DeployStatusCards
          status={status}
          loading={statusLoading}
          error={statusError}
        />

        <DeployControls
          onTriggerCanary={handleTriggerCanary}
          onPromote={handlePromote}
          onRollback={handleRollback}
          lastStable={status?.stableTag ?? null}
          canaryActive={!!status?.canaryTag}
        />

        {!runsLoading && (
          <PipelineHistory runs={runsData?.runs ?? []} />
        )}
      </div>
    </Layout>
  );
}
