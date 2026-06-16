// frontend/components/SecurityManager.js — Auth events table + rate-limit dashboard.
//
// Displays:
//   - Recent auth events (JWT success/failure, API key usage, RBAC denials)
//   - Rate-limit hit/block counters per caller
//   - Filter bar (method, status, search)
//
// Props:
//   events   — array of SecurityEvent objects
//   loading  — boolean
//   error    — Error|null

import { useState, useMemo } from 'react';
import { Search, ShieldCheck, ShieldX, ShieldAlert, Clock } from 'lucide-react';
import clsx from 'clsx';

// ── Event type icons + badge classes ─────────────────────────────────────────

const EVENT_META = {
<<<<<<< HEAD
  jwt_ok: { label: 'JWT OK', badge: 'badge-green', Icon: ShieldCheck },
  jwt_expired: { label: 'JWT Expired', badge: 'badge-yellow', Icon: ShieldAlert },
  jwt_invalid: { label: 'JWT Invalid', badge: 'badge-red', Icon: ShieldX },
  apikey_ok: { label: 'API Key OK', badge: 'badge-blue', Icon: ShieldCheck },
  apikey_bad: { label: 'API Key Bad', badge: 'badge-red', Icon: ShieldX },
  rbac_deny: { label: 'RBAC Deny', badge: 'badge-red', Icon: ShieldX },
  rate_limited: { label: 'Rate Limited', badge: 'badge-yellow', Icon: Clock },
=======
  jwt_ok:       { label: 'JWT OK',       badge: 'badge-green', Icon: ShieldCheck },
  jwt_expired:  { label: 'JWT Expired',  badge: 'badge-yellow', Icon: ShieldAlert },
  jwt_invalid:  { label: 'JWT Invalid',  badge: 'badge-red',   Icon: ShieldX    },
  apikey_ok:    { label: 'API Key OK',   badge: 'badge-blue',  Icon: ShieldCheck },
  apikey_bad:   { label: 'API Key Bad',  badge: 'badge-red',   Icon: ShieldX    },
  rbac_deny:    { label: 'RBAC Deny',    badge: 'badge-red',   Icon: ShieldX    },
  rate_limited: { label: 'Rate Limited', badge: 'badge-yellow', Icon: Clock      },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
};

const ALL_TYPES = Object.keys(EVENT_META);

// ── Filter bar ────────────────────────────────────────────────────────────────

