// frontend/components/DeployControls.js — CI/CD deploy action panel.
//
// Actions:
//   1. Deploy Canary  — POST /deploy/canary  { tag }
//   2. Promote Canary — POST /deploy/promote {}
//   3. Rollback       — POST /deploy/rollback { tag }
//
// Each destructive action requires an inline confirmation step to prevent
// accidental clicks.  Loading state is shown per-action.
//
// Props:
//   onTriggerCanary  — (tag: string) => Promise<void>
//   onPromote        — () => Promise<void>
//   onRollback       — (tag: string) => Promise<void>
//   lastStable       — string|null   (last known stable image tag)
//   canaryActive     — boolean       (true when a canary pod is running)

import { useState, useCallback } from 'react';
import { Rocket, CheckCircle2, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react';
import clsx from 'clsx';

// ── Confirmation dialog ───────────────────────────────────────────────────────

/**
 * @param {{
 *   message:   string,
 *   onConfirm: () => void,
 *   onCancel:  () => void,
 * }} props
 */
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm action"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div className="card max-w-sm w-full shadow-2xl space-y-4">
        <div className="flex gap-3 items-start">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-text-base">Confirm action</p>
            <p className="text-sm text-text-muted mt-1">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-danger" onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Action button with confirmation + loading ────────────────────────────────

/**
 * @param {{
 *   label:       string,
 *   description: string,
 *   icon:        React.ComponentType,
 *   confirmMsg:  string,
 *   variant:     'primary'|'danger'|'ghost',
 *   disabled?:   boolean,
 *   onExecute:   () => Promise<void>,
 * }} props
 */
function ActionCard({ label, description, icon: Icon, confirmMsg, variant, disabled, onExecute }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // 'ok' | 'error'

  const handleClick = () => {
    if (disabled) return;
    setConfirming(true);
  };

  const handleConfirm = useCallback(async () => {
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
      // Auto-clear result badge after 4s.
      setTimeout(() => setResult(null), 4_000);
    }
  }, [onExecute]);

  const btnClass =
    variant === 'danger' ? 'btn-danger' : variant === 'primary' ? 'btn-primary' : 'btn-ghost';

  return (
    <>
      {confirming && (
        <ConfirmDialog
          message={confirmMsg}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}

      <article className="card flex flex-col gap-4" aria-label={label}>
        <div className="flex items-start gap-3">
          <div
            className={clsx(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              variant === 'danger'
                ? 'bg-red-500/10   text-red-500'
                : variant === 'primary'
                  ? 'bg-wolf-500/10  text-wolf-500'
                  : 'bg-surface       text-text-muted'
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-base">{label}</p>
            <p className="text-xs text-text-muted mt-0.5">{description}</p>
          </div>

          {/* Result badge */}
          {result === 'ok' && <span className="badge-green">Done</span>}
          {result === 'error' && <span className="badge-red">Failed</span>}
        </div>

        <button
          className={clsx(btnClass, 'w-full justify-center')}
          onClick={handleClick}
          disabled={disabled || loading}
          aria-busy={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Icon className="h-4 w-4" aria-hidden="true" />
          )}
          {loading ? 'Working…' : label}
        </button>
      </article>
    </>
  );
}

// ── Canary tag input ──────────────────────────────────────────────────────────

function CanaryTagInput({ value, onChange }) {
  return (
    <div className="card space-y-2">
      <label htmlFor="canary-tag" className="block text-sm font-medium">
        Image Tag
        <span className="ml-1 text-text-muted font-normal">(sha or semver)</span>
      </label>
      <input
        id="canary-tag"
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="sha-abc123"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm
                   font-mono text-text-base placeholder:text-text-muted
                   focus:outline-none focus:ring-2 focus:ring-wolf-400"
        spellCheck={false}
        aria-label="Canary image tag"
      />
    </div>
  );
}

// ── Deployment status strip ───────────────────────────────────────────────────

function StatusStrip({ canaryActive, lastStable }) {
  return (
    <div className="card flex flex-wrap gap-6 py-3">
      <div>
        <p className="text-xs text-text-muted">Canary</p>
        <span className={canaryActive ? 'badge-yellow' : 'badge-gray'}>
          {canaryActive ? 'Active (10%)' : 'Inactive'}
        </span>
      </div>
      <div>
        <p className="text-xs text-text-muted">Last Stable</p>
        <span className="font-mono text-xs text-text-base">{lastStable ?? '—'}</span>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {{
 *   onTriggerCanary: (tag: string) => Promise<void>,
 *   onPromote:       () => Promise<void>,
 *   onRollback:      (tag: string) => Promise<void>,
 *   lastStable?:     string|null,
 *   canaryActive?:   boolean,
 * }} props
 */
export default function DeployControls({
  onTriggerCanary,
  onPromote,
  onRollback,
  lastStable = null,
  canaryActive = false,
}) {
  const [tag, setTag] = useState('');

  return (
    <div className="space-y-4">
      <StatusStrip canaryActive={canaryActive} lastStable={lastStable} />

      <CanaryTagInput value={tag} onChange={setTag} />

      <div className="grid gap-4 sm:grid-cols-3">
        <ActionCard
          label="Deploy Canary"
          description="Routes 10% of traffic to the new image. Smoke tests run automatically."
          icon={Rocket}
          confirmMsg={`Deploy canary image "${tag || '(no tag)'}"? This will route 10% of live traffic.`}
          variant="primary"
          disabled={!tag.trim()}
          onExecute={() => onTriggerCanary(tag.trim())}
        />

        <ActionCard
          label="Promote to Stable"
          description="Replaces the stable deployment with the current canary image."
          icon={CheckCircle2}
          confirmMsg="Promote the canary to stable? All traffic will shift to the new image."
          variant="primary"
          disabled={!canaryActive}
          onExecute={onPromote}
        />

        <ActionCard
          label="Rollback"
          description="Restores the previous stable image. The canary is deleted."
          icon={RotateCcw}
          confirmMsg={`Roll back to "${lastStable ?? 'previous'}"? The current deployment will be replaced.`}
          variant="danger"
          disabled={!lastStable}
          onExecute={() => onRollback(lastStable)}
        />
      </div>
    </div>
  );
}
