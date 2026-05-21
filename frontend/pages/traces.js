// frontend/pages/traces.js — Distributed trace explorer.
//
// Fetches the last N pipeline traces from the backend and renders them
// in an expandable Gantt timeline via TraceViewer.
// A "View in Tempo" button deep-links to the Grafana Tempo datasource
// for detailed span inspection.

import { useState, useCallback }  from 'react';
import useSWR                      from 'swr';
import Layout                      from '../components/Layout.js';
import TraceViewer                 from '../components/TraceViewer.js';
import { apiFetcher }              from '../lib/api.js';

const LIMITS     = [20, 50, 100, 200];
const TEMPO_BASE = process.env.NEXT_PUBLIC_TEMPO_URL ?? 'http://localhost:3000/explore';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tempoUrl(traceId) {
  return `${TEMPO_BASE}?orgId=1&left=%7B%22datasource%22%3A%22tempo%22%2C%22queries%22%3A%5B%7B%22query%22%3A%22${traceId}%22%7D%5D%7D`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TracesPage() {
  const [limit, setLimit] = useState(50);

  const { data, error, isLoading, mutate } = useSWR(
    `/traces?limit=${limit}`,
    apiFetcher,
    { refreshInterval: 10_000 },
  );

  const handleSelect = useCallback(traceId => {
    window.open(tempoUrl(traceId), '_blank', 'noopener,noreferrer');
  }, []);

  const traces = data?.traces ?? data ?? [];

  return (
    <Layout
      title="Traces"
      description={`Last ${limit} pipeline traces — click a row to expand spans`}
    >
      <div className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="trace-limit" className="text-sm text-text-muted">Show:</label>
            <select
              id="trace-limit"
              value={limit}
              onChange={e => setLimit(Number(e.target.value))}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm
                         text-text-base focus:outline-none focus:ring-2 focus:ring-wolf-400"
            >
              {LIMITS.map(l => (
                <option key={l} value={l}>{l} traces</option>
              ))}
            </select>
          </div>

          <button
            className="btn-ghost"
            onClick={() => mutate()}
            aria-label="Refresh traces"
          >
            Refresh
          </button>

          <span className="text-xs text-text-muted ml-auto">
            {!isLoading && `${traces.length} traces`}
          </span>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 card py-2">
          <p className="text-xs text-text-muted font-medium">Status:</p>
          {[
            { label: 'OK',    color: 'bg-emerald-500' },
            { label: 'ERROR', color: 'bg-red-500'     },
            { label: 'UNSET', color: 'bg-slate-400'   },
          ].map(({ label, color }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-text-muted">
              <span className={`inline-block h-2 w-4 rounded-sm ${color}`} aria-hidden="true" />
              {label}
            </span>
          ))}
          <span className="text-xs text-text-muted ml-auto">
            Bars are proportional to span duration. Click "Tempo ↗" for full details.
          </span>
        </div>

        {/* Trace list */}
        <TraceViewer
          traces={traces}
          loading={isLoading}
          error={error}
          onSelect={handleSelect}
        />
      </div>
    </Layout>
  );
}
