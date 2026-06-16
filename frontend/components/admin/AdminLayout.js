// frontend/components/admin/AdminLayout.js — Admin shell.
//
// Extends the main app layout with an admin-specific sidebar section.
// Renders a red "ADMIN" badge to make it visually distinct from normal views.
// Wraps children with AdminGuard so every admin page is protected automatically.

<<<<<<< HEAD
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Users,
  Key,
  ShieldAlert,
  Rocket,
  Server,
  BarChart3,
  ChevronLeft,
  Lock,
} from 'lucide-react';
import { useTheme } from '../../lib/theme.js';
import AdminGuard from './AdminGuard.js';
import { Sun, Moon, Menu, X } from 'lucide-react';
=======
import Link          from 'next/link';
import { useRouter } from 'next/router';
import {
  Users, Key, ShieldAlert, Rocket, Server,
  BarChart3, ChevronLeft, Lock,
} from 'lucide-react';
import { useTheme }   from '../../lib/theme.js';
import AdminGuard     from './AdminGuard.js';
import { Sun, Moon, Menu, X, Zap } from 'lucide-react';
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
import { useState, useCallback } from 'react';
import clsx from 'clsx';

const ADMIN_NAV = [
<<<<<<< HEAD
  { href: '/admin/users', label: 'Users & Roles', icon: Users },
  { href: '/admin/api-keys', label: 'API Keys', icon: Key },
  { href: '/admin/security-logs', label: 'Security Logs', icon: ShieldAlert },
  { href: '/admin/deploy', label: 'Deployments', icon: Rocket },
  { href: '/admin/cluster', label: 'Cluster', icon: Server },
  { href: '/admin/observability', label: 'Observability', icon: BarChart3 },
=======
  { href: '/admin/users',         label: 'Users & Roles',   icon: Users      },
  { href: '/admin/api-keys',      label: 'API Keys',        icon: Key        },
  { href: '/admin/security-logs', label: 'Security Logs',   icon: ShieldAlert },
  { href: '/admin/deploy',        label: 'Deployments',     icon: Rocket     },
  { href: '/admin/cluster',       label: 'Cluster',         icon: Server     },
  { href: '/admin/observability', label: 'Observability',   icon: BarChart3  },
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
];

/**
 * @param {{
 *   children:    React.ReactNode,
 *   title:       string,
 *   description?: string,
 * }} props
 */
export default function AdminLayout({ children, title, description }) {
<<<<<<< HEAD
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
=======
  const router            = useRouter();
  const { theme, toggle } = useTheme();
  const [open, setOpen]   = useState(false);
  const close             = useCallback(() => setOpen(false), []);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

  return (
    <AdminGuard>
      <div className="flex h-screen overflow-hidden bg-surface">
<<<<<<< HEAD
=======

>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
        {/* Mobile overlay */}
        {open && (
          <div
            className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm lg:hidden"
            aria-hidden="true"
            onClick={close}
          />
        )}

        {/* ── Admin Sidebar ──────────────────────────────────────────── */}
        <aside
          className={clsx(
            'fixed inset-y-0 left-0 z-30 flex w-64 flex-col',
            'border-r border-border bg-surface-2 transition-transform duration-200',
            'lg:static lg:translate-x-0',
<<<<<<< HEAD
            open ? 'translate-x-0' : '-translate-x-full'
=======
            open ? 'translate-x-0' : '-translate-x-full',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
          )}
          aria-label="Admin navigation"
        >
          {/* Logo + ADMIN badge */}
          <div className="flex h-16 items-center gap-2 border-b border-border px-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600">
              <Lock className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-tight text-text-base">
                Wolf Engine
              </span>
              <span className="text-[10px] font-bold tracking-widest text-red-500 uppercase">
                Admin Panel
              </span>
            </div>
            <button
              className="ml-auto lg:hidden text-text-muted hover:text-text-base"
              onClick={close}
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Back to main app */}
          <div className="px-4 pt-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs
                         text-text-muted hover:text-text-base hover:bg-surface transition-colors"
            >
              <ChevronLeft className="h-3 w-3" aria-hidden="true" />
              Back to Dashboard
            </Link>
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Administration
            </p>
            {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
              const active = router.pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={close}
                  className={clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400'
<<<<<<< HEAD
                      : 'text-text-muted hover:bg-surface hover:text-text-base'
=======
                      : 'text-text-muted hover:bg-surface hover:text-text-base',
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Theme toggle */}
          <div className="border-t border-border p-4">
            <button
              onClick={toggle}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm
                         text-text-muted hover:bg-surface hover:text-text-base transition-colors"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
<<<<<<< HEAD
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
=======
              {theme === 'dark'
                ? <Sun  className="h-4 w-4" aria-hidden="true" />
                : <Moon className="h-4 w-4" aria-hidden="true" />}
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
          </div>
        </aside>

        {/* ── Main content ────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden">
<<<<<<< HEAD
          {/* Top bar */}
          <header
            className="flex h-16 shrink-0 items-center gap-4 border-b border-border
                             bg-surface-2 px-4 lg:px-6"
          >
=======

          {/* Top bar */}
          <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border
                             bg-surface-2 px-4 lg:px-6">
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
            <button
              className="text-text-muted hover:text-text-base lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div>
              <h1 className="text-base font-semibold text-text-base leading-tight">{title}</h1>
<<<<<<< HEAD
              {description && <p className="text-xs text-text-muted">{description}</p>}
            </div>

            {/* Admin badge */}
            <span
              className="ml-auto flex items-center gap-1.5 rounded-full
                             bg-red-100 px-2.5 py-1 text-xs font-semibold
                             text-red-600 dark:bg-red-900/30 dark:text-red-400"
            >
=======
              {description && (
                <p className="text-xs text-text-muted">{description}</p>
              )}
            </div>

            {/* Admin badge */}
            <span className="ml-auto flex items-center gap-1.5 rounded-full
                             bg-red-100 px-2.5 py-1 text-xs font-semibold
                             text-red-600 dark:bg-red-900/30 dark:text-red-400">
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
              <Lock className="h-3 w-3" aria-hidden="true" />
              Admin
            </span>
          </header>

<<<<<<< HEAD
          <main className="flex-1 overflow-y-auto p-4 lg:p-6 animate-fade-in">{children}</main>
=======
          <main className="flex-1 overflow-y-auto p-4 lg:p-6 animate-fade-in">
            {children}
          </main>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
        </div>
      </div>
    </AdminGuard>
  );
}
