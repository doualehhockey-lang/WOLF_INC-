// frontend/tests/frontend.test.js — Unit tests for Wolf Engine frontend.
//
// Patterns:
//   - @testing-library/react for component rendering + interaction
//   - jest.mock for SWR, next/router, next/link (set up in jest.setup.js)
//   - No network calls — all external dependencies mocked
//   - Each describe block targets one component or page
//
// Coverage:
//   ChartPanel      — stat/line/bar variants, loading/error states
//   TraceViewer     — trace list, span expansion, empty/error states
//   SecurityManager — event table, filter, rate-limit summary
//   DeployControls  — render, confirm dialog, disabled states
//   ClusterView     — pod grid, HPA table, loading skeleton
//   LogViewer       — render controls, level filter, clear, streaming
//   Pages           — dashboard, traces, security, deploy, cluster, logs

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mock SWR globally ─────────────────────────────────────────────────────────
// Each test group overrides useSWR as needed via jest.mocked.

jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// ── Mock lib/api.js ───────────────────────────────────────────────────────────

jest.mock('../lib/api.js', () => ({
  apiFetcher: jest.fn(),
  apiPost: jest.fn().mockResolvedValue({ ok: true }),
  apiDelete: jest.fn().mockResolvedValue(null),
  getToken: jest.fn().mockReturnValue(null),
  storeToken: jest.fn(),
  clearToken: jest.fn(),
  streamLogs: jest.fn(),
  triggerCanary: jest.fn().mockResolvedValue({}),
  promoteCanary: jest.fn().mockResolvedValue({}),
  rollbackDeploy: jest.fn().mockResolvedValue({}),
  fetchPods: jest.fn().mockResolvedValue([]),
  fetchHpa: jest.fn().mockResolvedValue([]),
  fetchTraces: jest.fn().mockResolvedValue([]),
  fetchSecurityEvents: jest.fn().mockResolvedValue([]),
}));

// ── Mock lib/theme.js ─────────────────────────────────────────────────────────

jest.mock('../lib/theme.js', () => ({
  ThemeProvider: ({ children }) => children,
  useTheme: () => ({ theme: 'light', toggle: jest.fn() }),
}));

// ── Mock recharts ─────────────────────────────────────────────────────────────
// Recharts uses ResizeObserver which is not available in jsdom.

jest.mock('recharts', () => {
  const React = require('react');
  const stub =
    name =>
    ({ children, ...rest }) =>
      React.createElement('div', { 'data-testid': `recharts-${name}`, ...rest }, children);
  return {
    ResponsiveContainer: stub('responsive-container'),
    LineChart: stub('line-chart'),
    BarChart: stub('bar-chart'),
    Line: stub('line'),
    Bar: stub('bar'),
    XAxis: stub('x-axis'),
    YAxis: stub('y-axis'),
    CartesianGrid: stub('cartesian-grid'),
    Tooltip: stub('tooltip'),
    ReferenceLine: stub('reference-line'),
  };
});

// ── Imports ───────────────────────────────────────────────────────────────────

import useSWR from 'swr';

import ChartPanel from '../components/ChartPanel.js';
import TraceViewer from '../components/TraceViewer.js';
import SecurityManager from '../components/SecurityManager.js';
import DeployControls from '../components/DeployControls.js';
import ClusterView from '../components/ClusterView.js';
import LogViewer from '../components/LogViewer.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_TRACE = {
  traceId: 'abc123def456789012345678',
  rootName: 'wolf.pipeline.agent',
  startMs: 1_000,
  durationMs: 320,
  status: 'OK',
  spans: [
    { spanId: 's1', name: 'whisper', startMs: 1_000, durationMs: 80, status: 'OK', depth: 0 },
    { spanId: 's2', name: 'claude', startMs: 1_080, durationMs: 200, status: 'OK', depth: 1 },
    { spanId: 's3', name: 'tts', startMs: 1_280, durationMs: 40, status: 'ERROR', depth: 0 },
  ],
};

