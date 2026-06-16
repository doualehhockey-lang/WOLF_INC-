// frontend/components/Layout.js — App shell: sidebar nav + top bar.
//
// Wraps every page.  Handles:
//   - Responsive sidebar (collapsed on mobile, expanded on desktop)
//   - Active nav-link highlighting via useRouter
//   - Dark mode toggle
//   - Page title / breadcrumb in the top bar

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  CalendarDays,
  BarChart3,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
  Menu,
  X,
  Zap,
} from 'lucide-react';
import { useTheme } from '../lib/theme.js';

/** @type {Array<{ href: string, label: string, icon: React.ComponentType }>} */
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Rendez-vous', icon: CalendarDays },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Paramètres', icon: Settings },
  { href: '/gdpr', label: 'Données & RGPD', icon: ShieldCheck },
];

/**
 * @param {{
 *   children:    React.ReactNode,
 *   title?:      string,
 *   description?: string,
 * }} props
 */
export default function Layout({ children, title = 'Wolf Engine', description }) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* ── Mobile overlay ───────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm lg:hidden"
          aria-hidden="true"
          onClick={closeSidebar}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-30 flex w-60 flex-col',
          'border-r border-border bg-surface-2 transition-transform duration-200',
          'lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        aria-label="Sidebar navigation"
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-wolf-500">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-semibold text-text-base">Wolf Agenda</span>
          {/* Close button — mobile only */}
          <button
            className="ml-auto lg:hidden text-text-muted hover:text-text-base"
            onClick={closeSidebar}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = router.pathname === href || router.pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                onClick={closeSidebar}
                className={[
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                  'transition-colors duration-150',
                  active
                    ? 'bg-wolf-500/10 text-wolf-500 dark:bg-wolf-500/20 dark:text-wolf-300'
                    : 'text-text-muted hover:bg-surface hover:text-text-base',
                ].join(' ')}
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
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="flex h-16 shrink-0 items-center gap-4 border-b border-border
                           bg-surface-2 px-4 lg:px-6"
        >
          {/* Hamburger — mobile */}
          <button
            className="text-text-muted hover:text-text-base lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex flex-col">
            <h1 className="text-base font-semibold text-text-base leading-tight">{title}</h1>
            {description && <p className="text-xs text-text-muted">{description}</p>}
          </div>

          {/* Spacer + status dot */}
          <div className="ml-auto flex items-center gap-3">
            <LiveIndicator />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 animate-fade-in">{children}</main>
      </div>
    </div>
  );
}

/** Animated green dot indicating real-time data is flowing. */
function LiveIndicator() {
  return (
    <span className="flex items-center gap-1.5 text-xs text-text-muted" aria-label="Live data">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Live
    </span>
  );
}
