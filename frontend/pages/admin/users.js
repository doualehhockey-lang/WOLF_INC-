// frontend/pages/admin/users.js — Admin user management page.

import { useCallback }  from 'react';
import useSWR           from 'swr';
import AdminLayout      from '../../components/admin/AdminLayout.js';
import UserManager      from '../../components/admin/UserManager.js';
import {
  fetchUsers, createUser, updateUserRole,
  deleteUser, resetUserPassword,
} from '../../lib/adminApi.js';

const SWR_OPTS = { refreshInterval: 30_000 };

export default function AdminUsersPage() {
  const { data, error, isLoading, mutate } = useSWR(
    '/admin/users',
    fetchUsers,
    SWR_OPTS,
  );

  const users = data?.users ?? data ?? [];

  const handleCreate = useCallback(async formData => {
    await createUser(formData);
    mutate();
  }, [mutate]);

  const handleRoleChange = useCallback(async (id, role) => {
    await updateUserRole(id, role);
    mutate();
  }, [mutate]);

  const handleDelete = useCallback(async id => {
    await deleteUser(id);
    mutate();
  }, [mutate]);

  const handleReset = useCallback(async id => {
    await resetUserPassword(id);
    // Optionally show a toast with the reset link; for now just re-fetch.
    mutate();
  }, [mutate]);

  return (
    <AdminLayout
      title="Users & Roles"
      description="Manage user accounts and RBAC role assignments"
    >
      <UserManager
        users={users}
        loading={isLoading}
        error={error}
        onCreate={handleCreate}
        onRoleChange={handleRoleChange}
        onDelete={handleDelete}
        onReset={handleReset}
      />
    </AdminLayout>
  );
}
