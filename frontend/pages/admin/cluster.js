// frontend/pages/admin/cluster.js — Admin cluster state page.

import { useCallback } from 'react';
import useSWR from 'swr';
import { RefreshCw } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout.js';
import ClusterAdminView from '../../components/admin/ClusterAdminView.js';
import {
  fetchAdminPods,
  fetchAdminHpa,
  fetchNodes,
  fetchNamespaceQuota,
  deletePod,
  fetchGrafanaPanels,
} from '../../lib/adminApi.js';

const SWR_OPTS = { refreshInterval: 15_000 };

export default function AdminClusterPage() {
  const {
    data: podsData,
    error: podsError,
    isLoading: podsLoading,
    mutate: mutatePods,
  } = useSWR('/admin/k8s/pods', fetchAdminPods, SWR_OPTS);

  const {
    data: hpaData,
    error: hpaError,
    isLoading: hpaLoading,
    mutate: mutateHpa,
  } = useSWR('/admin/k8s/hpa', fetchAdminHpa, SWR_OPTS);

  const {
    data: nodesData,
    error: nodesError,
    isLoading: nodesLoading,
    mutate: mutateNodes,
  } = useSWR('/admin/k8s/nodes', fetchNodes, SWR_OPTS);

  const { data: quotaData } = useSWR('/admin/k8s/quota', fetchNamespaceQuota, SWR_OPTS);

  const { data: grafanaData } = useSWR('/admin/observability/grafana/panels', fetchGrafanaPanels, {
    refreshInterval: 120_000,
  });

  const loading = podsLoading || hpaLoading || nodesLoading;
  const error = podsError ?? hpaError ?? nodesError;

  const refresh = useCallback(() => {
    mutatePods();
    mutateHpa();
    mutateNodes();
  }, [mutatePods, mutateHpa, mutateNodes]);

  const handleDeletePod = useCallback(
    async name => {
      await deletePod(name);
      mutatePods();
    },
    [mutatePods]
  );

  return (
    <AdminLayout
      title="Cluster"
      description="wolf-engine namespace — pods · HPA · nodes · resource quota"
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

        <ClusterAdminView
          pods={podsData?.pods ?? podsData ?? []}
          hpa={hpaData?.hpa ?? hpaData ?? []}
          nodes={nodesData?.nodes ?? nodesData ?? []}
          quota={quotaData?.quota ?? quotaData ?? null}
          loading={loading}
          error={error}
          onDeletePod={handleDeletePod}
          grafanaPanels={grafanaData?.panels ?? []}
        />
      </div>
    </AdminLayout>
  );
}
