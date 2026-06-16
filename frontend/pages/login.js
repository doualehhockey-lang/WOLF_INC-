// frontend/pages/login.js — API key authentication page.
// Exchanges an API key for a JWT access token via POST /auth/token.
// On success: stores token + sets session cookie → redirects to dashboard.

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { login, isAuthenticated } from '../lib/api.js';

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();

  // If already authenticated, skip login
  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard');
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('API key is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await login(apiKey.trim());
      const from = router.query.from ?? '/dashboard';
      router.push(from);
    } catch (err) {
      // Use error message from backend i18n (already translated)
      setError(err.message ?? 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-wolf-600 text-white text-2xl font-black mb-4">
            W
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Wolf Engine</h1>
          <p className="text-sm text-text-muted mt-1">Admin Dashboard</p>
        </div>

        {/* Login card */}
        <form onSubmit={handleSubmit} className="card p-6 space-y-4" data-testid="login-form">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-text-secondary mb-1">
              API Key
            </label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="wolf-key-…"
              autoComplete="current-password"
              disabled={loading}
              className="w-full border border-border rounded-lg px-3 py-2 bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-wolf-500 disabled:opacity-50"
              data-testid="api-key-input"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
              data-testid="login-error"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !apiKey.trim()}
            className="btn-primary w-full"
            data-testid="login-submit"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm text-text-muted mt-4">
          Pas encore de compte ?{' '}
          <Link href="/signup" className="text-wolf-600 hover:underline">
            S&apos;inscrire
          </Link>
        </p>

        <p className="text-center text-xs text-text-muted mt-4">Wolf Engine · Internal Admin</p>
      </div>
    </div>
  );
}
