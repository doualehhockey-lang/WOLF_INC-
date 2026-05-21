// frontend/pages/logs.js — Live log streaming page.
//
// Renders LogViewer wired to the Wolf Engine backend's streaming log endpoint.
// The streamFn is injected so that tests can replace it with a mock.

import Layout        from '../components/Layout.js';
import LogViewer     from '../components/LogViewer.js';
import { streamLogs } from '../lib/api.js';

export default function LogsPage() {
  return (
    <Layout
      title="Logs"
      description="Live structured log stream — Pino JSON"
    >
      <div className="space-y-4">
        <p className="text-sm text-text-muted">
          Select a component and optional log level to tail its output in real time.
          Logs auto-pause when you scroll up; click <strong>Latest</strong> to resume.
        </p>

        <LogViewer
          component="agent"
          streamFn={streamLogs}
        />
      </div>
    </Layout>
  );
}
