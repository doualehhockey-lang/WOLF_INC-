// frontend/components/ClusterView.js — Kubernetes pod grid + HPA status.
//
// Renders:
//   - Pod status grid (one card per pod, colour-coded by phase/ready status)
//   - HPA table: current replicas, min, max, CPU utilisation
//   - Namespace resource quota summary
//
// Props:
//   pods    — array of PodInfo from /api/wolf/k8s/pods
//   hpa     — array of HpaInfo from /api/wolf/k8s/hpa
//   loading — boolean
//   error   — Error|null

import { useMemo } from 'react';
<<<<<<< HEAD
import { Server, AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';
=======
import { Server, Cpu, MemoryStick, AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
import clsx from 'clsx';

// ── Phase → style map ─────────────────────────────────────────────────────────

const PHASE_STYLE = {
<<<<<<< HEAD
  Running: { badge: 'badge-green', Icon: CheckCircle2 },
  Pending: { badge: 'badge-yellow', Icon: Clock },
  Failed: { badge: 'badge-red', Icon: XCircle },
  Unknown: { badge: 'badge-gray', Icon: AlertCircle },
  Succeeded: { badge: 'badge-blue', Icon: CheckCircle2 },
=======
  Running:   { badge: 'badge-green',  Icon: CheckCircle2 },
  Pending:   { badge: 'badge-yellow', Icon: Clock        },
  Failed:    { badge: 'badge-red',    Icon: XCircle      },
  Unknown:   { badge: 'badge-gray',   Icon: AlertCircle  },
  Succeeded: { badge: 'badge-blue',   Icon: CheckCircle2 },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
};

// ── Pod card ──────────────────────────────────────────────────────────────────

/**
 * @param {{ pod: {
 *   name, component, phase, ready, restarts, cpuM, memMi, image, node
 * }}} props
 */
function PodCard({ pod }) {
  const { badge, Icon } = PHASE_STYLE[pod.phase] ?? PHASE_STYLE.Unknown;

<<<<<<< HEAD
  const cpuPct =
    pod.cpuRequestM > 0
      ? Math.min(Math.round(((pod.cpuM ?? 0) / pod.cpuRequestM) * 100), 200)
      : null;
=======
  const cpuPct = pod.cpuRequestM > 0
    ? Math.min(Math.round((pod.cpuM ?? 0) / pod.cpuRequestM * 100), 200)
    : null;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  const isStressed = cpuPct !== null && cpuPct > 80;

  return (
    <article
      className={clsx(
        'card flex flex-col gap-3 text-sm',
<<<<<<< HEAD
        pod.phase === 'Failed' && 'border-red-300 dark:border-red-800'
=======
        pod.phase === 'Failed' && 'border-red-300 dark:border-red-800',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      )}
      aria-label={`Pod: ${pod.name}`}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <Server className="h-4 w-4 text-text-muted mt-0.5 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs truncate">{pod.name}</p>
          <p className="text-xs text-text-muted">{pod.component ?? '—'}</p>
        </div>
        <span className={badge} aria-label={`Phase: ${pod.phase}`}>
          <Icon className="h-3 w-3" aria-hidden="true" />
          {pod.phase}
        </span>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2 text-xs">
<<<<<<< HEAD
        <MetricCell label="Restarts" value={pod.restarts ?? 0} warn={(pod.restarts ?? 0) > 3} />
        <MetricCell
          label="CPU"
          value={cpuPct !== null ? `${cpuPct}%` : `${pod.cpuM ?? 0}m`}
          warn={isStressed}
        />
=======
        <MetricCell label="Restarts" value={pod.restarts ?? 0}
                    warn={(pod.restarts ?? 0) > 3} />
        <MetricCell label="CPU" value={cpuPct !== null ? `${cpuPct}%` : `${pod.cpuM ?? 0}m`}
                    warn={isStressed} />
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
        <MetricCell label="Mem" value={pod.memMi ? `${pod.memMi}Mi` : '—'} />
      </div>

      {/* Ready state */}
      <p className="text-xs text-text-muted">
<<<<<<< HEAD
        Ready:{' '}
        <span className={pod.ready ? 'text-emerald-500' : 'text-red-500'}>
=======
        Ready: <span className={pod.ready ? 'text-emerald-500' : 'text-red-500'}>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
          {pod.ready ? 'Yes' : 'No'}
        </span>
        {pod.node && <span className="ml-2 font-mono">{pod.node}</span>}
      </p>
    </article>
  );
}

function MetricCell({ label, value, warn }) {
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
          'font-mono font-medium tabular-nums',
          warn && 'text-amber-600 dark:text-amber-400'
        )}
      >
=======
    <div className={clsx(
      'rounded-md px-2 py-1 bg-surface text-center',
      warn && 'bg-amber-50 dark:bg-amber-900/20',
    )}>
      <p className={clsx('font-mono font-medium tabular-nums', warn && 'text-amber-600 dark:text-amber-400')}>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
        {value}
      </p>
      <p className="text-text-muted text-[10px]">{label}</p>
    </div>
  );
}

// ── HPA table ─────────────────────────────────────────────────────────────────

/**
 * @param {{ hpa: Array<{
 *   name, component, currentReplicas, desiredReplicas, minReplicas, maxReplicas,
 *   cpuUtilization, targetCpuUtilization
 * }> }} props
 */
