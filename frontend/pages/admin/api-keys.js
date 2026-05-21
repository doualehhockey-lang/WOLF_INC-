// frontend/pages/admin/api-keys.js — Admin API key management page.

import { useCallback } from 'react';
import useSWR          from 'swr';
import AdminLayout     from '../../components/admin/AdminLayout.js';
import ApiKeyManager   from '../../components/admin/ApiKeyManager.js';
import {
  fetchApiKeys, createApiKey, revokeApiKey, rotateApiKey,
} from '../../lib/adminApi.js';

const SWR_OPTS = { refreshInterval: 60_000 };

export default function AdminApiKeysPage() {
  const { data, error, isLoading, mutate } = useSWR(
    '/admin/api-keys',
    fetchApiKeys,
    SWR_OPTS,
  );

  const keys = data?.keys ?? data ?? [];

  const handleCreate = useCallback(async formData => {
    const result = await createApiKey(formData);
    mutate();
    return result; // { key: '...' } — passed back to KeyRevealModal
  }, [mutate]);

  const handleRevoke = useCallback(async id => {
    await revokeApiKey(id);
    mutate();
  }, [mutate]);

  const handleRotate = useCallback(async id => {
    const result = await rotateApiKey(id);
    mutate();
    return result; // { key: '...' }
  }, [mutate]);

  return (
    <AdminLayout
      title="API Keys"
      description="Create, rotate, and revoke machine-to-machine API keys"
    >
      <div className="space-y-4">
        {/* Security notice */}
        <div className="card border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20
                        text-amber-800 dark:text-amber-300 text-sm flex items-start gap-3 py-3">
          <span className="text-lg shrink-0" aria-hidden="true">⚠️</span>
          <p>
            Full API keys are shown <strong>only once</strong> at creation or rotation.
            Store them immediately in a secrets manager.
            Only key prefixes are stored in Wolf Engine.
          </p>
        </div>

        <ApiKeyManager
          apiKeys={keys}
          loading={isLoading}
          error={error}
          onCreate={handleCreate}
          onRevoke={handleRevoke}
          onRotate={handleRotate}
        />
      </div>
    </AdminLayout>
  );
}
