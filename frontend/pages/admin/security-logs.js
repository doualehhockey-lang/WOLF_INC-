// frontend/pages/admin/security-logs.js — Admin security log explorer.

import { useState, useCallback } from 'react';
<<<<<<< HEAD
import useSWR from 'swr';
import AdminLayout from '../../components/admin/AdminLayout.js';
import SecurityLogViewer from '../../components/admin/SecurityLogViewer.js';
import { fetchSecurityLogs, prometheusQuery } from '../../lib/adminApi.js';
=======
import useSWR                    from 'swr';
import AdminLayout               from '../../components/admin/AdminLayout.js';
import SecurityLogViewer         from '../../components/admin/SecurityLogViewer.js';
import {
  fetchSecurityLogs, prometheusQuery, fetchTempoTraces,
} from '../../lib/adminApi.js';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

const TEMPO_BASE = process.env.NEXT_PUBLIC_TEMPO_URL ?? 'http://localhost:3000/explore';

function tempoUrl(traceId) {
  return `${TEMPO_BASE}?orgId=1&left=%7B%22datasource%22%3A%22tempo%22%2C%22queries%22%3A%5B%7B%22query%22%3A%22${traceId}%22%7D%5D%7D`;
}

// ── Prometheus security metrics ───────────────────────────────────────────────

const PROM_QUERIES = {
<<<<<<< HEAD
  auth_failures: 'sum(wolf_errors_total{errorType=~"token_.*|invalid_api_key"})',
  rate_limited: 'wolf_rate_limit_total',
  rbac_denials: 'sum(wolf_errors_total{errorType="forbidden"})',
=======
  auth_failures:   'sum(wolf_errors_total{errorType=~"token_.*|invalid_api_key"})',
  rate_limited:    'wolf_rate_limit_total',
  rbac_denials:    'sum(wolf_errors_total{errorType="forbidden"})',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  active_sessions: 'wolf_active_sessions',
};

async function fetchPrometheusSecurityMetrics() {
  const entries = await Promise.allSettled(
    Object.entries(PROM_QUERIES).map(async ([key, query]) => {
      const result = await prometheusQuery(query);
<<<<<<< HEAD
      const value = result?.data?.result?.[0]?.value?.[1];
      return [key, value !== undefined ? Number(value) : null];
    })
  );
  return Object.fromEntries(entries.filter(e => e.status === 'fulfilled').map(e => e.value));
=======
      const value  = result?.data?.result?.[0]?.value?.[1];
      return [key, value !== undefined ? Number(value) : null];
    }),
  );
  return Object.fromEntries(
    entries
      .filter(e => e.status === 'fulfilled')
      .map(e => e.value),
  );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSecurityLogsPage() {
  const [filterParams, setFilterParams] = useState({ limit: 50, page: 1 });

  // SWR key changes with params → re-fetches automatically.
  const swrKey = ['/admin/security-logs', JSON.stringify(filterParams)];

<<<<<<< HEAD
  const {
    data,
    error,
    isLoading,
    mutate: _mutate,
  } = useSWR(swrKey, () => fetchSecurityLogs(filterParams), {
    revalidateOnFocus: false,
  });
=======
  const { data, error, isLoading, mutate } = useSWR(
    swrKey,
    () => fetchSecurityLogs(filterParams),
    { revalidateOnFocus: false },
  );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  const { data: prometheusData } = useSWR(
    '/admin/prometheus/security',
    fetchPrometheusSecurityMetrics,
<<<<<<< HEAD
    { refreshInterval: 30_000 }
=======
    { refreshInterval: 30_000 },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  );

  const handleFilter = useCallback(params => {
    setFilterParams(params);
  }, []);

  return (
    <AdminLayout
      title="Security Logs"
      description="Auth events · rate-limit hits · RBAC denials — linked to Tempo traces"
    >
      <SecurityLogViewer
        events={data?.events ?? []}
        total={data?.total ?? 0}
        loading={isLoading}
        error={error}
        onFilter={handleFilter}
        prometheusData={prometheusData}
        tempoUrl={tempoUrl}
      />
    </AdminLayout>
  );
}
