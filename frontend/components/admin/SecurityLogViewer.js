// frontend/components/admin/SecurityLogViewer.js — Admin security log table.
//
// Features:
//   - Filterable by event type, user sub, date range, IP
//   - Sortable columns (timestamp, type)
//   - Pagination (server-side via onFilter callback)
//   - CSV export
//   - Prometheus security metrics strip
//   - Link to Tempo trace for auth events with a traceId
//
// Props:
//   events          — SecurityEvent[]
//   total           — total count (for pagination display)
//   loading         — boolean
//   error           — Error|null
//   onFilter        — (params) => void  (triggers parent SWR revalidation)
//   prometheusData  — object (security metric values from PromQL)
//   tempoUrl        — (traceId: string) => string

import { useState, useMemo, useCallback } from 'react';
import {
  Search, Download, RefreshCw,
  ShieldCheck, ShieldX, ShieldAlert,
  Clock, AlertCircle, ExternalLink,
} from 'lucide-react';
import clsx from 'clsx';

// ── Event type config ─────────────────────────────────────────────────────────

const EVENT_TYPES = [
  { value: '',              label: 'All types' },
  { value: 'jwt_ok',        label: 'JWT OK'       },
  { value: 'jwt_expired',   label: 'JWT Expired'  },
  { value: 'jwt_invalid',   label: 'JWT Invalid'  },
  { value: 'apikey_ok',     label: 'API Key OK'   },
  { value: 'apikey_bad',    label: 'API Key Bad'  },
  { value: 'rbac_deny',     label: 'RBAC Deny'    },
  { value: 'rate_limited',  label: 'Rate Limited' },
];

const TYPE_BADGE = {
  jwt_ok:       'badge-green',
  jwt_expired:  'badge-yellow',
  jwt_invalid:  'badge-red',
  apikey_ok:    'badge-blue',
  apikey_bad:   'badge-red',
  rbac_deny:    'badge-red',
  rate_limited: 'badge-yellow',
};

const TYPE_ICON = {
  jwt_ok:       ShieldCheck,
  apikey_ok:    ShieldCheck,
  jwt_expired:  ShieldAlert,
  jwt_invalid:  ShieldX,
  apikey_bad:   ShieldX,
  rbac_deny:    ShieldX,
  rate_limited: Clock,
};

// ── Prometheus metrics strip ──────────────────────────────────────────────────