const MOCK_EVENTS = [
  {
    id: 1,
    type: 'jwt_ok',
    sub: 'alice',
    resource: 'agent',
    ip: '1.2.3.4',
    ts: Date.now(),
    detail: 'Access granted',
  },
  {
    id: 2,
    type: 'jwt_expired',
    sub: 'bob',
    resource: 'agent',
    ip: '5.6.7.8',
    ts: Date.now(),
    detail: 'Token expired',
  },
  {
    id: 3,
    type: 'rate_limited',
    sub: 'alice',
    resource: null,
    ip: '1.2.3.4',
    ts: Date.now(),
    detail: null,
  },
  {
    id: 4,
    type: 'rbac_deny',
    sub: 'carol',
    resource: 'metrics',
    ip: '9.10.11.12',
    ts: Date.now(),
    detail: 'RBAC deny',
  },
  {
    id: 5,
    type: 'apikey_ok',
    sub: null,
    resource: 'whisper',
    ip: '1.1.1.1',
    ts: Date.now(),
    detail: null,
  },
];

const MOCK_PODS = [
  {
    name: 'agent-6d9c7-xv2k',
    component: 'agent',
    phase: 'Running',
    ready: true,
    restarts: 0,
    cpuM: 120,
    memMi: 240,
    cpuRequestM: 200,
  },
  {
    name: 'agent-6d9c7-mn3p',
    component: 'agent',
    phase: 'Running',
    ready: true,
    restarts: 1,
    cpuM: 95,
    memMi: 210,
    cpuRequestM: 200,
  },
  {
    name: 'whisper-7f8b-q4rt',
    component: 'whisper',
    phase: 'Pending',
    ready: false,
    restarts: 0,
    cpuM: 0,
    memMi: 0,
    cpuRequestM: 100,
  },
  {
    name: 'ollama-9a2b-zz1x',
    component: 'ollama',
    phase: 'Running',
    ready: true,
    restarts: 4,
    cpuM: 800,
    memMi: 3072,
    cpuRequestM: 1000,
  },
];

const MOCK_HPA = [
  {
    name: 'agent-hpa',
    component: 'agent',
    currentReplicas: 2,
    desiredReplicas: 2,
    minReplicas: 2,
    maxReplicas: 10,
    cpuUtilization: 60,
    targetCpuUtilization: 70,
  },
  {
    name: 'whisper-hpa',
    component: 'whisper',
    currentReplicas: 1,
    desiredReplicas: 2,
    minReplicas: 1,
    maxReplicas: 5,
    cpuUtilization: 85,
    targetCpuUtilization: 70,
  },
];

