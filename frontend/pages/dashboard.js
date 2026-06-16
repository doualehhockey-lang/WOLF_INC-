<<<<<<< HEAD
// frontend/pages/dashboard.js — Rendez-vous du jour.
// Vue principale pour le gérant : liste des RDV, statut, actions simples.

import { useState } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import Layout from '../components/Layout.js';
import { apiFetcher } from '../lib/api.js';

const SWR_OPTS = { refreshInterval: 30_000 };

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function Badge({ status }) {
  const map = {
    confirmed: { label: 'Confirmé', bg: 'bg-green-100 text-green-800' },
    pending: { label: 'En attente', bg: 'bg-yellow-100 text-yellow-800' },
    cancelled: { label: 'Annulé', bg: 'bg-red-100 text-red-800' },
  };
  const { label, bg } = map[status] ?? { label: status, bg: 'bg-gray-100 text-gray-800' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${bg}`}>
      {label}
    </span>
  );
}

function ReminderBadges({ reminder24h, reminder2h }) {
  return (
    <div className="flex gap-1">
      {reminder24h ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
          24h &#10003;
        </span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-400">
          24h
        </span>
      )}
      {reminder2h ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
          2h &#10003;
        </span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-400">
          2h
        </span>
      )}
=======
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
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    </div>
  );
}

<<<<<<< HEAD
function RdvTable({ events, loading, error }) {
  if (loading) return <p className="text-gray-500 py-8 text-center">Chargement…</p>;
  if (error)
    return <p className="text-red-500 py-8 text-center">Erreur de chargement des rendez-vous.</p>;
  if (!events?.length) {
    return (
      <div className="py-16 text-center">
        <p className="text-4xl mb-3">📅</p>
        <p className="text-gray-500">Aucun rendez-vous aujourd&apos;hui.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Heure</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Client</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Prestation</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Téléphone</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Rappels</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {events.map(ev => (
            <tr key={ev.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-mono font-semibold text-gray-900">
                {formatTime(ev.start_time || ev.date)}
              </td>
              <td className="px-4 py-3 text-gray-900">{ev.subject || ev.title || '—'}</td>
              <td className="px-4 py-3 text-gray-600">{ev.description || '—'}</td>
              <td className="px-4 py-3 text-gray-600">{ev.phone_number || '—'}</td>
              <td className="px-4 py-3">
                <Badge status={ev.status || 'confirmed'} />
              </td>
              <td className="px-4 py-3">
                <ReminderBadges
                  reminder24h={ev.reminder_24h_sent}
                  reminder2h={ev.reminder_2h_sent}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KpiBar({ events }) {
  const total = events?.length ?? 0;
  const confirmed = events?.filter(e => (e.status || 'confirmed') === 'confirmed').length ?? 0;
  const cancelled = events?.filter(e => e.status === 'cancelled').length ?? 0;

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {[
        { label: "RDV aujourd'hui", value: total, color: 'text-blue-600' },
        { label: 'Confirmés', value: confirmed, color: 'text-green-600' },
        { label: 'Annulés', value: cancelled, color: 'text-red-500' },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-white rounded-lg shadow-sm border p-4 text-center">
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
          <p className="text-sm text-gray-500 mt-1">{label}</p>
        </div>
=======
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
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      ))}
    </div>
  );
}

<<<<<<< HEAD
function SubscriptionBanner({ onDismiss }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800"
    >
      <span>Bienvenue ! Votre abonnement est actif.</span>
      <button
        onClick={onDismiss}
        aria-label="Fermer"
        className="ml-4 text-green-600 hover:text-green-800 font-bold text-base leading-none"
      >
        &times;
      </button>
=======
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
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    </div>
  );
}

<<<<<<< HEAD
export default function DashboardPage() {
  const today = todayIso();
  const router = useRouter();
  const [showBanner, setShowBanner] = useState(router.query.subscribed === 'true');

  const { data, error, isLoading } = useSWR(`/api/events?date=${today}`, apiFetcher, SWR_OPTS);

  const events = data?.events ?? data ?? [];

  return (
    <Layout title="Rendez-vous du jour">
      <div className="space-y-4">
        {showBanner && <SubscriptionBanner onDismiss={() => setShowBanner(false)} />}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Rendez-vous du jour</h1>
            <p className="text-sm text-gray-500 capitalize">
              {formatDate(new Date().toISOString())}
            </p>
          </div>
        </div>
        <KpiBar events={events} />
        <div className="bg-white rounded-lg shadow-sm border">
          <RdvTable events={events} loading={isLoading} error={error} />
=======
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
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
        </div>
      </div>
    </Layout>
  );
}