function MetricsStrip({ data }) {
  if (!data) return null;

  const items = [
    { label: 'Auth Failures',  value: data.auth_failures  ?? '—' },
    { label: 'Rate Limited',   value: data.rate_limited   ?? '—' },
    { label: 'RBAC Denials',   value: data.rbac_denials   ?? '—' },
    { label: 'Active Sessions',value: data.active_sessions ?? '—' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Security metrics">
      {items.map(({ label, value }) => (
        <div key={label} className="card py-3 text-center">
          <p className="text-xl font-bold font-mono text-text-base tabular-nums">{value}</p>
          <p className="text-xs text-text-muted mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

function FilterBar({ params, onChange, onRefresh }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Text search */}
      <div className="relative flex-1 min-w-[160px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5
                           text-text-muted pointer-events-none" />
        <input
          type="search"
          placeholder="Search sub, IP…"
          value={params.sub ?? ''}
          onChange={e => onChange({ ...params, sub: e.target.value, page: 1 })}
          className="w-full rounded-lg border border-border bg-surface pl-8 pr-3 py-2
                     text-sm text-text-base placeholder:text-text-muted
                     focus:outline-none focus:ring-2 focus:ring-wolf-400"
          aria-label="Search by user or IP"
        />
      </div>

      {/* Event type */}
      <div className="space-y-1">
        <label className="block text-xs text-text-muted">Type</label>
        <select
          value={params.type ?? ''}
          onChange={e => onChange({ ...params, type: e.target.value || undefined, page: 1 })}
          className="rounded-lg border border-border bg-surface px-2 py-2 text-sm
                     text-text-base focus:outline-none focus:ring-2 focus:ring-wolf-400"
          aria-label="Filter by event type"
        >
          {EVENT_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Date from */}
      <div className="space-y-1">
        <label className="block text-xs text-text-muted">From</label>
        <input
          type="date"
          value={params.from ?? ''}
          onChange={e => onChange({ ...params, from: e.target.value || undefined, page: 1 })}
          className="rounded-lg border border-border bg-surface px-2 py-2 text-sm
                     text-text-base focus:outline-none focus:ring-2 focus:ring-wolf-400"
          aria-label="From date"
        />
      </div>

      {/* Date to */}
      <div className="space-y-1">
        <label className="block text-xs text-text-muted">To</label>
        <input
          type="date"
          value={params.to ?? ''}
          onChange={e => onChange({ ...params, to: e.target.value || undefined, page: 1 })}
          className="rounded-lg border border-border bg-surface px-2 py-2 text-sm
                     text-text-base focus:outline-none focus:ring-2 focus:ring-wolf-400"
          aria-label="To date"
        />
      </div>

      <button
        onClick={onRefresh}
        className="btn-ghost self-end"
        aria-label="Refresh logs"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

// ── Event row ─────────────────────────────────────────────────────────────────

function EventRow({ event, tempoUrl }) {
  const badgeClass = TYPE_BADGE[event.type]  ?? 'badge-gray';
  const Icon       = TYPE_ICON[event.type]   ?? ShieldAlert;

  return (
    <tr className="hover:bg-surface transition-colors text-xs">
      <td className="px-4 py-2.5 font-mono text-text-muted whitespace-nowrap">
        {event.ts
          ? new Date(event.ts).toLocaleString('fr-FR', { hour12: false })
          : '—'}
      </td>
      <td className="px-4 py-2.5">
        <span className={clsx(badgeClass, 'flex items-center gap-1 w-fit')}>
          <Icon className="h-3 w-3" aria-hidden="true" />
          {event.type ?? '—'}
        </span>
      </td>
      <td className="px-4 py-2.5 font-mono truncate max-w-[100px]">
        {event.sub ?? '—'}
      </td>
      <td className="px-4 py-2.5 text-text-muted">
        {event.resource ?? '—'}
      </td>
      <td className="px-4 py-2.5 font-mono text-text-muted">
        {event.ip ?? '—'}
      </td>
      <td className="px-4 py-2.5 text-text-muted truncate max-w-[180px]">
        {event.detail ?? '—'}
      </td>
      <td className="px-4 py-2.5">
        {event.traceId && tempoUrl && (
          <a
            href={tempoUrl(event.traceId)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-wolf-500 hover:underline"
            aria-label={`View trace ${event.traceId} in Tempo`}
          >
            Trace <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
      </td>
    </tr>
  );
}

// ── CSV export helper ─────────────────────────────────────────────────────────

function exportCsv(events) {
  const header = 'timestamp,type,sub,resource,ip,detail,traceId';
  const rows   = events.map(e => [
    e.ts, e.type, e.sub, e.resource, e.ip, e.detail, e.traceId,
  ].map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`).join(','));

  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `wolf-security-logs-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main export ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

/**
 * @param {{
 *   events:         object[],
 *   total:          number,
 *   loading:        boolean,
 *   error:          Error|null,
 *   onFilter:       (params: object) => void,
 *   prometheusData: object|null,
 *   tempoUrl?:      (traceId: string) => string,
 * }} props
 */
export default function SecurityLogViewer({
  events = [], total = 0, loading, error,
  onFilter, prometheusData, tempoUrl,
}) {
  const [params, setParams] = useState({ limit: PAGE_SIZE, page: 1 });

  const handleParamsChange = useCallback(next => {
    setParams(next);
    onFilter?.(next);
  }, [onFilter]);

  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = params.page ?? 1;

  if (error) {
    return (
      <div className="card flex items-center gap-3 text-red-500">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <p className="text-sm">Failed to load security logs: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MetricsStrip data={prometheusData} />

      <FilterBar
        params={params}
        onChange={handleParamsChange}
        onRefresh={() => onFilter?.(params)}
      />

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm" aria-label="Security events">
          <thead className="bg-surface border-b border-border">
            <tr>
              {['Time', 'Type', 'Subject', 'Resource', 'IP', 'Detail', 'Trace'].map(h => (
                <th key={h} scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border" aria-busy={loading} aria-live="polite">
            {loading ? (
              Array.from({ length: 8 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-4 py-2">
                    <div className="h-4 w-full animate-pulse rounded bg-border" />
                  </td>
                </tr>
              ))
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-text-muted">
                  No events match the current filter.
                </td>
              </tr>
            ) : events.map((ev, i) => (
              <EventRow key={ev.id ?? i} event={ev} tempoUrl={tempoUrl} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer: pagination + export */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost py-1 px-3 text-xs"
            disabled={currentPage === 1}
            onClick={() => handleParamsChange({ ...params, page: currentPage - 1 })}
            aria-label="Previous page"
          >
            Previous
          </button>
          <span className="text-xs text-text-muted tabular-nums">
            Page {currentPage} / {totalPages} ({total} total)
          </span>
          <button
            className="btn-ghost py-1 px-3 text-xs"
            disabled={currentPage >= totalPages}
            onClick={() => handleParamsChange({ ...params, page: currentPage + 1 })}
            aria-label="Next page"
          >
            Next
          </button>
        </div>

        <button
          className="btn-ghost py-1 px-3 text-xs"
          onClick={() => exportCsv(events)}
          disabled={events.length === 0}
          aria-label="Export logs as CSV"
        >
          <Download className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          Export CSV
        </button>
      </div>
    </div>
  );
}
