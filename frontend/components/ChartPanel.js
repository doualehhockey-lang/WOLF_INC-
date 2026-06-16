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
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
          {p.name}: {p.value}
          {unit}
        </p>
      ))}
    </div>
  );
}

// ── Stat variant ─────────────────────────────────────────────────────────────

function StatPanel({ value, unit = '', delta, deltaLabel, suffix, loading, error }) {
  if (loading) return <SkeletonStat />;
  if (error) return <ErrorState message={error.message} />;

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
      {delta !== undefined && <DeltaBadge sign={deltaSign} delta={delta} label={deltaLabel} />}
    </div>
  );
}

function DeltaBadge({ sign, delta, label }) {
  const Icon = sign === 'up' ? TrendingUp : sign === 'down' ? TrendingDown : Minus;
  const color =
    sign === 'up'
      ? 'text-emerald-500 dark:text-emerald-400'
      : sign === 'down'
        ? 'text-red-500 dark:text-red-400'
        : 'text-text-muted';

  return (
    <p className={clsx('flex items-center gap-1 text-xs font-medium', color)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {Math.abs(delta)}
      {label ?? ''}
    </p>
  );
}

// ── Line chart variant ────────────────────────────────────────────────────────

function LinePanel({ data, dataKey, color = '#4070f4', unit = '', refValue, loading, error }) {
  if (loading) return <SkeletonChart />;
  if (error) return <ErrorState message={error.message} />;

  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
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
  if (error) return <ErrorState message={error.message} />;

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
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
  return <p className="text-xs text-red-500 dark:text-red-400 py-2">Failed to load: {message}</p>;
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
  error = null,
  ...rest
}) {
  return (
    <article className={clsx('card flex flex-col gap-3', className)} aria-label={title}>
      {/* Header */}
      <div>
        <p className="text-sm font-medium text-text-base">{title}</p>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
      </div>

      {/* Body */}
      {variant === 'stat' && <StatPanel loading={loading} error={error} {...rest} />}
      {variant === 'line' && <LinePanel loading={loading} error={error} {...rest} />}
      {variant === 'bar' && <BarPanel loading={loading} error={error} {...rest} />}
    </article>
  );
}