function FilterBar({ search, setSearch, selectedTypes, setSelectedTypes }) {
  const toggleType = type =>
    setSelectedTypes(prev =>
<<<<<<< HEAD
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
=======
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type],
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Text search */}
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted pointer-events-none" />
        <input
          type="search"
          placeholder="Search sub, IP, resource…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface pl-8 pr-3 py-1.5
                     text-sm text-text-base placeholder:text-text-muted
                     focus:outline-none focus:ring-2 focus:ring-wolf-400"
          aria-label="Search events"
        />
      </div>

      {/* Type filters */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by event type">
        {ALL_TYPES.map(type => {
          const { label, badge } = EVENT_META[type];
          const active = selectedTypes.length === 0 || selectedTypes.includes(type);
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={clsx(
                badge,
                'cursor-pointer select-none transition-opacity',
<<<<<<< HEAD
                !active && 'opacity-40'
=======
                !active && 'opacity-40',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
              )}
              aria-pressed={active}
              aria-label={`Filter: ${label}`}
            >
              {label}
            </button>
          );
        })}

        {selectedTypes.length > 0 && (
          <button
            onClick={() => setSelectedTypes([])}
            className="badge badge-gray cursor-pointer"
            aria-label="Clear filters"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// ── Event table ───────────────────────────────────────────────────────────────

function EventTable({ events }) {
  if (!events.length) {
    return (
      <p className="text-center text-sm text-text-muted py-8">
        No events match the current filter.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" aria-label="Security events">
        <thead className="bg-surface border-b border-border">
          <tr>
            {['Time', 'Type', 'Subject', 'Resource', 'IP', 'Details'].map(h => (
              <th
                key={h}
                className="px-4 py-2 text-left text-xs font-medium text-text-muted"
                scope="col"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {events.map((ev, i) => {
<<<<<<< HEAD
            const meta = EVENT_META[ev.type] ?? {
              label: ev.type,
              badge: 'badge-gray',
              Icon: ShieldAlert,
            };
=======
            const meta = EVENT_META[ev.type] ?? { label: ev.type, badge: 'badge-gray', Icon: ShieldAlert };
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
            return (
              <tr key={ev.id ?? i} className="hover:bg-surface transition-colors">
                <td className="px-4 py-2 text-xs font-mono text-text-muted whitespace-nowrap">
                  {formatTime(ev.ts)}
                </td>
                <td className="px-4 py-2">
                  <span className={meta.badge}>{meta.label}</span>
                </td>
                <td className="px-4 py-2 font-mono text-xs truncate max-w-[120px]">
                  {ev.sub ?? '—'}
                </td>
<<<<<<< HEAD
                <td className="px-4 py-2 text-xs text-text-muted">{ev.resource ?? '—'}</td>
                <td className="px-4 py-2 font-mono text-xs text-text-muted">{ev.ip ?? '—'}</td>
=======
                <td className="px-4 py-2 text-xs text-text-muted">
                  {ev.resource ?? '—'}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-text-muted">
                  {ev.ip ?? '—'}
                </td>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
                <td className="px-4 py-2 text-xs text-text-muted truncate max-w-[200px]">
                  {ev.detail ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Rate-limit summary ────────────────────────────────────────────────────────

function RateLimitSummary({ events }) {
  const stats = useMemo(() => {
    const map = {};
    for (const ev of events) {
      if (ev.type !== 'rate_limited') continue;
      const key = ev.sub ?? ev.ip ?? 'unknown';
      map[key] = (map[key] ?? 0) + 1;
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }, [events]);

  if (!stats.length) return null;

  return (
    <section aria-label="Rate-limit hot spots" className="card">
      <h3 className="text-sm font-medium mb-3">Rate-Limit Hot Spots (top 5)</h3>
      <ul className="space-y-2">
        {stats.map(([subject, count]) => (
          <li key={subject} className="flex items-center gap-3">
            <span className="flex-1 font-mono text-xs truncate">{subject}</span>
            <div className="w-32 bg-surface rounded-full h-2 overflow-hidden">
              <div
                className="h-2 rounded-full bg-amber-500"
                style={{ width: `${Math.min((count / (stats[0]?.[1] ?? 1)) * 100, 100)}%` }}
              />
            </div>
            <span className="badge-yellow tabular-nums">{count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleTimeString('fr-FR', { hour12: false });
  } catch {
    return String(ts);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {{
 *   events:  object[],
 *   loading: boolean,
 *   error:   Error|null,
 * }} props
 */
export default function SecurityManager({ events = [], loading, error }) {
<<<<<<< HEAD
  const [search, setSearch] = useState('');
=======
  const [search,        setSearch]        = useState('');
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  const [selectedTypes, setSelectedTypes] = useState([]);

  const filtered = useMemo(() => {
    let list = events;
    if (selectedTypes.length) list = list.filter(e => selectedTypes.includes(e.type));
    if (search.trim()) {
      const q = search.toLowerCase();
<<<<<<< HEAD
      list = list.filter(
        e =>
          (e.sub ?? '').toLowerCase().includes(q) ||
          (e.ip ?? '').toLowerCase().includes(q) ||
          (e.resource ?? '').toLowerCase().includes(q) ||
          (e.detail ?? '').toLowerCase().includes(q)
=======
      list = list.filter(e =>
        (e.sub      ?? '').toLowerCase().includes(q) ||
        (e.ip       ?? '').toLowerCase().includes(q) ||
        (e.resource ?? '').toLowerCase().includes(q) ||
        (e.detail   ?? '').toLowerCase().includes(q),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      );
    }
    return list;
  }, [events, search, selectedTypes]);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading security events">
        <div className="card animate-pulse h-10" />
        <div className="card animate-pulse h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card flex gap-3 items-center text-red-500">
        <ShieldX className="h-5 w-5 shrink-0" />
        <p className="text-sm">Failed to load security events: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FilterBar
        search={search}
        setSearch={setSearch}
        selectedTypes={selectedTypes}
        setSelectedTypes={setSelectedTypes}
      />

      <RateLimitSummary events={events} />

      <section aria-label="Event log">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">
            Events
            <span className="ml-2 badge-gray">{filtered.length}</span>
          </h3>
        </div>
        <EventTable events={filtered} />
      </section>
    </div>
  );
}
