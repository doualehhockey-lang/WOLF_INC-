import useSWR from 'swr';
import AdminLayout from '../../components/admin/AdminLayout.js';
import { fetchGrafanaPanels } from '../../lib/adminApi.js';

export default function ObservabilityPage() {
  const { data, error } = useSWR('/admin/observability', fetchGrafanaPanels);

  return (
    <AdminLayout title="Observability">
      <div className="p-4">
        <h1 className="text-2xl font-bold">Observability</h1>
        {error && <p className="text-red-500">Failed to load panels</p>}
        {!data && !error && <p>Loading…</p>}
        {data?.panels?.length === 0 && <p>No panels available.</p>}
        <ul className="mt-4 space-y-2">
          {data?.panels?.map(p => (
<<<<<<< HEAD
            <li key={p.id}>
              <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-600">
                {p.title}
              </a>
            </li>
=======
            <li key={p.id}><a href={p.url} target="_blank" rel="noreferrer" className="text-blue-600">{p.title}</a></li>
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
          ))}
        </ul>
      </div>
    </AdminLayout>
  );
}
