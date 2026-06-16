// frontend/components/ChartPanel.js — Reusable metric card + chart wrapper.
//
// Three variants:
//   stat   — single KPI number (default)
//   line   — Recharts ResponsiveContainer + LineChart
//   bar    — Recharts ResponsiveContainer + BarChart
//
// Each variant accepts a `data` prop and renders with Wolf-branded colours
// in both light and dark mode.
//
// Usage:
//   <ChartPanel variant="stat" title="Active Sessions" value={12} delta={+3} />
//   <ChartPanel variant="line" title="Pipeline Latency (ms)" data={points}
//               dataKey="p95" color="#4070f4" />

import {
  ResponsiveContainer,
<<<<<<< HEAD
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
=======
  LineChart, Line,
  BarChart,  Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import clsx from 'clsx';

// ── Custom tooltip (shared by line + bar) ────────────────────────────────────

function WolfTooltip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card text-xs py-2 px-3 shadow-lg">
      <p className="text-text-muted mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-mono">
<<<<<<< HEAD
          {p.name}: {p.value}
          {unit}
=======
          {p.name}: {p.value}{unit}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
        </p>
      ))}
    </div>
  );
}

// ── Stat variant ─────────────────────────────────────────────────────────────

function StatPanel({ value, unit = '', delta, deltaLabel, suffix, loading, error }) {
  if (loading) return <SkeletonStat />;
<<<<<<< HEAD
  if (error) return <ErrorState message={error.message} />;
=======
  if (error)   return <ErrorState message={error.message} />;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  const deltaSign = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';

  return (
    <div className="flex flex-col gap-1">
      <p className="text-3xl font-bold font-mono text-text-base tabular-nums">
        {value !== undefined ? String(value) : '—'}
        {value !== undefined && unit && (
          <span className="text-lg text-text-muted ml-1">{unit}</span>
        )}
      </p>
      {suffix && <p className="text-xs text-text-muted">{suffix}</p>}
<<<<<<< HEAD
      {delta !== undefined && <DeltaBadge sign={deltaSign} delta={delta} label={deltaLabel} />}
=======
      {delta !== undefined && (
        <DeltaBadge sign={deltaSign} delta={delta} label={deltaLabel} />
      )}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    </div>
  );
}

function DeltaBadge({ sign, delta, label }) {
<<<<<<< HEAD
  const Icon = sign === 'up' ? TrendingUp : sign === 'down' ? TrendingDown : Minus;
  const color =
    sign === 'up'
      ? 'text-emerald-500 dark:text-emerald-400'
      : sign === 'down'
        ? 'text-red-500 dark:text-red-400'
        : 'text-text-muted';
=======
  const Icon  = sign === 'up' ? TrendingUp : sign === 'down' ? TrendingDown : Minus;
  const color = sign === 'up'
    ? 'text-emerald-500 dark:text-emerald-400'
    : sign === 'down'
    ? 'text-red-500 dark:text-red-400'
    : 'text-text-muted';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  return (
    <p className={clsx('flex items-center gap-1 text-xs font-medium', color)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
<<<<<<< HEAD
      {Math.abs(delta)}
      {label ?? ''}
=======
      {Math.abs(delta)}{label ?? ''}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    </p>
  );
}

// ── Line chart variant ────────────────────────────────────────────────────────

function LinePanel({ data, dataKey, color = '#4070f4', unit = '', refValue, loading, error }) {
  if (loading) return <SkeletonChart />;
<<<<<<< HEAD
  if (error) return <ErrorState message={error.message} />;
=======
  if (error)   return <ErrorState message={error.message} />;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
<<<<<<< HEAD
        <XAxis
          dataKey="ts"
          tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
          tickLine={false}
          axisLine={false}
        />
=======
        <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickLine={false} axisLine={false} />
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
        <Tooltip content={<WolfTooltip unit={unit} />} />
        {refValue !== undefined && (
          <ReferenceLine y={refValue} stroke="var(--color-text-muted)" strokeDasharray="4 4" />
        )}
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Bar chart variant ─────────────────────────────────────────────────────────

function BarPanel({ data, dataKey, color = '#4070f4', unit = '', loading, error }) {
  if (loading) return <SkeletonChart />;
<<<<<<< HEAD
  if (error) return <ErrorState message={error.message} />;
=======
  if (error)   return <ErrorState message={error.message} />;
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
<<<<<<< HEAD
        <XAxis
          dataKey="ts"
          tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
          tickLine={false}
          axisLine={false}
        />
=======
        <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickLine={false} axisLine={false} />
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
        <Tooltip content={<WolfTooltip unit={unit} />} />
        <Bar dataKey={dataKey} fill={color} radius={[3, 3, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Skeletons / error states ──────────────────────────────────────────────────

function SkeletonStat() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-8 w-24 rounded bg-border" />
      <div className="h-3 w-16 rounded bg-border" />
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="animate-pulse flex items-end gap-1 h-[140px]">
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-border"
          style={{ height: `${30 + Math.random() * 70}%` }}
        />
      ))}
    </div>
  );
}

function ErrorState({ message }) {
<<<<<<< HEAD
  return <p className="text-xs text-red-500 dark:text-red-400 py-2">Failed to load: {message}</p>;
=======
  return (
    <p className="text-xs text-red-500 dark:text-red-400 py-2">
      Failed to load: {message}
    </p>
  );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {{
 *   title:        string,
 *   subtitle?:    string,
 *   variant?:     'stat'|'line'|'bar',
 *   className?:   string,
 *   // stat
 *   value?:       number|string,
 *   unit?:        string,
 *   delta?:       number,
 *   deltaLabel?:  string,
 *   suffix?:      string,
 *   // line/bar
 *   data?:        object[],
 *   dataKey?:     string,
 *   color?:       string,
 *   refValue?:    number,
 *   // async
 *   loading?:     boolean,
 *   error?:       Error|null,
 * }} props
 */
export default function ChartPanel({
  title,
  subtitle,
  variant = 'stat',
  className,
  loading = false,
<<<<<<< HEAD
  error = null,
  ...rest
}) {
  return (
    <article className={clsx('card flex flex-col gap-3', className)} aria-label={title}>
=======
  error   = null,
  ...rest
}) {
  return (
    <article
      className={clsx('card flex flex-col gap-3', className)}
      aria-label={title}
    >
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      {/* Header */}
      <div>
        <p className="text-sm font-medium text-text-base">{title}</p>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
      </div>

      {/* Body */}
<<<<<<< HEAD
      {variant === 'stat' && <StatPanel loading={loading} error={error} {...rest} />}
      {variant === 'line' && <LinePanel loading={loading} error={error} {...rest} />}
      {variant === 'bar' && <BarPanel loading={loading} error={error} {...rest} />}
=======
      {variant === 'stat' && (
        <StatPanel loading={loading} error={error} {...rest} />
      )}
      {variant === 'line' && (
        <LinePanel loading={loading} error={error} {...rest} />
      )}
      {variant === 'bar' && (
        <BarPanel  loading={loading} error={error} {...rest} />
      )}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    </article>
  );
}
