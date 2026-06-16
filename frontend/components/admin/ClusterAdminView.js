// frontend/components/admin/ClusterAdminView.js — Extended cluster admin view.
//
// Extends ClusterView with:
//   - Node table (name, status, roles, CPU%, MEM%, conditions)
//   - Namespace resource quota (CPU/memory requests + limits)
//   - Pod delete action (drain + force delete)
//   - Grafana embed panel links
//   - Color-coded node condition indicators
//
// Props (all injected for testability):
//   pods          — PodInfo[]
//   hpa           — HpaInfo[]
//   nodes         — NodeInfo[]
//   quota         — NamespaceQuota object
//   loading       — boolean
//   error         — Error|null
//   onDeletePod   — (name: string) => Promise<void>
//   grafanaPanels — GrafanaPanel[]

<<<<<<< HEAD
import { useState, useMemo } from 'react';
import {
  Server,
  HardDrive,
  AlertCircle,
  CheckCircle2,
  Clock,
  Trash2,
  Loader2,
  AlertTriangle,
  ExternalLink,
=======
import { useState, useMemo }    from 'react';
import {
  Server, Cpu, HardDrive, AlertCircle,
  CheckCircle2, XCircle, Clock, Trash2,
  Loader2, AlertTriangle, ExternalLink,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
} from 'lucide-react';
import clsx from 'clsx';

// ── Node row ──────────────────────────────────────────────────────────────────

/**
 * @param {{ node: {
 *   name, status, roles, cpuCapacity, cpuUsagePct,
 *   memCapacityMi, memUsagePct, conditions, version, age
 * }}} props
 */
function NodeRow({ node }) {
  const healthy = node.status === 'Ready';

  // Summarise conditions to a tooltip string.
<<<<<<< HEAD
  const conditionSummary = node.conditions?.map(c => `${c.type}=${c.status}`).join(', ') ?? '';
=======
  const conditionSummary = node.conditions
    ?.map(c => `${c.type}=${c.status}`)
    .join(', ') ?? '';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  return (
    <tr className="hover:bg-surface transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
<<<<<<< HEAD
          <Server
            className={clsx('h-4 w-4 shrink-0', healthy ? 'text-emerald-500' : 'text-red-500')}
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-mono font-medium">{node.name}</p>
            {node.version && <p className="text-xs text-text-muted font-mono">{node.version}</p>}
=======
          <Server className={clsx('h-4 w-4 shrink-0',
            healthy ? 'text-emerald-500' : 'text-red-500')} aria-hidden="true" />
          <div>
            <p className="text-sm font-mono font-medium">{node.name}</p>
            {node.version && (
              <p className="text-xs text-text-muted font-mono">{node.version}</p>
            )}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
          </div>
        </div>
      </td>

      <td className="px-4 py-3">
<<<<<<< HEAD
        <span className={healthy ? 'badge-green' : 'badge-red'}>{node.status ?? 'Unknown'}</span>
      </td>

      <td className="px-4 py-3 text-xs text-text-muted">{node.roles?.join(', ') ?? '—'}</td>
=======
        <span className={healthy ? 'badge-green' : 'badge-red'}>
          {node.status ?? 'Unknown'}
        </span>
      </td>

      <td className="px-4 py-3 text-xs text-text-muted">
        {node.roles?.join(', ') ?? '—'}
      </td>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

      <td className="px-4 py-3">
        <UsageBar pct={node.cpuUsagePct} label={`CPU ${node.cpuUsagePct ?? '—'}%`} />
      </td>

      <td className="px-4 py-3">
        <UsageBar pct={node.memUsagePct} label={`MEM ${node.memUsagePct ?? '—'}%`} />
      </td>

      <td className="px-4 py-3 text-xs text-text-muted" title={conditionSummary}>
        {node.conditions?.length ?? 0} conditions
      </td>

<<<<<<< HEAD
      <td className="px-4 py-3 text-xs text-text-muted">{node.age ?? '—'}</td>
=======
      <td className="px-4 py-3 text-xs text-text-muted">
        {node.age ?? '—'}
      </td>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    </tr>
  );
}

<<<<<<< HEAD
function UsageBar({ pct, label: _label }) {
  const safeP = Math.min(pct ?? 0, 100);
  const color = safeP > 85 ? 'bg-red-500' : safeP > 70 ? 'bg-amber-500' : 'bg-emerald-500';
=======
function UsageBar({ pct, label }) {
  const safeP = Math.min(pct ?? 0, 100);
  const color  =
    safeP > 85 ? 'bg-red-500' :
    safeP > 70 ? 'bg-amber-500' : 'bg-emerald-500';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-surface rounded-full h-1.5 overflow-hidden" aria-hidden="true">
<<<<<<< HEAD
        <div
          className={clsx('h-1.5 rounded-full transition-all', color)}
          style={{ width: `${safeP}%` }}
        />
=======
        <div className={clsx('h-1.5 rounded-full transition-all', color)}
             style={{ width: `${safeP}%` }} />
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      </div>
      <span className="text-xs font-mono tabular-nums text-text-muted">
        {pct !== undefined ? `${pct}%` : '—'}
      </span>
    </div>
  );
}

// ── Namespace quota ───────────────────────────────────────────────────────────

function QuotaPanel({ quota }) {
  if (!quota) return null;

  const items = [
<<<<<<< HEAD
    { label: 'CPU Request', used: quota.cpuRequestUsed, max: quota.cpuRequestLimit },
    { label: 'CPU Limit', used: quota.cpuLimitUsed, max: quota.cpuLimitMax },
    { label: 'Mem Request', used: quota.memRequestUsed, max: quota.memRequestLimit },
    { label: 'Mem Limit', used: quota.memLimitUsed, max: quota.memLimitMax },
    { label: 'Pods', used: quota.podsUsed, max: quota.podsMax },
    { label: 'Services', used: quota.servicesUsed, max: quota.servicesMax },
=======
    { label: 'CPU Request',    used: quota.cpuRequestUsed,  max: quota.cpuRequestLimit  },
    { label: 'CPU Limit',      used: quota.cpuLimitUsed,    max: quota.cpuLimitMax       },
    { label: 'Mem Request',    used: quota.memRequestUsed,  max: quota.memRequestLimit   },
    { label: 'Mem Limit',      used: quota.memLimitUsed,    max: quota.memLimitMax       },
    { label: 'Pods',           used: quota.podsUsed,        max: quota.podsMax           },
    { label: 'Services',       used: quota.servicesUsed,    max: quota.servicesMax       },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  ];

  return (
    <section className="card space-y-3" aria-label="Namespace resource quota">
      <h3 className="text-sm font-medium">Namespace Resource Quota</h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(({ label, used, max }) => {
          const pct = max ? Math.round((used / max) * 100) : 0;
          return (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted">{label}</span>
<<<<<<< HEAD
                <span className="font-mono tabular-nums">
                  {used ?? '—'} / {max ?? '—'}
                </span>
              </div>
              <div className="w-full bg-surface rounded-full h-1.5 overflow-hidden">
                <div
                  className={clsx(
                    'h-1.5 rounded-full',
                    pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-amber-500' : 'bg-wolf-500'
                  )}
=======
                <span className="font-mono tabular-nums">{used ?? '—'} / {max ?? '—'}</span>
              </div>
              <div className="w-full bg-surface rounded-full h-1.5 overflow-hidden">
                <div
                  className={clsx('h-1.5 rounded-full',
                    pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-amber-500' : 'bg-wolf-500')}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
                  style={{ width: `${pct}%` }}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${label} usage: ${pct}%`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Pod card with delete action ───────────────────────────────────────────────

const PHASE_STYLE = {
<<<<<<< HEAD
  Running: 'badge-green',
  Pending: 'badge-yellow',
  Failed: 'badge-red',
  Succeeded: 'badge-blue',
  Unknown: 'badge-gray',
};

function PodCard({ pod, onDelete }) {
  const [confirm, setConfirm] = useState(false);
=======
  Running:   'badge-green',
  Pending:   'badge-yellow',
  Failed:    'badge-red',
  Succeeded: 'badge-blue',
  Unknown:   'badge-gray',
};

function PodCard({ pod, onDelete }) {
  const [confirm,  setConfirm]  = useState(false);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
<<<<<<< HEAD
    try {
      await onDelete(pod.name);
    } finally {
      setDeleting(false);
      setConfirm(false);
    }
=======
    try { await onDelete(pod.name); }
    finally { setDeleting(false); setConfirm(false); }
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  };

  return (
    <>
      {confirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Delete pod ${pod.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <div className="card max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Delete pod?</p>
                <p className="text-xs font-mono text-text-muted mt-1">{pod.name}</p>
                <p className="text-xs text-text-muted mt-1">
                  The pod will be deleted and replaced by the Deployment controller.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
<<<<<<< HEAD
              <button className="btn-ghost" onClick={() => setConfirm(false)} disabled={deleting}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleDelete}
                disabled={deleting}
                aria-busy={deleting}
              >
=======
              <button className="btn-ghost" onClick={() => setConfirm(false)} disabled={deleting}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete} disabled={deleting} aria-busy={deleting}>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <article
<<<<<<< HEAD
        className={clsx(
          'card flex flex-col gap-3',
          pod.phase === 'Failed' && 'border-red-300 dark:border-red-800'
        )}
=======
        className={clsx('card flex flex-col gap-3',
          pod.phase === 'Failed' && 'border-red-300 dark:border-red-800')}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
        aria-label={`Pod: ${pod.name}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-xs truncate">{pod.name}</p>
            <p className="text-xs text-text-muted mt-0.5">{pod.component ?? '—'}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className={PHASE_STYLE[pod.phase] ?? 'badge-gray'}>{pod.phase}</span>
            <button
              onClick={() => setConfirm(true)}
              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30
                         text-red-400 hover:text-red-600 transition-colors"
              aria-label={`Delete pod ${pod.name}`}
              title="Delete pod"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
<<<<<<< HEAD
          <MiniStat label="Restarts" value={pod.restarts ?? 0} warn={(pod.restarts ?? 0) > 3} />
          <MiniStat
            label="CPU"
            value={pod.cpuM ? `${pod.cpuM}m` : '—'}
            warn={pod.cpuM > pod.cpuRequestM * 0.9}
          />
=======
          <MiniStat label="Restarts" value={pod.restarts ?? 0}
                    warn={(pod.restarts ?? 0) > 3} />
          <MiniStat label="CPU" value={pod.cpuM ? `${pod.cpuM}m` : '—'}
                    warn={pod.cpuM > pod.cpuRequestM * 0.9} />
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
          <MiniStat label="Mem" value={pod.memMi ? `${pod.memMi}Mi` : '—'} />
        </div>

        <p className="text-xs text-text-muted">
<<<<<<< HEAD
          Ready:{' '}
          <span className={pod.ready ? 'text-emerald-500' : 'text-red-500'}>
=======
          Ready: <span className={pod.ready ? 'text-emerald-500' : 'text-red-500'}>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
            {pod.ready ? 'Yes' : 'No'}
          </span>
        </p>
      </article>
    </>
  );
}

function MiniStat({ label, value, warn }) {
  return (
<<<<<<< HEAD
    <div
      className={clsx(
        'rounded-md px-2 py-1 bg-surface text-center',
        warn && 'bg-amber-50 dark:bg-amber-900/20'
      )}
    >
      <p
        className={clsx(
          'font-mono font-medium tabular-nums text-xs',
          warn && 'text-amber-600 dark:text-amber-400'
        )}
      >
        {value}
      </p>
=======
    <div className={clsx('rounded-md px-2 py-1 bg-surface text-center',
      warn && 'bg-amber-50 dark:bg-amber-900/20')}>
      <p className={clsx('font-mono font-medium tabular-nums text-xs',
        warn && 'text-amber-600 dark:text-amber-400')}>{value}</p>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      <p className="text-text-muted text-[10px]">{label}</p>
    </div>
  );
}

// ── Grafana panels ────────────────────────────────────────────────────────────

function GrafanaPanels({ panels }) {
  if (!panels?.length) return null;
  return (
    <section className="card space-y-3" aria-label="Grafana panels">
      <h3 className="text-sm font-medium">Grafana — Security Dashboard</h3>
      <div className="flex flex-wrap gap-3">
        {panels.map((panel, i) => (
          <a
            key={panel.uid ?? i}
            href={panel.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-border bg-surface
                       px-3 py-2 text-xs font-medium text-text-base hover:bg-surface-2
                       transition-colors"
            aria-label={`Open Grafana panel: ${panel.title}`}
          >
            {panel.title}
            <ExternalLink className="h-3 w-3 text-text-muted" aria-hidden="true" />
          </a>
        ))}
      </div>
    </section>
  );
}

// ── Summary strip ─────────────────────────────────────────────────────────────

function ClusterSummary({ pods, nodes }) {
  const podCounts = useMemo(() => {
    const c = { Running: 0, Pending: 0, Failed: 0, total: pods.length };
<<<<<<< HEAD
    pods.forEach(p => {
      c[p.phase] = (c[p.phase] ?? 0) + 1;
    });
=======
    pods.forEach(p => { c[p.phase] = (c[p.phase] ?? 0) + 1; });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    return c;
  }, [pods]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
<<<<<<< HEAD
        { label: 'Total Pods', value: podCounts.total, icon: Server, color: 'text-wolf-500' },
        {
          label: 'Running',
          value: podCounts.Running ?? 0,
          icon: CheckCircle2,
          color: 'text-emerald-500',
        },
        { label: 'Pending', value: podCounts.Pending ?? 0, icon: Clock, color: 'text-amber-500' },
        { label: 'Nodes', value: nodes.length, icon: HardDrive, color: 'text-wolf-500' },
=======
        { label: 'Total Pods',   value: podCounts.total,          icon: Server,        color: 'text-wolf-500'    },
        { label: 'Running',      value: podCounts.Running ?? 0,   icon: CheckCircle2,  color: 'text-emerald-500' },
        { label: 'Pending',      value: podCounts.Pending  ?? 0,  icon: Clock,         color: 'text-amber-500'   },
        { label: 'Nodes',        value: nodes.length,             icon: HardDrive,     color: 'text-wolf-500'    },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      ].map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="card flex items-center gap-3">
          <Icon className={clsx('h-5 w-5 shrink-0', color)} aria-hidden="true" />
          <div>
            <p className="text-xl font-bold font-mono tabular-nums">{value}</p>
            <p className="text-xs text-text-muted">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {{
 *   pods:          object[],
 *   hpa:           object[],
 *   nodes:         object[],
 *   quota:         object|null,
 *   loading:       boolean,
 *   error:         Error|null,
 *   onDeletePod:   (name: string) => Promise<void>,
 *   grafanaPanels: object[],
 * }} props
 */
export default function ClusterAdminView({
<<<<<<< HEAD
  pods = [],
  hpa = [],
  nodes = [],
  quota = null,
  loading,
  error,
  onDeletePod,
  grafanaPanels = [],
}) {
  const grouped = useMemo(() => {
    const map = {};
    pods.forEach(p => {
      const k = p.component ?? 'other';
      (map[k] = map[k] ?? []).push(p);
    });
=======
  pods = [], hpa = [], nodes = [], quota = null,
  loading, error, onDeletePod, grafanaPanels = [],
}) {
  const grouped = useMemo(() => {
    const map = {};
    pods.forEach(p => { const k = p.component ?? 'other'; (map[k] = map[k] ?? []).push(p); });
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [pods]);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading cluster state">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card animate-pulse h-24" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card flex items-center gap-3 text-red-500">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <p className="text-sm">Failed to load cluster state: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ClusterSummary pods={pods} nodes={nodes} />

      <GrafanaPanels panels={grafanaPanels} />

      <QuotaPanel quota={quota} />

      {/* Node table */}
      <section aria-label="Nodes">
        <h3 className="text-sm font-medium mb-3">Nodes</h3>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm" aria-label="Kubernetes nodes">
            <thead className="bg-surface border-b border-border">
              <tr>
<<<<<<< HEAD
                {['Node', 'Status', 'Roles', 'CPU Usage', 'Mem Usage', 'Conditions', 'Age'].map(
                  h => (
                    <th
                      key={h}
                      scope="col"
                      className="px-4 py-2.5 text-left text-xs font-medium text-text-muted"
                    >
                      {h}
                    </th>
                  )
                )}
=======
                {['Node', 'Status', 'Roles', 'CPU Usage', 'Mem Usage', 'Conditions', 'Age'].map(h => (
                  <th key={h} scope="col"
                    className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">{h}</th>
                ))}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {nodes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-muted">
                    No nodes found.
                  </td>
                </tr>
<<<<<<< HEAD
              ) : (
                nodes.map((node, i) => <NodeRow key={node.name ?? i} node={node} />)
              )}
=======
              ) : nodes.map((node, i) => (
                <NodeRow key={node.name ?? i} node={node} />
              ))}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
            </tbody>
          </table>
        </div>
      </section>

      {/* HPA table */}
      <section aria-label="HPA">
        <h3 className="text-sm font-medium mb-3">Horizontal Pod Autoscalers</h3>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm" aria-label="HPA status">
            <thead className="bg-surface border-b border-border">
              <tr>
                {['Component', 'Current', 'Desired', 'Min', 'Max', 'CPU %', 'Target %'].map(h => (
<<<<<<< HEAD
                  <th
                    key={h}
                    scope="col"
                    className="px-4 py-2.5 text-left text-xs font-medium text-text-muted"
                  >
                    {h}
                  </th>
=======
                  <th key={h} scope="col"
                    className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">{h}</th>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {hpa.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-text-muted">
                    No HPA resources found.
                  </td>
                </tr>
<<<<<<< HEAD
              ) : (
                hpa.map((h, i) => (
                  <tr key={h.name ?? i} className="hover:bg-surface transition-colors">
                    <td className="px-4 py-2.5 font-medium">{h.component ?? h.name}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">{h.currentReplicas}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">{h.desiredReplicas}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-text-muted">
                      {h.minReplicas}
                    </td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-text-muted">
                      {h.maxReplicas}
                    </td>
                    <td
                      className={clsx(
                        'px-4 py-2.5 font-mono tabular-nums',
                        h.cpuUtilization > h.targetCpuUtilization
                          ? 'text-amber-500'
                          : 'text-text-base'
                      )}
                    >
                      {h.cpuUtilization ?? '—'}%
                    </td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-text-muted">
                      {h.targetCpuUtilization ?? '—'}%
                    </td>
                  </tr>
                ))
              )}
=======
              ) : hpa.map((h, i) => (
                <tr key={h.name ?? i} className="hover:bg-surface transition-colors">
                  <td className="px-4 py-2.5 font-medium">{h.component ?? h.name}</td>
                  <td className="px-4 py-2.5 font-mono tabular-nums">{h.currentReplicas}</td>
                  <td className="px-4 py-2.5 font-mono tabular-nums">{h.desiredReplicas}</td>
                  <td className="px-4 py-2.5 font-mono tabular-nums text-text-muted">{h.minReplicas}</td>
                  <td className="px-4 py-2.5 font-mono tabular-nums text-text-muted">{h.maxReplicas}</td>
                  <td className={clsx('px-4 py-2.5 font-mono tabular-nums',
                    h.cpuUtilization > h.targetCpuUtilization ? 'text-amber-500' : 'text-text-base')}>
                    {h.cpuUtilization ?? '—'}%
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums text-text-muted">
                    {h.targetCpuUtilization ?? '—'}%
                  </td>
                </tr>
              ))}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
            </tbody>
          </table>
        </div>
      </section>

      {/* Pod grid */}
      {grouped.map(([component, cpods]) => (
        <section key={component} aria-label={`${component} pods`}>
          <h3 className="text-sm font-medium mb-3 capitalize">{component}</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {cpods.map((pod, i) => (
              <PodCard key={pod.name ?? i} pod={pod} onDelete={onDeletePod} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
