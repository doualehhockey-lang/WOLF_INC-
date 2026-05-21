// frontend/pages/dashboard.js — Pipeline overview dashboard.
//
// Shows real-time KPIs for the Wolf Engine voice pipeline:
//   - Active sessions, pipeline success rate, P95 latency, error rate
//   - Stage-level latency trend (Whisper / Claude / TTS)
//   - Recent intent distribution

import useSWR               from 'swr';
import Layout               from '../components/Layout.js';
import ChartPanel           from '../components/ChartPanel.js';
import { apiFetcher }       from '../lib/api.js';

// ── Data hooks ────────────────────────────────────────────────────────────────

/** Refresh every 5 s. */
const SWR_OPTS = { refreshInterval: 5_000 };

/** Build mock/demo trend data from a single metric value. */
function sparkline(key, metrics, windowSize = 10) {
  // In production this would be a Prometheus range query; here we derive
  // a synthetic history array from the single scalar for demo purposes.
  const base = metrics?.[key] ?? 0;
  return Array.from({ length: windowSize }, (_, i) => ({
    ts: `-${windowSize - i}m`,
    value: Math.max(0, base * (0.8 + Math.random() * 0.4)),
  }));
}

// ── KPI row ───────────────────────────────────────────────────────────────────

function KpiGrid({ metrics, loading, error }) {
  const sessions    = metrics?.wolf_active_sessions ?? 0;
  const total       = metrics?.wolf_pipeline_duration_ms_count ?? 0;
  const successPct  = total > 0
    ? Math.round(((metrics?.wolf_pipeline_success_total ?? 0) / total) * 100)
    : null;
  const p95         = metrics?.wolf_pipeline_duration_ms_p95 ?? null;
  const errors      = metrics?.wolf_errors_total ?? 0;

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      <ChartPanel
        title="Active Sessions"
        subtitle="Ongoing Twilio calls"
        value={sessions}
        loading={loading}
        error={error}
      />
      <ChartPanel
        title="Pipeline Success"
        subtitle="Last measurement"
        value={successPct !== null ? `${successPct}%` : '—'}
        loading={loading}
        error={error}
      />
      <ChartPanel
        title="P95 Latency"
        subtitle="End-to-end (ms)"
        value={p95 !== null ? Math.round(p95) : '—'}
        unit={p95 !== null ? 'ms' : ''}
        loading={loading}
        error={error}
      />
      <ChartPanel
        title="Errors"
        subtitle="Total errors"
        value={errors}
        loading={loading}
        error={error}
      />
    </div>
  );
}

// ── Stage latency charts ──────────────────────────────────────────────────────

function StageCharts({ metrics, loading, error }) {
  const stages = [
    { key: 'wolf_nlu_duration_ms',      label: 'NLU Latency (Claude/Ollama)', color: '#4070f4' },
    { key: 'wolf_tts_duration_ms',      label: 'TTS Latency',                  color: '#10b981' },
    { key: 'wolf_agent_duration_ms',    label: 'Agent Latency',                color: '#f59e0b' },
  ];

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {stages.map(({ key, label, color }) => (
        <ChartPanel
          key={key}
          variant="line"
          title={label}
          subtitle="P50 · trend"
          data={sparkline(key + '_sum', metrics)}
          dataKey="value"
          color={color}
          unit="ms"
          loading={loading}
          error={error}
        />
      ))}
    </div>
  );
}

// ── Intent distribution ───────────────────────────────────────────────────────

function IntentChart({ metrics, loading, error }) {
  // In production, query /api/wolf/metrics?query=wolf_intents_total
  const intents = metrics?.wolf_intents_total ?? 0;

  return (
    <ChartPanel
      title="Total Intents Processed"
      subtitle="Cumulative since last restart"
      value={intents}
      loading={loading}
      error={error}
    />
  );
}

// ── Rate-limit + circuit breaker ──────────────────────────────────────────────

function HealthCards({ metrics, loading, error }) {
  const rl = metrics?.wolf_rate_limit_total ?? 0;
  const cb = metrics?.wolf_circuit_breaker_state ?? 0;

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <ChartPanel
        title="Rate-Limited Requests"
        subtitle="Total blocked (all callers)"
        value={rl}
        loading={loading}
        error={error}
      />
      <ChartPanel
        title="Circuit Breaker"
        subtitle="0 = closed (healthy), 1 = open (failing)"
        value={cb === 0 ? 'Closed' : 'OPEN'}
        suffix={cb === 0 ? 'All services healthy' : 'One or more services failing'}
        loading={loading}
        error={error}
      />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: metrics, error, isLoading } = useSWR('/metrics', apiFetcher, SWR_OPTS);

  return (
    <Layout title="Dashboard" description="Real-time Wolf Engine pipeline metrics">
      <div className="space-y-6">
        <KpiGrid     metrics={metrics} loading={isLoading} error={error} />
        <StageCharts metrics={metrics} loading={isLoading} error={error} />
        <div className="grid lg:grid-cols-2 gap-4">
          <HealthCards  metrics={metrics} loading={isLoading} error={error} />
          <IntentChart  metrics={metrics} loading={isLoading} error={error} />
        </div>
      </div>
    </Layout>
  );
}
