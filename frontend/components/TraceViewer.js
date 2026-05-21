// frontend/components/TraceViewer.js — OTel distributed trace timeline.
//
// Renders a list of traces, each expandable to show its span tree.
// Spans are rendered as proportional horizontal bars (Gantt-style).
//
// Props:
//   traces   — array of Trace objects from /api/wolf/traces
//   loading  — boolean
//   error    — Error|null
//   onSelect — (traceId: string) => void  (optional deep-link to Tempo)

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Clock, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

// ── Status colour map ─────────────────────────────────────────────────────────
const STATUS_STYLE = {
  OK:    'bg-emerald-500',
  ERROR: 'bg-red-500',
  UNSET: 'bg-slate-400',
};

// ── Span bar ──────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   span:       { name, startMs, durationMs, status, attributes },
 *   traceStart: number,
 *   traceDur:   number,
 *   depth:      number,
 * }} props
 */
function SpanRow({ span, traceStart, traceDur, depth }) {
  const [tip, setTip] = useState(false);

  const leftPct  = ((span.startMs - traceStart) / traceDur) * 100;
  const widthPct = Math.max((span.durationMs / traceDur) * 100, 0.5); // min 0.5% visible

  const statusBar = STATUS_STYLE[span.status] ?? STATUS_STYLE.UNSET;

  return (
    <li
      className="relative flex items-center gap-2 py-1 group"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      {/* Span name */}
      <span className="w-48 shrink-0 truncate text-xs text-text-base font-mono">
        {span.name}
      </span>

      {/* Timeline bar */}
      <div className="relative flex-1 h-5 bg-surface rounded overflow-hidden">
        <div
          className={clsx('absolute top-0.5 bottom-0.5 rounded-sm transition-opacity', statusBar)}
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          onMouseEnter={() => setTip(true)}
          onMouseLeave={() => setTip(false)}
          aria-label={`${span.name}: ${span.durationMs}ms`}
        />
        {/* Tooltip */}
        {tip && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-7 z-10 card text-xs
                          min-w-max shadow-xl pointer-events-none whitespace-nowrap">
            <p className="font-semibold">{span.name}</p>
            <p className="text-text-muted">Duration: <span className="font-mono">{span.durationMs}ms</span></p>
            <p className="text-text-muted">Status: {span.status}</p>
            {span.attributes && Object.entries(span.attributes).slice(0, 4).map(([k, v]) => (
              <p key={k} className="text-text-muted font-mono">{k}: {String(v)}</p>
            ))}
          </div>
        )}
      </div>

      {/* Duration label */}
      <span className="w-16 shrink-0 text-right text-xs font-mono text-text-muted">
        {span.durationMs}ms
      </span>
    </li>
  );
}

// ── Trace row ─────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   trace:    { traceId, rootName, startMs, durationMs, status, spans },
 *   onSelect: (id: string) => void,
 * }} props
 */
function TraceRow({ trace, onSelect }) {
  const [expanded, setExpanded] = useState(false);

  const { traceId, rootName, startMs, durationMs, status, spans = [] } = trace;

  const statusClass =
    status === 'ERROR' ? 'badge-red' :
    status === 'OK'    ? 'badge-green' : 'badge-gray';

  // Sort spans by start time for correct Gantt rendering.
  const sortedSpans = useMemo(
    () => [...spans].sort((a, b) => a.startMs - b.startMs),
    [spans],
  );

  return (
    <li className="card p-0 overflow-hidden">
      {/* Summary row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors
                   text-left"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        aria-controls={`trace-${traceId}`}
      >
        {expanded
          ? <ChevronDown  className="h-4 w-4 text-text-muted shrink-0" />
          : <ChevronRight className="h-4 w-4 text-text-muted shrink-0" />}

        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium truncate">{rootName}</span>
          <span className="block text-xs text-text-muted font-mono mt-0.5">
            {traceId.slice(0, 16)}…
          </span>
        </span>

        <span className={statusClass}>{status}</span>

        <span className="flex items-center gap-1 text-xs text-text-muted font-mono ml-2">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {durationMs}ms
        </span>

        {onSelect && (
          <button
            className="btn-ghost text-xs py-1 px-2 ml-2"
            onClick={e => { e.stopPropagation(); onSelect(traceId); }}
            aria-label="Open in Tempo"
          >
            Tempo ↗
          </button>
        )}
      </button>

      {/* Span waterfall */}
      {expanded && (
        <div id={`trace-${traceId}`} className="border-t border-border px-4 py-2">
          {sortedSpans.length === 0 ? (
            <p className="text-xs text-text-muted py-2">No spans available.</p>
          ) : (
            <ul className="space-y-0.5" aria-label="Spans">
              {sortedSpans.map((span, i) => (
                <SpanRow
                  key={span.spanId ?? i}
                  span={span}
                  traceStart={startMs}
                  traceDur={Math.max(durationMs, 1)}
                  depth={span.depth ?? 0}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {{
 *   traces:    object[],
 *   loading:   boolean,
 *   error:     Error|null,
 *   onSelect?: (traceId: string) => void,
 * }} props
 */
export default function TraceViewer({ traces = [], loading, error, onSelect }) {
  if (loading) {
    return (
      <ul className="space-y-2" aria-label="Loading traces" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="card animate-pulse h-14" />
        ))}
      </ul>
    );
  }

  if (error) {
    return (
      <div className="card flex items-center gap-3 text-red-500">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <p className="text-sm">Failed to load traces: {error.message}</p>
      </div>
    );
  }

  if (!traces.length) {
    return (
      <div className="card text-center py-12">
        <p className="text-text-muted text-sm">No traces found.</p>
        <p className="text-xs text-text-muted mt-1">Run a pipeline request to generate trace data.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Traces">
      {traces.map((trace, i) => (
        <TraceRow key={trace.traceId ?? i} trace={trace} onSelect={onSelect} />
      ))}
    </ul>
  );
}
