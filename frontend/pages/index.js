// frontend/pages/index.js — Redirect root to /dashboard.
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function IndexPage() {
  const router = useRouter();
<<<<<<< HEAD
  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);
=======
  useEffect(() => { router.replace('/dashboard'); }, [router]);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
  return null;
}
