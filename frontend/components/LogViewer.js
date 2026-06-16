// frontend/components/LogViewer.js — Live log stream with filter.
//
// Streams structured (Pino JSON) or plain-text logs from the Wolf Engine backend
// via a Server-Sent Events / fetch ReadableStream endpoint.
//
// Features:
//   - Level filter (trace/debug/info/warn/error/fatal)
//   - Full-text search
//   - Colour-coded level badges
//   - Auto-scroll to bottom (pauseable on mouse-over)
//   - Max 1000 lines kept in memory to avoid DOM explosion
//   - Copy-to-clipboard button
//
// Props:
//   component — backend component to tail ('agent'|'whisper'|'claude'|'tts'|'ollama')
//   streamFn  — (component, signal) => Promise<Response>  (injected for testability)

<<<<<<< HEAD
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Download, Pause, Play, Trash2, ChevronDown, AlertCircle } from 'lucide-react';
=======
import {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  Search, Download, Pause, Play, Trash2,
  ChevronDown, AlertCircle,
} from 'lucide-react';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
import clsx from 'clsx';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_LINES = 1_000;

const LEVELS = ['all', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'];

const LEVEL_NUM = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };

const LEVEL_STYLE = {
  trace: 'text-slate-400',
  debug: 'text-sky-400',
<<<<<<< HEAD
  info: 'text-emerald-400',
  warn: 'text-amber-400',
=======
  info:  'text-emerald-400',
  warn:  'text-amber-400',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  error: 'text-red-400',
  fatal: 'text-red-600 font-bold',
};

// ── Log line parser ───────────────────────────────────────────────────────────

/**
 * Parse a raw log line (Pino JSON or plain text).
 * @param {string} raw
 * @returns {{ level: string, time: string, msg: string, raw: string }}
 */
function parseLine(raw) {
  try {
<<<<<<< HEAD
    const obj = JSON.parse(raw);
=======
    const obj   = JSON.parse(raw);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    const level = Object.entries(LEVEL_NUM).find(([, n]) => n === obj.level)?.[0] ?? 'info';
    return {
      level,
      time: obj.time ? new Date(obj.time).toLocaleTimeString('fr-FR', { hour12: false }) : '',
<<<<<<< HEAD
      msg: obj.msg ?? obj.message ?? raw,
=======
      msg:  obj.msg ?? obj.message ?? raw,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      raw,
    };
  } catch {
    return { level: 'info', time: '', msg: raw, raw };
  }
}

// ── Individual log line ───────────────────────────────────────────────────────

function LogLine({ line }) {
  const colorClass = LEVEL_STYLE[line.level] ?? 'text-text-base';

  return (
    <li className="flex gap-2 px-3 py-0.5 hover:bg-surface group font-mono text-xs">
<<<<<<< HEAD
      {line.time && <span className="shrink-0 text-text-muted w-20">{line.time}</span>}
      <span className={clsx('shrink-0 w-10 uppercase', colorClass)}>{line.level}</span>
=======
      {line.time && (
        <span className="shrink-0 text-text-muted w-20">{line.time}</span>
      )}
      <span className={clsx('shrink-0 w-10 uppercase', colorClass)}>
        {line.level}
      </span>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      <span className="flex-1 break-all text-text-base">{line.msg}</span>
    </li>
  );
}

// ── Controls bar ──────────────────────────────────────────────────────────────