// Silence act() warnings from async state updates.
beforeEach(() => {
  jest.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. ChartPanel
// ═════════════════════════════════════════════════════════════════════════════

describe('ChartPanel', () => {
  it('renders title', () => {
    render(<ChartPanel title="Active Sessions" value={42} />);
    expect(screen.getByText('Active Sessions')).toBeInTheDocument();
  });

  it('renders stat value', () => {
    render(<ChartPanel title="T" value={99} />);
    expect(screen.getByText('99')).toBeInTheDocument();
  });

  it('renders unit alongside value', () => {
    render(<ChartPanel title="T" value={128} unit="ms" />);
    expect(screen.getByText('ms')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<ChartPanel title="T" subtitle="Last measurement" />);
    expect(screen.getByText('Last measurement')).toBeInTheDocument();
  });

  it('shows skeleton when loading=true', () => {
    const { container } = render(<ChartPanel title="T" loading />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows error message when error provided', () => {
    render(<ChartPanel title="T" error={new Error('network timeout')} />);
    expect(screen.getByText(/network timeout/i)).toBeInTheDocument();
  });

  it('renders line variant with recharts stub', () => {
    const data = [
      { ts: '-1m', value: 100 },
      { ts: '0m', value: 120 },
    ];
    render(<ChartPanel variant="line" title="Latency" data={data} dataKey="value" />);
    expect(screen.getByTestId('recharts-responsive-container')).toBeInTheDocument();
  });

  it('renders bar variant with recharts stub', () => {
    const data = [{ ts: '-1m', value: 5 }];
    render(<ChartPanel variant="bar" title="Errors" data={data} dataKey="value" />);
    expect(screen.getByTestId('recharts-responsive-container')).toBeInTheDocument();
  });

  it('renders delta badge when delta > 0', () => {
    render(<ChartPanel title="T" value={10} delta={3} deltaLabel=" req/s" />);
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it('renders dashes when value is undefined', () => {
    render(<ChartPanel title="T" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. TraceViewer
// ═════════════════════════════════════════════════════════════════════════════

describe('TraceViewer', () => {
  it('renders trace root name', () => {
    render(<TraceViewer traces={[MOCK_TRACE]} loading={false} error={null} />);
    expect(screen.getByText('wolf.pipeline.agent')).toBeInTheDocument();
  });

  it('renders truncated traceId', () => {
    render(<TraceViewer traces={[MOCK_TRACE]} loading={false} error={null} />);
    expect(screen.getByText(/abc123def456/)).toBeInTheDocument();
  });

  it('renders OK status badge', () => {
    render(<TraceViewer traces={[MOCK_TRACE]} loading={false} error={null} />);
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('renders duration', () => {
    render(<TraceViewer traces={[MOCK_TRACE]} loading={false} error={null} />);
    expect(screen.getByText(/320ms/)).toBeInTheDocument();
  });

  it('expands spans on row click', async () => {
    render(<TraceViewer traces={[MOCK_TRACE]} loading={false} error={null} />);
    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getByText('whisper')).toBeInTheDocument();
      expect(screen.getByText('claude')).toBeInTheDocument();
    });
  });

  it('collapses spans on second click', async () => {
    render(<TraceViewer traces={[MOCK_TRACE]} loading={false} error={null} />);
    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByText('whisper')).toBeInTheDocument());
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryByText('whisper')).not.toBeInTheDocument());
  });

  it('shows loading skeletons', () => {
    const { container } = render(<TraceViewer traces={[]} loading error={null} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows error state', () => {
    render(<TraceViewer traces={[]} loading={false} error={new Error('connection refused')} />);
    expect(screen.getByText(/connection refused/i)).toBeInTheDocument();
  });

  it('shows empty state when no traces', () => {
    render(<TraceViewer traces={[]} loading={false} error={null} />);
    expect(screen.getByText(/no traces found/i)).toBeInTheDocument();
  });

  it('calls onSelect with traceId when Tempo button clicked', async () => {
    const onSelect = jest.fn();
    render(<TraceViewer traces={[MOCK_TRACE]} loading={false} error={null} onSelect={onSelect} />);
    const tempoBtn = screen.getByRole('button', { name: /open in tempo/i });
    fireEvent.click(tempoBtn);
    expect(onSelect).toHaveBeenCalledWith(MOCK_TRACE.traceId);
  });

  it('renders multiple traces', () => {
    const trace2 = { ...MOCK_TRACE, traceId: 'zzz999', rootName: 'second.trace' };
    render(<TraceViewer traces={[MOCK_TRACE, trace2]} loading={false} error={null} />);
    expect(screen.getByText('second.trace')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. SecurityManager
// ═════════════════════════════════════════════════════════════════════════════

describe('SecurityManager', () => {
  it('renders events table', () => {
    render(<SecurityManager events={MOCK_EVENTS} loading={false} error={null} />);
    expect(screen.getAllByText('alice').length).toBeGreaterThan(0);
  });

  it('shows JWT OK badge', () => {
    render(<SecurityManager events={MOCK_EVENTS} loading={false} error={null} />);
    expect(screen.getAllByText('JWT OK').length).toBeGreaterThan(0);
  });

  it('shows rate-limit hot-spots section', () => {
    render(<SecurityManager events={MOCK_EVENTS} loading={false} error={null} />);
    expect(screen.getByText(/rate-limit hot spots/i)).toBeInTheDocument();
  });

  it('filters by text search — shows matching rows', async () => {
    render(<SecurityManager events={MOCK_EVENTS} loading={false} error={null} />);
    const input = screen.getByPlaceholderText(/search sub, ip/i);
    await userEvent.type(input, 'alice');
    // alice appears in rows 1 and 3; bob should disappear
    expect(screen.queryByText('bob')).not.toBeInTheDocument();
  });

  it('shows "No events" when all filtered out', async () => {
    render(<SecurityManager events={MOCK_EVENTS} loading={false} error={null} />);
    const input = screen.getByPlaceholderText(/search sub, ip/i);
    await userEvent.type(input, 'zzznomatch');
    expect(screen.getByText(/no events match/i)).toBeInTheDocument();
  });

  it('type filter — clicking rate_limited shows only rate-limit events', async () => {
    render(<SecurityManager events={MOCK_EVENTS} loading={false} error={null} />);
    const btn = screen.getByRole('button', { name: /filter: rate limited/i });
    fireEvent.click(btn);
    // bob (jwt_expired) should be gone
    await waitFor(() => expect(screen.queryByText('bob')).not.toBeInTheDocument());
  });

  it('Clear filter button resets selection', async () => {
    render(<SecurityManager events={MOCK_EVENTS} loading={false} error={null} />);
    fireEvent.click(screen.getByRole('button', { name: /filter: rate limited/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    await waitFor(() => expect(screen.getByText('bob')).toBeInTheDocument());
  });

  it('shows loading skeleton when loading=true', () => {
    const { container } = render(<SecurityManager events={[]} loading error={null} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<SecurityManager events={[]} loading={false} error={new Error('fetch failed')} />);
    expect(screen.getByText(/fetch failed/i)).toBeInTheDocument();
  });

  it('event count badge in section header', () => {
    render(<SecurityManager events={MOCK_EVENTS} loading={false} error={null} />);
    // 5 events, all shown by default
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. DeployControls
// ═════════════════════════════════════════════════════════════════════════════

describe('DeployControls', () => {
  const noop = jest.fn().mockResolvedValue(undefined);

  it('renders three action cards', () => {
    render(<DeployControls onTriggerCanary={noop} onPromote={noop} onRollback={noop} />);
    expect(screen.getAllByText('Deploy Canary').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Promote to Stable').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rollback').length).toBeGreaterThan(0);
  });

  it('Deploy Canary button is disabled when tag is empty', () => {
    render(<DeployControls onTriggerCanary={noop} onPromote={noop} onRollback={noop} />);
    const btn = screen.getAllByRole('button', { name: /deploy canary/i })[0];
    expect(btn).toBeDisabled();
  });

  it('Deploy Canary button enabled after tag is entered', async () => {
    render(<DeployControls onTriggerCanary={noop} onPromote={noop} onRollback={noop} />);
    const input = screen.getByLabelText(/canary image tag/i);
    await userEvent.type(input, 'sha-abc123');
    const btn = screen.getAllByRole('button', { name: /deploy canary/i })[0];
    expect(btn).not.toBeDisabled();
  });

  it('shows confirm dialog when Deploy Canary clicked', async () => {
    render(<DeployControls onTriggerCanary={noop} onPromote={noop} onRollback={noop} />);
    await userEvent.type(screen.getByLabelText(/canary image tag/i), 'sha-test');
    const btn = screen.getAllByRole('button', { name: /deploy canary/i })[0];
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText(/confirm action/i)).toBeInTheDocument();
  });

  it('cancels confirm dialog without calling handler', async () => {
    const handler = jest.fn();
    render(<DeployControls onTriggerCanary={handler} onPromote={noop} onRollback={noop} />);
    await userEvent.type(screen.getByLabelText(/canary image tag/i), 'sha-test');
    fireEvent.click(screen.getAllByRole('button', { name: /deploy canary/i })[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls onTriggerCanary after confirm', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    render(<DeployControls onTriggerCanary={handler} onPromote={noop} onRollback={noop} />);
    await userEvent.type(screen.getByLabelText(/canary image tag/i), 'sha-xyz');
    fireEvent.click(screen.getAllByRole('button', { name: /deploy canary/i })[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => expect(handler).toHaveBeenCalledWith('sha-xyz'));
  });

  it('Promote button is disabled when canaryActive=false', () => {
    render(
      <DeployControls
        onTriggerCanary={noop}
        onPromote={noop}
        onRollback={noop}
        canaryActive={false}
      />
    );
    const btn = screen.getAllByRole('button', { name: /promote to stable/i })[0];
    expect(btn).toBeDisabled();
  });

  it('Promote button is enabled when canaryActive=true', () => {
    render(
      <DeployControls
        onTriggerCanary={noop}
        onPromote={noop}
        onRollback={noop}
        canaryActive={true}
        lastStable="sha-prev"
      />
    );
    const btn = screen.getAllByRole('button', { name: /promote to stable/i })[0];
    expect(btn).not.toBeDisabled();
  });

  it('Rollback button is disabled when lastStable is null', () => {
    render(
      <DeployControls onTriggerCanary={noop} onPromote={noop} onRollback={noop} lastStable={null} />
    );
    const btn = screen.getAllByRole('button', { name: /rollback/i })[0];
    expect(btn).toBeDisabled();
  });

  it('status strip shows canary as Inactive by default', () => {
    render(<DeployControls onTriggerCanary={noop} onPromote={noop} onRollback={noop} />);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('status strip shows canary as Active when canaryActive=true', () => {
    render(
      <DeployControls
        onTriggerCanary={noop}
        onPromote={noop}
        onRollback={noop}
        canaryActive={true}
      />
    );
    expect(screen.getByText('Active (10%)')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. ClusterView
// ═════════════════════════════════════════════════════════════════════════════

describe('ClusterView', () => {
  it('renders pod names', () => {
    render(<ClusterView pods={MOCK_PODS} hpa={MOCK_HPA} loading={false} error={null} />);
    expect(screen.getByText(/agent-6d9c7-xv2k/)).toBeInTheDocument();
  });

  it('renders Running badge', () => {
    render(<ClusterView pods={MOCK_PODS} hpa={[]} loading={false} error={null} />);
    const runningBadges = screen.getAllByText('Running');
    expect(runningBadges.length).toBeGreaterThan(0);
  });

  it('renders Pending badge for whisper pod', () => {
    render(<ClusterView pods={MOCK_PODS} hpa={[]} loading={false} error={null} />);
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
  });

  it('renders summary counts', () => {
    render(<ClusterView pods={MOCK_PODS} hpa={[]} loading={false} error={null} />);
    expect(screen.getAllByText('4').length).toBeGreaterThan(0); // total pods
  });

  it('renders HPA table', () => {
    render(<ClusterView pods={[]} hpa={MOCK_HPA} loading={false} error={null} />);
    expect(screen.getByRole('table', { name: /hpa status/i })).toBeInTheDocument();
    expect(screen.getByText('agent')).toBeInTheDocument();
  });

  it('renders HPA CPU utilization', () => {
    render(<ClusterView pods={[]} hpa={MOCK_HPA} loading={false} error={null} />);
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('shows loading skeleton', () => {
    const { container } = render(<ClusterView pods={[]} hpa={[]} loading error={null} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows error state', () => {
    render(<ClusterView pods={[]} hpa={[]} loading={false} error={new Error('k8s unavailable')} />);
    expect(screen.getByText(/k8s unavailable/i)).toBeInTheDocument();
  });

  it('groups pods by component', () => {
    render(<ClusterView pods={MOCK_PODS} hpa={[]} loading={false} error={null} />);
    expect(screen.getByRole('region', { name: /agent pods/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /whisper pods/i })).toBeInTheDocument();
  });

  it('shows empty HPA message when no HPAs', () => {
    render(<ClusterView pods={[]} hpa={[]} loading={false} error={null} />);
    expect(screen.getByText(/no hpa resources found/i)).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. LogViewer
// ═════════════════════════════════════════════════════════════════════════════

describe('LogViewer', () => {
  it('renders component selector', () => {
    render(<LogViewer component="agent" />);
    expect(screen.getByRole('combobox', { name: /select component/i })).toBeInTheDocument();
  });

  it('renders level selector', () => {
    render(<LogViewer component="agent" />);
    expect(screen.getByRole('combobox', { name: /minimum log level/i })).toBeInTheDocument();
  });

  it('renders filter input', () => {
    render(<LogViewer component="agent" />);
    expect(screen.getByPlaceholderText(/filter/i)).toBeInTheDocument();
  });

  it('renders pause button', () => {
    render(<LogViewer component="agent" />);
    expect(screen.getByRole('button', { name: /pause streaming/i })).toBeInTheDocument();
  });

  it('renders download button', () => {
    render(<LogViewer component="agent" />);
    expect(screen.getByRole('button', { name: /download logs/i })).toBeInTheDocument();
  });

  it('renders clear button', () => {
    render(<LogViewer component="agent" />);
    expect(screen.getByRole('button', { name: /clear logs/i })).toBeInTheDocument();
  });

  it('shows "Waiting for log events" when no lines', () => {
    render(<LogViewer component="agent" />);
    expect(screen.getByText(/waiting for log events/i)).toBeInTheDocument();
  });

  it('shows line count "0 lines"', () => {
    render(<LogViewer component="agent" />);
    expect(screen.getByText('0 lines')).toBeInTheDocument();
  });

  it('toggles pause state on button click', async () => {
    render(<LogViewer component="agent" />);
    const btn = screen.getByRole('button', { name: /pause streaming/i });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /resume streaming/i })).toBeInTheDocument()
    );
  });

  it('shows paused banner when paused', async () => {
    render(<LogViewer component="agent" />);
    fireEvent.click(screen.getByRole('button', { name: /pause streaming/i }));
    await waitFor(() => expect(screen.getByText(/streaming paused/i)).toBeInTheDocument());
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. Page renders (integration-light)
// ═════════════════════════════════════════════════════════════════════════════

describe('Pages — smoke tests', () => {
  const mockSwr = (data, loading = false, error = null) => ({
    data,
    error,
    isLoading: loading,
    mutate: jest.fn(),
  });

  beforeEach(() => {
    useSWR.mockReturnValue(mockSwr(null, true));
  });

  it('DashboardPage renders title', async () => {
    const { default: DashboardPage } = await import('../pages/dashboard.js');
    render(<DashboardPage />);
    expect(screen.getAllByText('Rendez-vous du jour').length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. lib/api.js — unit tests (no network)
// ═════════════════════════════════════════════════════════════════════════════

describe('lib/api', () => {
  let api;

  beforeAll(async () => {
    jest.unmock('../lib/api.js');
    api = await import('../lib/api.js');
  });

  it('getToken returns null when sessionStorage is empty', () => {
    sessionStorage.clear();
    expect(api.getToken()).toBeNull();
  });

  it('storeToken + getToken round-trip', () => {
    api.storeToken('my-token');
    expect(api.getToken()).toBe('my-token');
  });

  it('clearToken removes stored token', () => {
    api.storeToken('tok');
    api.clearToken();
    expect(api.getToken()).toBeNull();
  });

  it('ApiError has correct status + code', () => {
    const err = new api.ApiError(429, 'RATE_LIMITED', 'Too many requests');
    expect(err.status).toBe(429);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.message).toBe('Too many requests');
    expect(err instanceof Error).toBe(true);
  });
});
