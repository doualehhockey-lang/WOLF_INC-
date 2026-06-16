// frontend/components/admin/ApiKeyManager.js — CRUD API key management.
//
// Features:
//   - Table of all API keys (prefix + name + role + expiry + last used)
//   - Create key modal — returns full key ONCE (shown in a copy modal)
//   - Revoke key (soft delete, immediate effect)
//   - Rotate key — invalidates old key, returns new full key ONCE
//   - Filter by role / active / revoked
//
// Security design:
//   - Full API key is NEVER stored client-side after the initial display.
//   - The "key revealed" modal auto-closes or requires explicit dismiss.
//   - Only prefix is shown in the table (same as GitHub PATs).

import { useState, useMemo, useCallback } from 'react';
import {
  Plus,
  Trash2,
  RotateCcw,
  Copy,
  Check,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Key,
} from 'lucide-react';
import clsx from 'clsx';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLES = ['admin', 'service', 'user'];

const ROLE_BADGE = {
  admin: 'badge-red',
  service: 'badge-blue',
  user: 'badge-green',
};

// ── Key reveal modal (shown once after create / rotate) ───────────────────────

function KeyRevealModal({ title, fullKey, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div className="card max-w-lg w-full shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-xs text-red-500 mt-0.5 font-medium">
              Copy now — this key will never be shown again.
            </p>
          </div>
        </div>

        <div
          className="flex items-center gap-2 rounded-lg border border-amber-300
                        dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2"
        >
          <code className="flex-1 text-xs font-mono break-all text-amber-900 dark:text-amber-200 select-all">
            {fullKey}
          </code>
          <button
            onClick={handleCopy}
            className="shrink-0 p-1.5 rounded hover:bg-amber-100 dark:hover:bg-amber-800/40
                       text-amber-700 dark:text-amber-400 transition-colors"
            aria-label="Copy key to clipboard"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>

        <p className="text-xs text-text-muted">
          Store this key in a secrets manager (e.g. AWS Secrets Manager, HashiCorp Vault)
          immediately. It cannot be retrieved from Wolf Engine after this dialog closes.
        </p>

        <div className="flex justify-end">
          <button className="btn-primary" onClick={onClose}>
            I have saved the key
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create key modal ──────────────────────────────────────────────────────────

function CreateKeyModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ name: '', role: 'service', expiresInDays: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await onCreate(form);
      onClose(result?.key ?? null);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create API key"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div className="card max-w-md w-full shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Create API Key</h2>
          <button
            onClick={() => onClose(null)}
            className="text-text-muted hover:text-text-base text-lg"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1">
            <label htmlFor="ak-name" className="block text-xs font-medium text-text-muted">
              Key name <span className="text-red-500">*</span>
            </label>
            <input
              id="ak-name"
              type="text"
              required
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. ci-cd-pipeline"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm
                         font-mono text-text-base focus:outline-none focus:ring-2 focus:ring-wolf-400"
              aria-label="Key name"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="ak-role" className="block text-xs font-medium text-text-muted">
              Role
            </label>
            <select
              id="ak-role"
              value={form.role}
              onChange={e => set('role', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm
                         text-text-base focus:outline-none focus:ring-2 focus:ring-wolf-400"
              aria-label="Key role"
            >
              {ROLES.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="ak-exp" className="block text-xs font-medium text-text-muted">
              Expires in (days){' '}
              <span className="text-text-muted font-normal">— leave blank for no expiry</span>
            </label>
            <input
              id="ak-exp"
              type="number"
              min="1"
              max="3650"
              value={form.expiresInDays}
              onChange={e => set('expiresInDays', e.target.value)}
              placeholder="90"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm
                         font-mono text-text-base focus:outline-none focus:ring-2 focus:ring-wolf-400"
              aria-label="Expiry in days"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={() => onClose(null)}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !form.name.trim()}
              aria-busy={loading}
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Generate Key
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Key row ───────────────────────────────────────────────────────────────────

function KeyRow({ apiKey, onRevoke, onRotate }) {
  const [revoking, setRevoking] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'revoke' | 'rotate' | null

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      await onRevoke(apiKey.id);
    } finally {
      setRevoking(false);
      setConfirm(null);
    }
  };

  const handleRotate = async () => {
    setRotating(true);
    try {
      await onRotate(apiKey.id);
    } finally {
      setRotating(false);
      setConfirm(null);
    }
  };

  const isExpired = apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date();

  return (
    <tr className={clsx('hover:bg-surface transition-colors', apiKey.revoked && 'opacity-50')}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-text-muted shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">{apiKey.name}</p>
            <p className="text-xs font-mono text-text-muted">{apiKey.prefix}…</p>
          </div>
        </div>
      </td>

      <td className="px-4 py-3">
        <span className={ROLE_BADGE[apiKey.role] ?? 'badge-gray'}>{apiKey.role}</span>
      </td>

      <td className="px-4 py-3">
        {apiKey.revoked ? (
          <span className="badge-red">Revoked</span>
        ) : isExpired ? (
          <span className="badge-yellow">Expired</span>
        ) : (
          <span className="badge-green">Active</span>
        )}
      </td>

      <td className="px-4 py-3 text-xs text-text-muted">
        {apiKey.expiresAt ? new Date(apiKey.expiresAt).toLocaleDateString('fr-FR') : 'Never'}
      </td>

      <td className="px-4 py-3 text-xs text-text-muted">
        {apiKey.lastUsed ? new Date(apiKey.lastUsed).toLocaleString('fr-FR') : 'Never'}
      </td>

      <td className="px-4 py-3">
        {!apiKey.revoked && (
          <div className="flex items-center gap-1">
            {/* Rotate */}
            {confirm === 'rotate' ? (
              <>
                <button
                  onClick={handleRotate}
                  disabled={rotating}
                  className="btn-ghost py-1 px-2 text-xs text-amber-600"
                  aria-label="Confirm rotate"
                >
                  {rotating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm rotate'}
                </button>
                <button onClick={() => setConfirm(null)} className="btn-ghost py-1 px-2 text-xs">
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirm('rotate')}
                className="btn-ghost py-1 px-2 text-xs"
                aria-label={`Rotate key ${apiKey.name}`}
                title="Rotate"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}

            {/* Revoke */}
            {confirm === 'revoke' ? (
              <>
                <button
                  onClick={handleRevoke}
                  disabled={revoking}
                  className="btn-ghost py-1 px-2 text-xs text-red-600"
                  aria-label="Confirm revoke"
                >
                  {revoking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm revoke'}
                </button>
                <button onClick={() => setConfirm(null)} className="btn-ghost py-1 px-2 text-xs">
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirm('revoke')}
                className="btn-ghost py-1 px-2 text-xs text-red-500"
                aria-label={`Revoke key ${apiKey.name}`}
                title="Revoke"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {{
 *   apiKeys:  object[],
 *   loading:  boolean,
 *   error:    Error|null,
 *   onCreate: (data) => Promise<{ key: string }>,
 *   onRevoke: (id: string) => Promise<void>,
 *   onRotate: (id: string) => Promise<{ key: string }>,
 * }} props
 */
export default function ApiKeyManager({
  apiKeys = [],
  loading,
  error,
  onCreate,
  onRevoke,
  onRotate,
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [revealedKey, setRevealedKey] = useState(null); // full key string after create/rotate
  const [revealTitle, setRevealTitle] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'active' | 'revoked'

  const filtered = useMemo(() => {
    if (filter === 'active') return apiKeys.filter(k => !k.revoked);
    if (filter === 'revoked') return apiKeys.filter(k => k.revoked);
    return apiKeys;
  }, [apiKeys, filter]);

  const handleCreate = useCallback(
    async data => {
      const result = await onCreate(data);
      if (result?.key) {
        setRevealedKey(result.key);
        setRevealTitle('New API Key Created');
      }
    },
    [onCreate]
  );

  const handleRotate = useCallback(
    async id => {
      const result = await onRotate(id);
      if (result?.key) {
        setRevealedKey(result.key);
        setRevealTitle('API Key Rotated — New Key');
      }
    },
    [onRotate]
  );

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading API keys">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card animate-pulse h-14" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card flex items-center gap-3 text-red-500">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <p className="text-sm">Failed to load API keys: {error.message}</p>
      </div>
    );
  }

  return (
    <>
      {showCreate && (
        <CreateKeyModal
          onClose={_key => {
            setShowCreate(false);
            // onCreate already called from inside modal
          }}
          onCreate={handleCreate}
        />
      )}

      {revealedKey && (
        <KeyRevealModal
          title={revealTitle}
          fullKey={revealedKey}
          onClose={() => setRevealedKey(null)}
        />
      )}

      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status filter */}
          <div
            className="flex rounded-lg border border-border overflow-hidden"
            role="group"
            aria-label="Filter by status"
          >
            {['all', 'active', 'revoked'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                  filter === f
                    ? 'bg-wolf-500 text-white'
                    : 'bg-surface-2 text-text-muted hover:bg-surface hover:text-text-base'
                )}
                aria-pressed={filter === f}
              >
                {f}
              </button>
            ))}
          </div>

          <span className="text-xs text-text-muted">
            {filtered.length} key{filtered.length !== 1 ? 's' : ''}
          </span>

          <button
            className="btn-primary ml-auto"
            onClick={() => setShowCreate(true)}
            aria-label="Create new API key"
          >
            <Plus className="h-4 w-4" />
            New Key
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm" aria-label="API keys">
            <thead className="bg-surface border-b border-border">
              <tr>
                {['Name / Prefix', 'Role', 'Status', 'Expires', 'Last Used', 'Actions'].map(h => (
                  <th
                    key={h}
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium text-text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-text-muted">
                    No API keys found.
                  </td>
                </tr>
              ) : (
                filtered.map(k => (
                  <KeyRow key={k.id} apiKey={k} onRevoke={onRevoke} onRotate={handleRotate} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