function HpaTable({ hpa }) {
<<<<<<< HEAD
  if (!hpa.length)
    return <p className="text-sm text-text-muted text-center py-4">No HPA resources found.</p>;
=======
  if (!hpa.length) return (
    <p className="text-sm text-text-muted text-center py-4">No HPA resources found.</p>
  );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" aria-label="HPA status">
        <thead className="bg-surface border-b border-border">
          <tr>
            {['Component', 'Current', 'Desired', 'Min', 'Max', 'CPU%', 'Target%'].map(h => (
<<<<<<< HEAD
              <th
                key={h}
                scope="col"
                className="px-4 py-2 text-left text-xs font-medium text-text-muted"
              >
=======
              <th key={h} scope="col"
                className="px-4 py-2 text-left text-xs font-medium text-text-muted">
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {hpa.map((h, i) => {
            const cpuOver = h.cpuUtilization > h.targetCpuUtilization;
            return (
              <tr key={h.name ?? i} className="hover:bg-surface transition-colors">
                <td className="px-4 py-2 font-medium">{h.component ?? h.name}</td>
                <td className="px-4 py-2 font-mono tabular-nums">{h.currentReplicas}</td>
                <td className="px-4 py-2 font-mono tabular-nums">{h.desiredReplicas}</td>
<<<<<<< HEAD
                <td className="px-4 py-2 font-mono tabular-nums text-text-muted">
                  {h.minReplicas}
                </td>
                <td className="px-4 py-2 font-mono tabular-nums text-text-muted">
                  {h.maxReplicas}
                </td>
                <td
                  className={clsx(
                    'px-4 py-2 font-mono tabular-nums',
                    cpuOver ? 'text-amber-500' : 'text-text-base'
                  )}
                >
=======
                <td className="px-4 py-2 font-mono tabular-nums text-text-muted">{h.minReplicas}</td>
                <td className="px-4 py-2 font-mono tabular-nums text-text-muted">{h.maxReplicas}</td>
                <td className={clsx('px-4 py-2 font-mono tabular-nums',
                  cpuOver ? 'text-amber-500' : 'text-text-base')}>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
                  {h.cpuUtilization ?? '—'}%
                </td>
                <td className="px-4 py-2 font-mono tabular-nums text-text-muted">
                  {h.targetCpuUtilization ?? '—'}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Summary strip ─────────────────────────────────────────────────────────────

function ClusterSummary({ pods }) {
  const counts = useMemo(() => {
    const c = { Running: 0, Pending: 0, Failed: 0, total: pods.length };
    for (const p of pods) c[p.phase] = (c[p.phase] ?? 0) + 1;
    return c;
  }, [pods]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
<<<<<<< HEAD
      <SumCard label="Total Pods" value={counts.total} icon={Server} />
      <SumCard
        label="Running"
        value={counts.Running ?? 0}
        icon={CheckCircle2}
        color="text-emerald-500"
      />
      <SumCard label="Pending" value={counts.Pending ?? 0} icon={Clock} color="text-amber-500" />
      <SumCard label="Failed" value={counts.Failed ?? 0} icon={XCircle} color="text-red-500" />
=======
      <SumCard label="Total Pods"   value={counts.total}          icon={Server}      />
      <SumCard label="Running"      value={counts.Running ?? 0}   icon={CheckCircle2} color="text-emerald-500" />
      <SumCard label="Pending"      value={counts.Pending ?? 0}   icon={Clock}        color="text-amber-500"   />
      <SumCard label="Failed"       value={counts.Failed ?? 0}    icon={XCircle}      color="text-red-500"     />
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    </div>
  );
}

function SumCard({ label, value, icon: Icon, color = 'text-wolf-500' }) {
  return (
    <div className="card flex items-center gap-3">
      <Icon className={clsx('h-5 w-5 shrink-0', color)} aria-hidden="true" />
      <div>
        <p className="text-xl font-bold font-mono tabular-nums text-text-base">{value}</p>
        <p className="text-xs text-text-muted">{label}</p>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {{
 *   pods:    object[],
 *   hpa:     object[],
 *   loading: boolean,
 *   error:   Error|null,
 * }} props
 */
export default function ClusterView({ pods = [], hpa = [], loading, error }) {
<<<<<<< HEAD
  // Group pods by component for clearer layout.
  const grouped = useMemo(() => {
    const map = {};
    for (const pod of pods) {
      const k = pod.component ?? 'other';
      (map[k] = map[k] ?? []).push(pod);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [pods]);

=======
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading cluster state">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card animate-pulse h-20" />
          ))}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card animate-pulse h-32" />
          ))}
        </div>
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

<<<<<<< HEAD
=======
  // Group pods by component for clearer layout.
  const grouped = useMemo(() => {
    const map = {};
    for (const pod of pods) {
      const k = pod.component ?? 'other';
      (map[k] = map[k] ?? []).push(pod);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [pods]);

>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  return (
    <div className="space-y-6">
      <ClusterSummary pods={pods} />

      {/* Pod grid grouped by component */}
      {grouped.map(([component, cpods]) => (
        <section key={component} aria-label={`${component} pods`}>
          <h3 className="text-sm font-medium mb-3 capitalize">{component}</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cpods.map((pod, i) => (
              <PodCard key={pod.name ?? i} pod={pod} />
            ))}
          </div>
        </section>
      ))}

      {/* HPA status */}
      <section aria-label="HPA status">
        <h3 className="text-sm font-medium mb-3">Horizontal Pod Autoscalers</h3>
        <HpaTable hpa={hpa} />
      </section>
    </div>
  );
}
