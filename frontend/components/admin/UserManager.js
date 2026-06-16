// frontend/components/admin/UserManager.js — CRUD user management + RBAC roles.
//
// Features:
//   - Paginated user table with role badges
//   - Create user modal (email + password + role)
//   - Edit role inline (select dropdown, saves on change)
//   - Delete user with confirmation dialog
//   - Password reset trigger (sends reset email / returns temp token)
//   - Search by email or sub
//
// Props:
//   fetchUsers       — () => Promise<{ users }>
//   createUser       — (data) => Promise
//   updateUserRole   — (id, role) => Promise
//   deleteUser       — (id) => Promise
//   resetUserPassword— (id) => Promise

import { useState, useMemo, useCallback } from 'react';
import {
<<<<<<< HEAD
  Plus,
  Trash2,
  Search,
  UserCircle2,
  Loader2,
  AlertCircle,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
=======
  Plus, Trash2, Key, Search, UserCircle2,
  Loader2, AlertCircle, ChevronDown, RotateCcw,
} from 'lucide-react';
import clsx from 'clsx';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLES = ['admin', 'service', 'user', 'guest'];

<<<<<<< HEAD
const _ROLE_BADGE = {
  admin: 'badge-red',
  service: 'badge-blue',
  user: 'badge-green',
  guest: 'badge-gray',
=======
const ROLE_BADGE = {
  admin:   'badge-red',
  service: 'badge-blue',
  user:    'badge-green',
  guest:   'badge-gray',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
};

const PAGE_SIZE = 20;

// ── Create user modal ─────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreate }) {
<<<<<<< HEAD
  const [form, setForm] = useState({ email: '', sub: '', role: 'user', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
=======
  const [form,    setForm]    = useState({ email: '', sub: '', role: 'user', password: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.email.trim() || !form.password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onCreate(form);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create user"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div className="card max-w-md w-full shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Create User</h2>
<<<<<<< HEAD
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-base text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error && <p className="badge-red text-xs w-full text-center py-1">{error}</p>}
=======
          <button onClick={onClose} className="text-text-muted hover:text-text-base text-lg leading-none"
            aria-label="Close">×</button>
        </div>

        {error && (
          <p className="badge-red text-xs w-full text-center py-1">{error}</p>
        )}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Field label="Email" id="cu-email" required>
            <input
<<<<<<< HEAD
              id="cu-email"
              type="email"
              required
              value={form.email}
              onChange={e => set('email', e.target.value)}
              className="input-base"
              placeholder="alice@wolf-inc.io"
=======
              id="cu-email" type="email" required
              value={form.email} onChange={e => set('email', e.target.value)}
              className="input-base" placeholder="alice@wolf-inc.io"
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
              aria-label="Email address"
            />
          </Field>

          <Field label="Username / sub" id="cu-sub">
            <input
<<<<<<< HEAD
              id="cu-sub"
              type="text"
              value={form.sub}
              onChange={e => set('sub', e.target.value)}
              className="input-base"
              placeholder="alice"
=======
              id="cu-sub" type="text"
              value={form.sub} onChange={e => set('sub', e.target.value)}
              className="input-base" placeholder="alice"
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
              aria-label="Username"
            />
          </Field>

          <Field label="Initial password" id="cu-pwd" required>
            <input
<<<<<<< HEAD
              id="cu-pwd"
              type="password"
              required
              value={form.password}
              onChange={e => set('password', e.target.value)}
              className="input-base"
              placeholder="min 12 characters"
=======
              id="cu-pwd" type="password" required
              value={form.password} onChange={e => set('password', e.target.value)}
              className="input-base" placeholder="min 12 characters"
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
              aria-label="Initial password"
            />
          </Field>

          <Field label="Role" id="cu-role">
            <RoleSelect value={form.role} onChange={v => set('role', v)} id="cu-role" />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
<<<<<<< HEAD
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
=======
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !form.email.trim() || !form.password.trim()}
              aria-busy={loading}
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Confirm delete dialog ─────────────────────────────────────────────────────

function DeleteConfirm({ user, onConfirm, onCancel, loading }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Delete user ${user.email}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div className="card max-w-sm w-full shadow-2xl space-y-4">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Delete user?</p>
            <p className="text-xs text-text-muted mt-1">
<<<<<<< HEAD
              <span className="font-mono font-bold">{user.email}</span> will be permanently deleted.
              This cannot be undone.
=======
              <span className="font-mono font-bold">{user.email}</span> will be
              permanently deleted. This cannot be undone.
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
<<<<<<< HEAD
          <button className="btn-ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
=======
          <button className="btn-ghost" onClick={onCancel} disabled={loading}>Cancel</button>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
          <button className="btn-danger" onClick={onConfirm} disabled={loading} aria-busy={loading}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function Field({ label, id, required, children }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-text-muted">
<<<<<<< HEAD
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
=======
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
      </label>
      {children}
    </div>
  );
}

function RoleSelect({ value, onChange, id }) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input-base appearance-none pr-8"
        aria-label="Role"
      >
<<<<<<< HEAD
        {ROLES.map(r => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2
                              h-3.5 w-3.5 text-text-muted"
        aria-hidden="true"
      />
=======
        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2
                              h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    </div>
  );
}

// ── User row ──────────────────────────────────────────────────────────────────

function UserRow({ user, onRoleChange, onDelete, onReset }) {
  const [savingRole, setSavingRole] = useState(false);
<<<<<<< HEAD
  const [deleting, setDeleting] = useState(false);
  const [showDel, setShowDel] = useState(false);

  const handleRoleChange = async role => {
    setSavingRole(true);
    try {
      await onRoleChange(user.id, role);
    } finally {
      setSavingRole(false);
    }
=======
  const [deleting,   setDeleting]   = useState(false);
  const [showDel,    setShowDel]    = useState(false);

  const handleRoleChange = async role => {
    setSavingRole(true);
    try { await onRoleChange(user.id, role); }
    finally { setSavingRole(false); }
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  };

  const handleDelete = async () => {
    setDeleting(true);
<<<<<<< HEAD
    try {
      await onDelete(user.id);
      setShowDel(false);
    } finally {
      setDeleting(false);
    }
=======
    try { await onDelete(user.id); setShowDel(false); }
    finally { setDeleting(false); }
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  };

  return (
    <>
      {showDel && (
        <DeleteConfirm
          user={user}
          onConfirm={handleDelete}
          onCancel={() => setShowDel(false)}
          loading={deleting}
        />
      )}

      <tr className="hover:bg-surface transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <UserCircle2 className="h-5 w-5 text-text-muted shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">{user.email}</p>
              {user.sub && <p className="text-xs text-text-muted font-mono">{user.sub}</p>}
            </div>
          </div>
        </td>

        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
<<<<<<< HEAD
            {savingRole ? <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" /> : null}
            <RoleSelect id={`role-${user.id}`} value={user.role} onChange={handleRoleChange} />
=======
            {savingRole
              ? <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" />
              : null}
            <RoleSelect
              id={`role-${user.id}`}
              value={user.role}
              onChange={handleRoleChange}
            />
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
          </div>
        </td>

        <td className="px-4 py-3 text-xs text-text-muted">
<<<<<<< HEAD
          {user.createdAt ? new Date(user.createdAt).toLocaleDateString('fr-FR') : '—'}
        </td>

        <td className="px-4 py-3 text-xs text-text-muted">
          {user.lastLogin ? new Date(user.lastLogin).toLocaleString('fr-FR') : 'Never'}
=======
          {user.createdAt
            ? new Date(user.createdAt).toLocaleDateString('fr-FR')
            : '—'}
        </td>

        <td className="px-4 py-3 text-xs text-text-muted">
          {user.lastLogin
            ? new Date(user.lastLogin).toLocaleString('fr-FR')
            : 'Never'}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
        </td>

        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onReset(user.id)}
              className="btn-ghost py-1 px-2 text-xs"
              aria-label={`Reset password for ${user.email}`}
              title="Reset password"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              onClick={() => setShowDel(true)}
              className="btn-ghost py-1 px-2 text-xs text-red-500 hover:text-red-600"
              aria-label={`Delete ${user.email}`}
              title="Delete user"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </td>
      </tr>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {{
 *   users:             object[],
 *   loading:           boolean,
 *   error:             Error|null,
 *   onCreate:          (data: object) => Promise<void>,
 *   onRoleChange:      (id: string, role: string) => Promise<void>,
 *   onDelete:          (id: string) => Promise<void>,
 *   onReset:           (id: string) => Promise<void>,
 * }} props
 */
export default function UserManager({
<<<<<<< HEAD
  users = [],
  loading,
  error,
  onCreate,
  onRoleChange,
  onDelete,
  onReset,
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
=======
  users = [], loading, error,
  onCreate, onRoleChange, onDelete, onReset,
}) {
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  const [showAdd, setShowAdd] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
<<<<<<< HEAD
    return users.filter(
      u => u.email?.toLowerCase().includes(q) || u.sub?.toLowerCase().includes(q)
=======
    return users.filter(u =>
      u.email?.toLowerCase().includes(q) || u.sub?.toLowerCase().includes(q),
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
    );
  }, [users, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
<<<<<<< HEAD
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSearch = useCallback(v => {
    setSearch(v);
    setPage(1);
  }, []);
=======
  const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSearch = useCallback(v => { setSearch(v); setPage(1); }, []);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading users">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="card animate-pulse h-14" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card flex items-center gap-3 text-red-500">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <p className="text-sm">Failed to load users: {error.message}</p>
      </div>
    );
  }

  return (
    <>
      {showAdd && (
        <CreateUserModal
          onClose={() => setShowAdd(false)}
<<<<<<< HEAD
          onCreate={async data => {
            await onCreate(data);
            setShowAdd(false);
          }}
=======
          onCreate={async data => { await onCreate(data); setShowAdd(false); }}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
        />
      )}

      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
<<<<<<< HEAD
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5
                               text-text-muted pointer-events-none"
            />
=======
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5
                               text-text-muted pointer-events-none" />
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
            <input
              type="search"
              placeholder="Search by email or username…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface pl-8 pr-3 py-2
                         text-sm text-text-base placeholder:text-text-muted
                         focus:outline-none focus:ring-2 focus:ring-wolf-400"
              aria-label="Search users"
            />
          </div>

          <span className="text-xs text-text-muted tabular-nums">
            {filtered.length} user{filtered.length !== 1 ? 's' : ''}
          </span>

          <button
            className="btn-primary ml-auto"
            onClick={() => setShowAdd(true)}
            aria-label="Create new user"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New User
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm" aria-label="Users">
            <thead className="bg-surface border-b border-border">
              <tr>
                {['User', 'Role', 'Created', 'Last Login', 'Actions'].map(h => (
<<<<<<< HEAD
                  <th
                    key={h}
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium text-text-muted"
                  >
=======
                  <th key={h} scope="col"
                    className="px-4 py-3 text-left text-xs font-medium text-text-muted">
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-text-muted">
                    {search ? 'No users match your search.' : 'No users found.'}
                  </td>
                </tr>
<<<<<<< HEAD
              ) : (
                paged.map(user => (
                  <UserRow
                    key={user.id}
                    user={user}
                    onRoleChange={onRoleChange}
                    onDelete={onDelete}
                    onReset={onReset}
                  />
                ))
              )}
=======
              ) : paged.map(user => (
                <UserRow
                  key={user.id}
                  user={user}
                  onRoleChange={onRoleChange}
                  onDelete={onDelete}
                  onReset={onReset}
                />
              ))}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              className="btn-ghost py-1 px-3 text-xs"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              aria-label="Previous page"
            >
              Previous
            </button>
            <span className="text-xs text-text-muted">
              {page} / {totalPages}
            </span>
            <button
              className="btn-ghost py-1 px-3 text-xs"
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </>
  );
}
