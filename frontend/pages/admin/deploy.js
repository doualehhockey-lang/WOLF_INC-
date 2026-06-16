// frontend/pages/admin/deploy.js — Admin deployment control page.

<<<<<<< HEAD
import { useCallback } from 'react';
import useSWR from 'swr';
import AdminLayout from '../../components/admin/AdminLayout.js';
import DeployAdminControls from '../../components/admin/DeployAdminControls.js';
import {
  adminTriggerCanary,
  adminPromoteCanary,
  adminRollback,
  adminFullDeploy,
  fetchDeployStatus,
  fetchDeployHistory,
=======
import { useCallback }       from 'react';
import useSWR                from 'swr';
import AdminLayout           from '../../components/admin/AdminLayout.js';
import DeployAdminControls   from '../../components/admin/DeployAdminControls.js';
import {
  adminTriggerCanary, adminPromoteCanary,
  adminRollback, adminFullDeploy,
  fetchDeployStatus, fetchDeployHistory,
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
} from '../../lib/adminApi.js';

export default function AdminDeployPage() {
  const {
<<<<<<< HEAD
    data: statusData,
    error: statusError,
    isLoading: statusLoading,
    mutate: mutateStatus,
  } = useSWR('/admin/deploy/status', fetchDeployStatus, { refreshInterval: 15_000 });

  const {
    data: historyData,
    isLoading: historyLoading,
    mutate: mutateHistory,
  } = useSWR('/admin/deploy/history', () => fetchDeployHistory(30), { refreshInterval: 30_000 });

  const refresh = useCallback(() => {
    mutateStatus();
    mutateHistory();
  }, [mutateStatus, mutateHistory]);

  const handleCanary = useCallback(
    async tag => {
      await adminTriggerCanary(tag);
      refresh();
    },
    [refresh]
  );
  const handlePromote = useCallback(async () => {
    await adminPromoteCanary();
    refresh();
  }, [refresh]);
  const handleRollback = useCallback(
    async tag => {
      await adminRollback(tag);
      refresh();
    },
    [refresh]
  );
  const handleFull = useCallback(
    async (tag, force) => {
      await adminFullDeploy(tag, force);
      refresh();
    },
    [refresh]
  );
=======
    data:      statusData,
    error:     statusError,
    isLoading: statusLoading,
    mutate:    mutateStatus,
  } = useSWR('/admin/deploy/status',  fetchDeployStatus,  { refreshInterval: 15_000 });

  const {
    data:      historyData,
    isLoading: historyLoading,
    mutate:    mutateHistory,
  } = useSWR('/admin/deploy/history', () => fetchDeployHistory(30), { refreshInterval: 30_000 });

  const refresh = useCallback(() => { mutateStatus(); mutateHistory(); }, [mutateStatus, mutateHistory]);

  const handleCanary   = useCallback(async tag  => { await adminTriggerCanary(tag); refresh(); }, [refresh]);
  const handlePromote  = useCallback(async ()   => { await adminPromoteCanary();    refresh(); }, [refresh]);
  const handleRollback = useCallback(async tag  => { await adminRollback(tag);      refresh(); }, [refresh]);
  const handleFull     = useCallback(async (tag, force) => { await adminFullDeploy(tag, force); refresh(); }, [refresh]);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  return (
    <AdminLayout
      title="Deployments"
      description="Canary · promote · rollback · full deploy — all actions require confirmation"
    >
      <DeployAdminControls
        onCanary={handleCanary}
        onPromote={handlePromote}
        onRollback={handleRollback}
        onFull={handleFull}
        status={statusData}
        history={historyData?.runs ?? historyData ?? []}
        loading={statusLoading || historyLoading}
        error={statusError}
      />
    </AdminLayout>
  );
}