function Controls({
<<<<<<< HEAD
  component,
  setComponent,
  level,
  setLevel,
  search,
  setSearch,
  paused,
  onTogglePause,
  onClear,
  onDownload,
=======
  component, setComponent,
  level, setLevel,
  search, setSearch,
  paused, onTogglePause,
  onClear, onDownload,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  lineCount,
}) {
  const COMPONENTS = ['agent', 'whisper', 'claude', 'tts', 'ollama'];

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border bg-surface-2">
      {/* Component selector */}
      <select
        value={component}
        onChange={e => setComponent(e.target.value)}
        className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs
                   text-text-base focus:outline-none focus:ring-2 focus:ring-wolf-400"
        aria-label="Select component"
      >
        {COMPONENTS.map(c => (
<<<<<<< HEAD
          <option key={c} value={c}>
            {c}
          </option>
=======
          <option key={c} value={c}>{c}</option>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
        ))}
      </select>

      {/* Level filter */}
      <select
        value={level}
        onChange={e => setLevel(e.target.value)}
        className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs
                   text-text-base focus:outline-none focus:ring-2 focus:ring-wolf-400"
        aria-label="Minimum log level"
      >
<<<<<<< HEAD
        {LEVELS.map(l => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
=======
        {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      </select>

      {/* Search */}
      <div className="relative flex-1 min-w-[140px]">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-text-muted pointer-events-none" />
        <input
          type="search"
          placeholder="Filter…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface pl-6 pr-2 py-1.5 text-xs
                     font-mono text-text-base placeholder:text-text-muted
                     focus:outline-none focus:ring-2 focus:ring-wolf-400"
          aria-label="Filter log lines"
        />
      </div>

<<<<<<< HEAD
      <span className="text-xs text-text-muted tabular-nums ml-auto">{lineCount} lines</span>
=======
      <span className="text-xs text-text-muted tabular-nums ml-auto">
        {lineCount} lines
      </span>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

      {/* Action buttons */}
      <button
        onClick={onTogglePause}
        className="btn-ghost py-1 px-2"
        aria-label={paused ? 'Resume streaming' : 'Pause streaming'}
        title={paused ? 'Resume' : 'Pause'}
      >
<<<<<<< HEAD
        {paused ? (
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Pause className="h-3.5 w-3.5" aria-hidden="true" />
        )}
=======
        {paused
          ? <Play  className="h-3.5 w-3.5" aria-hidden="true" />
          : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      </button>

      <button
        onClick={onDownload}
        className="btn-ghost py-1 px-2"
        aria-label="Download logs"
        title="Download"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <button
        onClick={onClear}
        className="btn-ghost py-1 px-2"
        aria-label="Clear logs"
        title="Clear"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {{
 *   component?: string,
 *   streamFn?:  (component: string, signal: AbortSignal) => Promise<Response>,
 * }} props
 */
export default function LogViewer({ component: initialComponent = 'agent', streamFn }) {
  const [component, setComponent] = useState(initialComponent);
<<<<<<< HEAD
  const [lines, setLines] = useState(/** @type {object[]} */ ([]));
  const [level, setLevel] = useState('all');
  const [search, setSearch] = useState('');
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const listRef = useRef(null);
  const pausedRef = useRef(paused);
=======
  const [lines,     setLines]     = useState(/** @type {object[]} */ ([]));
  const [level,     setLevel]     = useState('all');
  const [search,    setSearch]    = useState('');
  const [paused,    setPaused]    = useState(false);
  const [error,     setError]     = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const listRef    = useRef(null);
  const pausedRef  = useRef(paused);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  pausedRef.current = paused;

  // ── Streaming ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!streamFn) return; // no-op in static/SSR context

    const controller = new AbortController();
    setError(null);

    (async () => {
      try {
        const res = await streamFn(component, controller.signal);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n');
          buffer = parts.pop() ?? '';

          if (pausedRef.current) continue;

<<<<<<< HEAD
          const parsed = parts.filter(p => p.trim()).map(parseLine);
=======
          const parsed = parts
            .filter(p => p.trim())
            .map(parseLine);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

          if (parsed.length) {
            setLines(prev => {
              const next = [...prev, ...parsed];
              return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
            });
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') setError(err);
      }
    })();

    return () => controller.abort();
  }, [component, streamFn]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  // ── Filtered view ───────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = lines;
    if (level !== 'all') {
      const minNum = LEVEL_NUM[level] ?? 0;
      list = list.filter(l => (LEVEL_NUM[l.level] ?? 0) >= minNum);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l => l.msg.toLowerCase().includes(q));
    }
    return list;
  }, [lines, level, search]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleTogglePause = useCallback(() => setPaused(p => !p), []);
<<<<<<< HEAD
  const handleClear = useCallback(() => setLines([]), []);

  const handleDownload = useCallback(() => {
    const blob = new Blob([lines.map(l => l.raw).join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
=======
  const handleClear       = useCallback(() => setLines([]), []);

  const handleDownload = useCallback(() => {
    const blob = new Blob([lines.map(l => l.raw).join('\n')], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    a.download = `wolf-${component}-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [lines, component]);

  // Pause auto-scroll when user scrolls up.
  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  }, []);

  return (
    <div className="card p-0 flex flex-col overflow-hidden h-[600px]" aria-label="Log viewer">
      <Controls
<<<<<<< HEAD
        component={component}
        setComponent={c => {
          setComponent(c);
          setLines([]);
        }}
        level={level}
        setLevel={setLevel}
        search={search}
        setSearch={setSearch}
        paused={paused}
        onTogglePause={handleTogglePause}
        onClear={handleClear}
        onDownload={handleDownload}
=======
        component={component}   setComponent={c => { setComponent(c); setLines([]); }}
        level={level}           setLevel={setLevel}
        search={search}         setSearch={setSearch}
        paused={paused}         onTogglePause={handleTogglePause}
        onClear={handleClear}   onDownload={handleDownload}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
        lineCount={filtered.length}
      />

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 text-xs border-b border-border">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Stream error: {error.message}
        </div>
      )}

      {paused && (
<<<<<<< HEAD
        <div
          className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400
                        text-xs border-b border-border flex items-center gap-2"
        >
=======
        <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400
                        text-xs border-b border-border flex items-center gap-2">
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
          <Pause className="h-3 w-3" aria-hidden="true" />
          Streaming paused — new logs are buffered server-side.
        </div>
      )}

      {/* Log list */}
      <ul
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-1 bg-slate-950 dark:bg-slate-950"
        aria-label="Log lines"
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions"
      >
        {filtered.length === 0 && (
          <li className="px-4 py-8 text-center text-xs text-slate-500">
<<<<<<< HEAD
            {lines.length === 0 ? 'Waiting for log events…' : 'No lines match the current filter.'}
=======
            {lines.length === 0
              ? 'Waiting for log events…'
              : 'No lines match the current filter.'}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
          </li>
        )}
        {filtered.map((line, i) => (
          <LogLine key={i} line={line} />
        ))}
      </ul>

      {/* Scroll-to-bottom indicator */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
          }}
          className="absolute bottom-4 right-6 btn-ghost py-1 px-3 shadow-lg text-xs"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="h-4 w-4" /> Latest
        </button>
      )}
    </div>
  );
}
