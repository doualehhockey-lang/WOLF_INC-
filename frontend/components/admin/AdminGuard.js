// frontend/components/admin/AdminGuard.js — Auth + RBAC guard HOC.
//
// Renders children only when:
//   1. A valid (non-expired) JWT is present in sessionStorage.
//   2. The token payload contains role === 'admin'.
//
// On any failure:
//   - Not authenticated → redirects to /login (or shows login prompt)
//   - Authenticated but not admin → renders a 403 screen
//
// NOTE: Server-side enforcement is authoritative. This guard is UX-only
// and prevents accidental exposure in the browser — not a security boundary.

import { useEffect, useState } from 'react';
import { useRouter }           from 'next/router';
import { Lock, ShieldX, Loader2 } from 'lucide-react';
import { decodeJwtPayload }    from '../../lib/adminApi.js';

/**
 * @param {{ children: React.ReactNode, loginPath?: string }} props
 */
export default function AdminGuard({ children, loginPath = '/login' }) {
  const router = useRouter();

  // 'loading' | 'ok' | 'unauthenticated' | 'forbidden'
  const [state, setState] = useState('loading');

  useEffect(() => {
    const token = sessionStorage.getItem('wolf_token');

    if (!token) {
      setState('unauthenticated');
      return;
    }

    const payload = decodeJwtPayload(token);

    if (!payload) {
      setState('unauthenticated');
      return;
    }

    // Client-side expiry check (server will also verify).
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      sessionStorage.removeItem('wolf_token');
      setState('unauthenticated');
      return;
    }

    if (payload.role !== 'admin') {
      setState('forbidden');
      return;
    }

    setState('ok');
  }, []);

  // Redirect unauthenticated users after state is resolved.
  useEffect(() => {
    if (state === 'unauthenticated') {
      router.replace(`${loginPath}?next=${encodeURIComponent(router.asPath)}`);
    }
  }, [state, router, loginPath]);

  if (state === 'loading' || state === 'unauthenticated') {
    return (
      <div
        className="flex h-screen items-center justify-center bg-surface"
        aria-label="Checking authentication"
        aria-busy="true"
      >
        <Loader2 className="h-8 w-8 animate-spin text-wolf-500" aria-hidden="true" />
      </div>
    );
  }

  if (state === 'forbidden') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-surface p-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/30">
          <ShieldX className="h-8 w-8 text-red-600 dark:text-red-400" aria-hidden="true" />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-semibold text-text-base">Access Denied</h1>
          <p className="mt-1 text-sm text-text-muted">
            This area requires the <span className="font-mono font-bold">admin</span> role.
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="btn-ghost"
        >
          Go back
        </button>
      </div>
    );
  }

  return children;
}
