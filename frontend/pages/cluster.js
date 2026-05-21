// frontend/pages/cluster.js — Kubernetes cluster state viewer.
//
// Fetches pod and HPA data from the backend and renders them via ClusterView.
// Auto-refreshes every 15 s.

import useSWR            from 'swr';
import { RefreshCw }     from 'lucide-react';
import Layout            from '../components/Layout.js';
import ClusterView       from '../components/ClusterView.js';
import { apiFetcher }    from '../lib/api.js';

const SWR_OPTS = { refreshInterval: 15_000 };

export default function ClusterPage() {
  const {
    data: podsData,
    error: podsError,
    isLoading: podsLoading,
    mutate: mutatePods,
  } = useSWR('/k8s/pods', apiFetcher, SWR_OPTS);

  const {
    data: hpaData,
    error: hpaError,
    isLoading: hpaLoading,
    mutate: mutateHpa,
  } = useSWR('/k8s/hpa', apiFetcher, SWR_OPTS);

  const refresh = () => { mutatePods(); mutateHpa(); };
  const error   = podsError ?? hpaError;
  const loading  = podsLoading || hpaLoading;

  const pods = podsData?.pods ?? podsData ?? [];
  const hpa  = hpaData?.hpa   ?? hpaData  ?? [];

  return (
    <Layout
      title="Cluster"
      description="wolf-engine namespace — pod health · HPA · resource usage"
    >
      <div className="space-y-4">
        {/* Action bar */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">
            Namespace: <span className="font-mono font-medium">wolf-engine</span>
            {' · '}Auto-refreshes every 15 s
          </p>
          <button
            className="btn-ghost py-1 px-3"
            onClick={refresh}
            aria-label="Refresh cluster state"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            Refresh
          </button>
        </div>

        <ClusterView
          pods={pods}
          hpa={hpa}
          loading={loading}
          error={error}
        />
      </div>
    </Layout>
  );
}
