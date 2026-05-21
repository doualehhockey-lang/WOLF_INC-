import { useState } from 'react';
import { storeToken } from '../lib/api.js';
import { useRouter } from 'next/router';

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('');
  const [err, setErr] = useState(null);
  const router = useRouter();

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    try {
      const res = await fetch('/api/wolf/auth/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      if (!res.ok) throw new Error('Auth failed');
      const body = await res.json();
      storeToken(body.accessToken);
      router.push('/admin');
    } catch (e) { setErr(e.message); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={submit} className="p-6 bg-white rounded shadow">
        <h1 className="text-xl font-bold mb-4">Admin Login</h1>
        <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="API key" className="border p-2 w-full" />
        {err && <p className="text-red-500 mt-2">{err}</p>}
        <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">Sign in</button>
      </form>
    </div>
  );
}
