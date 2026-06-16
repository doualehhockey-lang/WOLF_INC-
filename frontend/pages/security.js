// frontend/pages/security.js — Auth events + rate-limit dashboard.
//
// Fetches recent security events from the backend and displays them
// via SecurityManager.  Also shows Prometheus-derived security KPIs.

import useSWR              from 'swr';
import { ShieldCheck }     from 'lucide-react';
import Layout              from '../components/Layout.js';
import SecurityManager     from '../components/SecurityManager.js';
import ChartPanel          from '../components/ChartPanel.js';
import { apiFetcher }      from '../lib/api.js';

const SWR_OPTS = { refreshInterval: 8_000 };

// ── KPI row ───────────────────────────────────────────────────────────────────

function SecurityKpis({ metrics, loading, error }) {
  const authFails = metrics?.wolf_errors_total_auth ?? 0;
  const rlTotal   = metrics?.wolf_rate_limit_total   ?? 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <ChartPanel
        title="Auth Failures"
        subtitle="JWT + API key combined"
        value={authFails}
        loading={loading}
        error={error}
      />
      <ChartPanel
        title="Rate-Limited"
        subtitle="Requests blocked this session"
        value={rlTotal}
        loading={loading}
        error={error}
      />
      <ChartPanel
        title="Status"
        subtitle="Security module health"
        value={!error ? 'Active' : 'Degraded'}
        loading={loading}
        error={null} /* show value even when events failed */
      />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const {
    data: events,
    error: eventsError,
    isLoading: eventsLoading,
  } = useSWR('/security/events', apiFetcher, SWR_OPTS);

  const {
    data: metrics,
    error: metricsError,
    isLoading: metricsLoading,
  } = useSWR('/metrics', apiFetcher, SWR_OPTS);

  return (
    <Layout
      title="Security"
      description="Auth events, rate-limit hits, and RBAC activity"
    >
      <div className="space-y-6">
        {/* Header callout */}
        <div className="card flex items-center gap-3 border-wolf-200 dark:border-wolf-800 bg-wolf-50 dark:bg-wolf-950/40">
          <ShieldCheck className="h-5 w-5 text-wolf-500 shrink-0" aria-hidden="true" />
          <p className="text-sm text-text-base">
            Security events refresh every 8 s.  Rate-limit counters are cumulative since
            last backend restart.
          </p>
        </div>

        <SecurityKpis
          metrics={metrics}
          loading={metricsLoading}
          error={metricsError}
        />

        <SecurityManager
          events={events ?? []}
          loading={eventsLoading}
          error={eventsError}
        />
      </div>
    </Layout>
  );
}
