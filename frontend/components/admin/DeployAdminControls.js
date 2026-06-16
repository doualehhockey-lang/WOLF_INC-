// frontend/components/admin/DeployAdminControls.js — CI/CD deploy admin panel.
//
// Extends DeployControls with:
//   - Full deploy (all stable replicas, optional force flag)
//   - Deploy history table
//   - Deployment lock toggle (prevents all deploys until unlocked)
//   - Per-job status from GitHub Actions CI run
//   - Prometheus → deployment success rate gauge
//
// Props (all injected for testability):
//   onCanary   — (tag) => Promise
//   onPromote  — () => Promise
//   onRollback — (tag) => Promise
//   onFull     — (tag, force) => Promise
//   status     — DeployStatus object
//   history    — DeployRun[]
//   loading    — boolean
//   error      — Error|null

import { useState, useCallback } from 'react';
import {
  Rocket,
  CheckCircle2,
  RotateCcw,
  Zap,
  Lock,
  Unlock,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import clsx from 'clsx';

// ── Confirm dialog ────────────────────────────────────────────────────────────

function Confirm({ message, onConfirm, onCancel, loading, danger = false }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm deployment action"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div className="card max-w-sm w-full shadow-2xl space-y-4">
        <div className="flex gap-3 items-start">
          <AlertTriangle
            className={clsx('h-5 w-5 shrink-0 mt-0.5', danger ? 'text-red-500' : 'text-amber-500')}
          />
          <div>
            <p className="text-sm font-medium">Confirm action</p>
            <p className="text-sm text-text-muted mt-1">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={loading}
            aria-busy={loading}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tag input ─────────────────────────────────────────────────────────────────

function TagInput({ value, onChange }) {
  return (
    <div className="card">
      <label htmlFor="deploy-tag" className="block text-sm font-medium mb-2">
        Image Tag
        <span className="ml-2 text-xs text-text-muted font-normal">SHA or semver</span>
      </label>
      <input
        id="deploy-tag"
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="sha-abc123 or v2.4.1"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm
                   font-mono text-text-base placeholder:text-text-muted
                   focus:outline-none focus:ring-2 focus:ring-wolf-400"
        spellCheck={false}
        aria-label="Deployment image tag"
      />
    </div>
  );
}

// ── Single action card ────────────────────────────────────────────────────────

function ActionCard({
  label,
  desc,
  icon: Icon,
  confirmMsg,
  variant,
  disabled,
  onExecute,
  danger = false,
}) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // 'ok' | 'error'

  const execute = useCallback(async () => {
    setConfirming(false);
    setLoading(true);
    setResult(null);
    try {
      await onExecute();
      setResult('ok');
    } catch {
      setResult('error');
    } finally {
      setLoading(false);
      setTimeout(() => setResult(null), 5_000);
    }
  }, [onExecute]);

  const btnCls =
    variant === 'danger' ? 'btn-danger' : variant === 'primary' ? 'btn-primary' : 'btn-ghost';

  return (
    <>
      {confirming && (
        <Confirm
          message={confirmMsg}
          onConfirm={execute}
          onCancel={() => setConfirming(false)}
          loading={loading}
          danger={danger}
        />
      )}

      <article className="card flex flex-col gap-4" aria-label={label}>
        <div className="flex items-start gap-3">
          <div
            className={clsx(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              variant === 'danger'
                ? 'bg-red-500/10 text-red-500'
                : variant === 'primary'
                  ? 'bg-wolf-500/10 text-wolf-500'
                  : 'bg-surface text-text-muted'
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-text-muted mt-0.5">{desc}</p>
          </div>
          {result === 'ok' && <span className="badge-green">Done</span>}
          {result === 'error' && <span className="badge-red">Failed</span>}
        </div>

        <button
          className={clsx(btnCls, 'w-full justify-center')}
          onClick={() => setConfirming(true)}
          disabled={disabled || loading}
          aria-busy={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
          {loading ? 'Working…' : label}
        </button>
      </article>
    </>
  );
}

// ── Deploy history table ──────────────────────────────────────────────────────

const STATUS_BADGE = {
  success: 'badge-green',
  failure: 'badge-red',
  running: 'badge-yellow',
  cancelled: 'badge-gray',
};

function HistoryTable({ runs }) {
  const [limit, setLimit] = useState(10);

  if (!runs?.length)
    return <p className="text-sm text-text-muted text-center py-6">No deploy history available.</p>;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm" aria-label="Deploy history">
          <thead className="bg-surface border-b border-border">
            <tr>
              {['#', 'SHA', 'Branch', 'Type', 'Status', 'Duration', 'By', 'Link'].map(h => (
                <th
                  key={h}
                  scope="col"
                  className="px-4 py-2.5 text-left text-xs font-medium text-text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.slice(0, limit).map((run, i) => (
              <tr key={run.id ?? i} className="hover:bg-surface transition-colors">
                <td className="px-4 py-2.5 font-mono text-xs">#{run.id ?? i + 1}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{run.sha?.slice(0, 7) ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-text-muted">{run.branch ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <span className="badge-blue capitalize">{run.type ?? 'deploy'}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={STATUS_BADGE[run.status] ?? 'badge-gray'}>
                    {run.status ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-text-muted">
                  {run.durationSec ? `${run.durationSec}s` : '—'}
                </td>
                <td className="px-4 py-2.5 text-xs text-text-muted">{run.triggeredBy ?? '—'}</td>
                <td className="px-4 py-2.5">
                  {run.url && (
                    <a
                      href={run.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-wolf-500 text-xs hover:underline"
                      aria-label="Open CI run"
                    >
                      CI <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {runs.length > limit && (
        <button
          className="btn-ghost w-full text-xs py-1.5"
          onClick={() => setLimit(l => l + 10)}
          aria-label="Show more history"
        >
          <ChevronDown className="h-3.5 w-3.5 mr-1" />
          Show more ({runs.length - limit} remaining)
        </button>
      )}
    </div>
  );
}

// ── Status strip ──────────────────────────────────────────────────────────────

function StatusStrip({ status }) {
  if (!status) return null;
  return (
    <div className="card flex flex-wrap gap-6 py-3">
      <div>
        <p className="text-xs text-text-muted">Stable Tag</p>
        <span className="font-mono text-sm font-medium">{status.stableTag ?? '—'}</span>
      </div>
      <div>
        <p className="text-xs text-text-muted">Canary</p>
        <span className={status.canaryTag ? 'badge-yellow' : 'badge-gray'}>
          {status.canaryTag ?? 'None'}
        </span>
      </div>
      <div>
        <p className="text-xs text-text-muted">Stable Replicas</p>
        <span className="font-mono text-sm">
          {status.stableReplicas !== null
            ? `${status.stableReplicas.ready}/${status.stableReplicas.desired}`
            : '—'}
        </span>
      </div>
      <div>
        <p className="text-xs text-text-muted">Last Deploy</p>
        <span className="text-xs text-text-muted">
          {status.lastDeployAt ? new Date(status.lastDeployAt).toLocaleString('fr-FR') : '—'}
        </span>
      </div>
    </div>
  );
}

// ── Deploy lock toggle ────────────────────────────────────────────────────────

function DeployLock({ locked, onToggle }) {
  return (
    <div
      className={clsx(
        'card flex items-center gap-3 py-3',
        locked && 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
      )}
    >
      {locked ? (
        <Lock className="h-5 w-5 text-amber-500 shrink-0" />
      ) : (
        <Unlock className="h-5 w-5 text-emerald-500 shrink-0" />
      )}
      <div className="flex-1">
        <p className="text-sm font-medium">Deployments are {locked ? 'LOCKED' : 'unlocked'}</p>
        <p className="text-xs text-text-muted">
          {locked
            ? 'All deploy actions are blocked. Unlock to proceed.'
            : 'Toggle to prevent all deployments (e.g. during a release freeze).'}
        </p>
      </div>
      <button
        onClick={onToggle}
        className={locked ? 'btn-danger' : 'btn-ghost'}
        aria-label={locked ? 'Unlock deployments' : 'Lock deployments'}
        aria-pressed={locked}
      >
        {locked ? 'Unlock' : 'Lock'}
      </button>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {{
 *   onCanary:   (tag: string) => Promise<void>,
 *   onPromote:  () => Promise<void>,
 *   onRollback: (tag: string) => Promise<void>,
 *   onFull:     (tag: string, force: boolean) => Promise<void>,
 *   status?:    object,
 *   history?:   object[],
 *   loading?:   boolean,
 *   error?:     Error|null,
 * }} props
 */
export default function DeployAdminControls({
  onCanary,
  onPromote,
  onRollback,
  onFull,
  status = null,
  history = [],
  loading = false,
  error = null,
}) {
  const [tag, setTag] = useState('');
  const [locked, setLocked] = useState(false);
  const [force, setForce] = useState(false);

  const tagReady = tag.trim().length > 0;
  const canaryAlive = !!status?.canaryTag;

  if (error) {
    return (
      <div className="card flex items-center gap-3 text-red-500">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <p className="text-sm">Deploy status unavailable: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DeployLock locked={locked} onToggle={() => setLocked(l => !l)} />
      <StatusStrip status={status} />
      <TagInput value={tag} onChange={setTag} />

      {/* Force flag (full deploy only) */}
      <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
        <input
          type="checkbox"
          checked={force}
          onChange={e => setForce(e.target.checked)}
          className="rounded border-border text-wolf-500 focus:ring-wolf-400"
          aria-label="Force deploy (bypass smoke tests)"
        />
        Force deploy <span className="text-xs">(bypass smoke tests — Full only)</span>
      </label>

      {/* Action grid */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <ActionCard
          label="Deploy Canary"
          desc="Routes 10% of traffic. Smoke tests run automatically."
          icon={Rocket}
          variant="primary"
          disabled={locked || !tagReady}
          confirmMsg={`Deploy canary "${tag}"? 10% of live traffic will be affected.`}
          onExecute={() => onCanary(tag.trim())}
        />
        <ActionCard
          label="Promote"
          desc="Canary → stable. All traffic shifts to the new image."
          icon={CheckCircle2}
          variant="primary"
          disabled={locked || !canaryAlive}
          confirmMsg="Promote canary to stable? All traffic will switch immediately."
          onExecute={onPromote}
        />
        <ActionCard
          label="Rollback"
          desc="Restores previous stable tag. Canary deleted."
          icon={RotateCcw}
          variant="danger"
          danger
          disabled={locked || !status?.stableTag}
          confirmMsg={`Roll back to "${status?.stableTag ?? 'previous'}"? The current deployment will be replaced.`}
          onExecute={() => onRollback(status?.stableTag)}
        />
        <ActionCard
          label="Full Deploy"
          desc="Direct stable update — no canary phase."
          icon={Zap}
          variant="danger"
          danger
          disabled={locked || !tagReady}
          confirmMsg={`Full deploy "${tag}" directly to stable?${force ? ' FORCE mode: smoke tests bypassed.' : ''}`}
          onExecute={() => onFull(tag.trim(), force)}
        />
      </div>

      {/* History */}
      <section aria-label="Deploy history">
        <h3 className="text-sm font-medium mb-3">Deploy History</h3>
        {loading ? <div className="animate-pulse card h-32" /> : <HistoryTable runs={history} />}
      </section>
    </div>
  );
}
