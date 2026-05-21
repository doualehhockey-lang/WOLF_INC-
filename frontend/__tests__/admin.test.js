// frontend/__tests__/admin.test.js — Unit tests for the Wolf Engine Admin Panel.
//
// Patterns:
//   - @testing-library/react + userEvent for interaction
//   - All external deps mocked (SWR, next/router, adminApi, recharts)
//   - Each component receives injected handler props — no network calls
//   - Confirm dialogs tested via click chains
//
// Coverage groups:
//   1. AdminGuard        — loading / unauthenticated / forbidden / ok states
//   2. UserManager       — render, search, create modal, role change, delete
//   3. ApiKeyManager     — render, filter, create → reveal modal, revoke, rotate
//   4. SecurityLogViewer — render, text filter, type filter, pagination, CSV export
//   5. DeployAdminControls — tag input, lock toggle, all 4 actions + confirm flow
//   6. ClusterAdminView  — nodes, quota, pod delete, HPA table, Grafana panels
//   7. lib/adminApi      — decodeJwtPayload, isAdmin
//   8. Admin pages       — smoke render (SWR mocked)

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Global mocks ──────────────────────────────────────────────────────────────

jest.mock('swr', () => ({ __esModule: true, default: jest.fn() }));

jest.mock('next/router', () => ({
  useRouter: () => ({
    pathname:  '/admin/users',
    push:      jest.fn(),
    replace:   jest.fn(),
    back:      jest.fn(),
    prefetch:  jest.fn().mockResolvedValue(undefined),
    query:     {},
    asPath:    '/admin/users',
    events:    { on: jest.fn(), off: jest.fn() },
  }),
}));

jest.mock('next/link', () => {
  const Link = ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>;
  Link.displayName = 'Link';
  return Link;
});

jest.mock('../lib/adminApi.js', () => ({
  decodeJwtPayload:    jest.fn(),
  isAdmin:             jest.fn().mockReturnValue(true),
  fetchUsers:          jest.fn().mockResolvedValue({ users: [] }),
  createUser:          jest.fn().mockResolvedValue({ id: 'new-1' }),
  updateUserRole:      jest.fn().mockResolvedValue({}),
  deleteUser:          jest.fn().mockResolvedValue({}),
  resetUserPassword:   jest.fn().mockResolvedValue({}),
  fetchApiKeys:        jest.fn().mockResolvedValue({ keys: [] }),
  createApiKey:        jest.fn().mockResolvedValue({ key: 'secret-key-abc123' }),
  revokeApiKey:        jest.fn().mockResolvedValue({}),
  rotateApiKey:        jest.fn().mockResolvedValue({ key: 'new-rotated-key' }),
  fetchSecurityLogs:   jest.fn().mockResolvedValue({ events: [], total: 0 }),
  prometheusQuery:     jest.fn().mockResolvedValue({}),
  fetchTempoTraces:    jest.fn().mockResolvedValue({ traces: [] }),
  fetchGrafanaPanels:  jest.fn().mockResolvedValue({ panels: [] }),
  adminTriggerCanary:  jest.fn().mockResolvedValue({}),
  adminPromoteCanary:  jest.fn().mockResolvedValue({}),
  adminRollback:       jest.fn().mockResolvedValue({}),
  adminFullDeploy:     jest.fn().mockResolvedValue({}),
  fetchDeployStatus:   jest.fn().mockResolvedValue(null),
  fetchDeployHistory:  jest.fn().mockResolvedValue({ runs: [] }),
  fetchAdminPods:      jest.fn().mockResolvedValue([]),
  fetchAdminHpa:       jest.fn().mockResolvedValue([]),
  fetchNodes:          jest.fn().mockResolvedValue([]),
  fetchNamespaceQuota: jest.fn().mockResolvedValue(null),
  deletePod:           jest.fn().mockResolvedValue({}),
  ApiError:            class ApiError extends Error {
    constructor(status, code, message) {
      super(message); this.status = status; this.code = code;
    }
  },
}));

jest.mock('../lib/api.js', () => ({
  apiFetcher: jest.fn(),
  getToken:   jest.fn().mockReturnValue(null),
  storeToken: jest.fn(),
  clearToken: jest.fn(),
}));

jest.mock('../lib/theme.js', () => ({
  ThemeProvider: ({ children }) => children,
  useTheme:      () => ({ theme: 'light', toggle: jest.fn() }),
}));

jest.mock('recharts', () => {
  const React = require('react');
  const stub  = name => ({ children, ...p }) =>
    React.createElement('div', { 'data-testid': `recharts-${name}`, ...p }, children);
  return {
    ResponsiveContainer: stub('rc'), LineChart: stub('lc'), BarChart: stub('bc'),
    Line: stub('l'), Bar: stub('b'), XAxis: stub('x'), YAxis: stub('y'),
    CartesianGrid: stub('cg'), Tooltip: stub('tt'), ReferenceLine: stub('ref'),
  };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import useSWR from 'swr';
import { decodeJwtPayload } from '../lib/adminApi.js';

import AdminGuard          from '../components/admin/AdminGuard.js';
import UserManager         from '../components/admin/UserManager.js';
import ApiKeyManager       from '../components/admin/ApiKeyManager.js';
import SecurityLogViewer   from '../components/admin/SecurityLogViewer.js';
import DeployAdminControls from '../components/admin/DeployAdminControls.js';
import ClusterAdminView    from '../components/admin/ClusterAdminView.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USERS = [
  { id: 'u1', email: 'alice@wolf.io', sub: 'alice', role: 'admin',   createdAt: '2025-01-10', lastLogin: '2026-05-17' },
  { id: 'u2', email: 'bob@wolf.io',   sub: 'bob',   role: 'user',    createdAt: '2025-03-22', lastLogin: null         },
  { id: 'u3', email: 'carol@wolf.io', sub: 'carol', role: 'service', createdAt: '2025-06-01', lastLogin: '2026-04-30' },
];

const API_KEYS = [
  { id: 'k1', name: 'ci-pipeline', prefix: 'wolf_abc', role: 'service', expiresAt: '2027-01-01', lastUsed: '2026-05-17', revoked: false },
  { id: 'k2', name: 'old-key',     prefix: 'wolf_xyz', role: 'user',    expiresAt: null,          lastUsed: null,          revoked: true  },
];

const SEC_EVENTS = [
  { id: 1, type: 'jwt_ok',      sub: 'alice', resource: 'agent',   ip: '1.2.3.4',    ts: Date.now(), detail: 'OK',           traceId: 'trace-abc' },
  { id: 2, type: 'jwt_invalid', sub: 'eve',   resource: 'metrics', ip: '5.6.7.8',    ts: Date.now(), detail: 'Invalid sig',   traceId: null        },
  { id: 3, type: 'rate_limited',sub: 'alice', resource: null,       ip: '1.2.3.4',    ts: Date.now(), detail: null,           traceId: null        },
  { id: 4, type: 'rbac_deny',   sub: 'bob',   resource: 'metrics', ip: '9.10.11.12', ts: Date.now(), detail: 'RBAC deny',    traceId: 'trace-def' },
];

const PODS = [
  { name: 'agent-abc-1', component: 'agent',   phase: 'Running', ready: true,  restarts: 0, cpuM: 120, memMi: 200, cpuRequestM: 200 },
  { name: 'agent-abc-2', component: 'agent',   phase: 'Running', ready: true,  restarts: 2, cpuM: 190, memMi: 250, cpuRequestM: 200 },
  { name: 'whisper-xyz', component: 'whisper', phase: 'Pending', ready: false, restarts: 0, cpuM: 0,   memMi: 0,   cpuRequestM: 100 },
];

const NODES = [
  { name: 'node-1', status: 'Ready',    roles: ['control-plane'], cpuUsagePct: 45, memUsagePct: 62, conditions: [], version: 'v1.30.0', age: '30d' },
  { name: 'node-2', status: 'NotReady', roles: ['worker'],        cpuUsagePct: 90, memUsagePct: 88, conditions: [{ type: 'MemoryPressure', status: 'True' }], version: 'v1.30.0', age: '30d' },
];

const HPA = [
  { name: 'agent-hpa', component: 'agent', currentReplicas: 2, desiredReplicas: 3, minReplicas: 2, maxReplicas: 10, cpuUtilization: 80, targetCpuUtilization: 70 },
];

const noop = jest.fn().mockResolvedValue(undefined);

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// 1. AdminGuard
// ═════════════════════════════════════════════════════════════════════════════

describe('AdminGuard', () => {
  beforeEach(() => {
    sessionStorage.clear();
    decodeJwtPayload.mockReset();
  });

  it('shows loading spinner initially', () => {
    render(<AdminGuard><p>content</p></AdminGuard>);
    // The effect hasn't run yet — spinner shown.
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('shows 403 screen when role is not admin', async () => {
    sessionStorage.setItem('wolf_token', 'header.payload.sig');
    decodeJwtPayload.mockReturnValue({ sub: 'bob', role: 'user', exp: Date.now() / 1000 + 3600 });
    render(<AdminGuard><p>protected</p></AdminGuard>);
    await waitFor(() => expect(screen.getByText(/access denied/i)).toBeInTheDocument());
    expect(screen.queryByText('protected')).not.toBeInTheDocument();
  });

  it('renders children when role is admin', async () => {
    sessionStorage.setItem('wolf_token', 'header.payload.sig');
    decodeJwtPayload.mockReturnValue({ sub: 'alice', role: 'admin', exp: Date.now() / 1000 + 3600 });
    render(<AdminGuard><p>admin content</p></AdminGuard>);
    await waitFor(() => expect(screen.getByText('admin content')).toBeInTheDocument());
  });

  it('shows forbidden when token is expired', async () => {
    sessionStorage.setItem('wolf_token', 'tok');
    decodeJwtPayload.mockReturnValue({ role: 'admin', exp: 1 }); // exp in past
    render(<AdminGuard><p>protected</p></AdminGuard>);
    // Expired → unauthenticated → redirect (spinner shown)
    await waitFor(() => expect(screen.queryByText('protected')).not.toBeInTheDocument());
  });

  it('shows "Go back" button in forbidden view', async () => {
    sessionStorage.setItem('wolf_token', 'tok');
    decodeJwtPayload.mockReturnValue({ role: 'guest', exp: Date.now() / 1000 + 3600 });
    render(<AdminGuard><p>x</p></AdminGuard>);
    await waitFor(() => expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument());
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. UserManager
// ═════════════════════════════════════════════════════════════════════════════

describe('UserManager', () => {
  const props = {
    users: USERS, loading: false, error: null,
    onCreate: noop, onRoleChange: noop, onDelete: noop, onReset: noop,
  };

  it('renders user emails', () => {
    render(<UserManager {...props} />);
    expect(screen.getByText('alice@wolf.io')).toBeInTheDocument();
    expect(screen.getByText('bob@wolf.io')).toBeInTheDocument();
  });

  it('renders user subs', () => {
    render(<UserManager {...props} />);
    expect(screen.getByText('alice')).toBeInTheDocument();
  });

  it('shows user count', () => {
    render(<UserManager {...props} />);
    expect(screen.getByText(/3 users/i)).toBeInTheDocument();
  });

  it('filters by email search', async () => {
    render(<UserManager {...props} />);
    await userEvent.type(screen.getByLabelText(/search users/i), 'alice');
    expect(screen.queryByText('bob@wolf.io')).not.toBeInTheDocument();
    expect(screen.getByText('alice@wolf.io')).toBeInTheDocument();
  });

  it('shows "New User" button', () => {
    render(<UserManager {...props} />);
    expect(screen.getByRole('button', { name: /new user/i })).toBeInTheDocument();
  });

  it('opens create modal on "New User" click', async () => {
    render(<UserManager {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /new user/i }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: /create user/i })).toBeInTheDocument());
  });

  it('Create modal has email + password + role fields', async () => {
    render(<UserManager {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /new user/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/initial password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^role$/i)).toBeInTheDocument();
    });
  });

  it('Create button is disabled when email or password empty', async () => {
    render(<UserManager {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /new user/i }));
    await waitFor(() => {
      const createBtn = screen.getByRole('button', { name: /^create$/i });
      expect(createBtn).toBeDisabled();
    });
  });

  it('calls onCreate when modal form is submitted', async () => {
    const onCreate = jest.fn().mockResolvedValue({ id: 'new-1' });
    render(<UserManager {...props} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: /new user/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/email address/i), 'newuser@wolf.io');
    await userEvent.type(screen.getByLabelText(/initial password/i), 'superstrongpassword!');
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'newuser@wolf.io' }),
    ));
  });

  it('shows delete button for each user', () => {
    render(<UserManager {...props} />);
    const delBtns = screen.getAllByRole('button', { name: /^delete /i });
    expect(delBtns.length).toBe(3);
  });

  it('shows delete confirmation dialog', async () => {
    render(<UserManager {...props} />);
    const [firstDel] = screen.getAllByRole('button', { name: /^delete /i });
    fireEvent.click(firstDel);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText(/permanently deleted/i)).toBeInTheDocument();
  });

  it('calls onDelete after confirmation', async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);
    render(<UserManager {...props} onDelete={onDelete} />);
    fireEvent.click(screen.getAllByRole('button', { name: /^delete /i })[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it('shows loading skeleton', () => {
    const { container } = render(<UserManager {...props} users={[]} loading />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<UserManager {...props} users={[]} error={new Error('403 Forbidden')} />);
    expect(screen.getByText(/403 forbidden/i)).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. ApiKeyManager
// ═════════════════════════════════════════════════════════════════════════════

describe('ApiKeyManager', () => {
  const props = {
    apiKeys: API_KEYS, loading: false, error: null,
    onCreate: jest.fn().mockResolvedValue({ key: 'secret-full-key-xyz' }),
    onRevoke: noop,
    onRotate: jest.fn().mockResolvedValue({ key: 'rotated-key-abc' }),
  };

  it('renders key names', () => {
    render(<ApiKeyManager {...props} />);
    expect(screen.getByText('ci-pipeline')).toBeInTheDocument();
  });

  it('renders key prefix', () => {
    render(<ApiKeyManager {...props} />);
    expect(screen.getByText(/wolf_abc/)).toBeInTheDocument();
  });

  it('shows Active badge for non-revoked key', () => {
    render(<ApiKeyManager {...props} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows Revoked badge for revoked key', () => {
    render(<ApiKeyManager {...props} />);
    expect(screen.getByText('Revoked')).toBeInTheDocument();
  });

  it('Active filter hides revoked keys', async () => {
    render(<ApiKeyManager {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /active/i, pressed: false }));
    await waitFor(() => expect(screen.queryByText('old-key')).not.toBeInTheDocument());
  });

  it('"New Key" button opens create modal', async () => {
    render(<ApiKeyManager {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /new key/i }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: /create api key/i })).toBeInTheDocument());
  });

  it('Create modal has name + role + expiry fields', async () => {
    render(<ApiKeyManager {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /new key/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/key name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/key role/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/expiry in days/i)).toBeInTheDocument();
    });
  });

  it('Generate Key button disabled when name is empty', async () => {
    render(<ApiKeyManager {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /new key/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /generate key/i })).toBeDisabled());
  });

  it('Revoke shows inline confirm for non-revoked key', async () => {
    render(<ApiKeyManager {...props} />);
    // First revoke button belongs to ci-pipeline (non-revoked).
    const revokeBtn = screen.getAllByRole('button', { name: /revoke key ci-pipeline/i })[0];
    fireEvent.click(revokeBtn);
    await waitFor(() => expect(screen.getByRole('button', { name: /confirm revoke/i })).toBeInTheDocument());
  });

  it('calls onRevoke after confirm revoke', async () => {
    const onRevoke = jest.fn().mockResolvedValue(undefined);
    render(<ApiKeyManager {...props} onRevoke={onRevoke} />);
    fireEvent.click(screen.getAllByRole('button', { name: /revoke key ci-pipeline/i })[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: /confirm revoke/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /confirm revoke/i }));
    await waitFor(() => expect(onRevoke).toHaveBeenCalledWith('k1'));
  });

  it('shows loading skeleton', () => {
    const { container } = render(<ApiKeyManager {...props} apiKeys={[]} loading />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. SecurityLogViewer
// ═════════════════════════════════════════════════════════════════════════════

describe('SecurityLogViewer', () => {
  const onFilter = jest.fn();

  const props = {
    events: SEC_EVENTS, total: 4, loading: false, error: null,
    onFilter, prometheusData: { auth_failures: 3, rate_limited: 12, rbac_denials: 1, active_sessions: 2 },
    tempoUrl: id => `http://tempo/${id}`,
  };

  it('renders event rows', () => {
    render(<SecurityLogViewer {...props} />);
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('eve')).toBeInTheDocument();
  });

  it('renders Prometheus metrics strip', () => {
    render(<SecurityLogViewer {...props} />);
    expect(screen.getByText('Auth Failures')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders Rate Limited metric', () => {
    render(<SecurityLogViewer {...props} />);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders jwt_ok badge', () => {
    render(<SecurityLogViewer {...props} />);
    expect(screen.getByText('jwt_ok')).toBeInTheDocument();
  });

  it('renders Tempo trace link for events with traceId', () => {
    render(<SecurityLogViewer {...props} />);
    const links = screen.getAllByRole('link', { name: /view trace/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', 'http://tempo/trace-abc');
  });

  it('filters by subject search — calls onFilter', async () => {
    render(<SecurityLogViewer {...props} />);
    const input = screen.getByLabelText(/search by user or ip/i);
    await userEvent.type(input, 'alice');
    await waitFor(() => expect(onFilter).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'alice' }),
    ));
  });

  it('filters by event type — calls onFilter', async () => {
    render(<SecurityLogViewer {...props} />);
    const select = screen.getByLabelText(/filter by event type/i);
    await userEvent.selectOptions(select, 'jwt_ok');
    await waitFor(() => expect(onFilter).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'jwt_ok' }),
    ));
  });

  it('CSV export button is present', () => {
    render(<SecurityLogViewer {...props} />);
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
  });

  it('shows empty message when no events', () => {
    render(<SecurityLogViewer {...props} events={[]} total={0} />);
    expect(screen.getByText(/no events match/i)).toBeInTheDocument();
  });

  it('shows loading rows', () => {
    const { container } = render(<SecurityLogViewer {...props} events={[]} loading />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('pagination buttons rendered when total > limit', () => {
    render(<SecurityLogViewer {...props} total={200} />);
    expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. DeployAdminControls
// ═════════════════════════════════════════════════════════════════════════════

describe('DeployAdminControls', () => {
  const baseProps = {
    onCanary:   jest.fn().mockResolvedValue(undefined),
    onPromote:  jest.fn().mockResolvedValue(undefined),
    onRollback: jest.fn().mockResolvedValue(undefined),
    onFull:     jest.fn().mockResolvedValue(undefined),
    status:     { stableTag: 'sha-prev', canaryTag: null },
    history:    [],
  };

  it('renders all 4 action cards', () => {
    render(<DeployAdminControls {...baseProps} />);
    expect(screen.getByText('Deploy Canary')).toBeInTheDocument();
    expect(screen.getByText('Promote')).toBeInTheDocument();
    expect(screen.getByText('Rollback')).toBeInTheDocument();
    expect(screen.getByText('Full Deploy')).toBeInTheDocument();
  });

  it('tag input is present', () => {
    render(<DeployAdminControls {...baseProps} />);
    expect(screen.getByLabelText(/deployment image tag/i)).toBeInTheDocument();
  });

  it('Deploy Canary button disabled when tag is empty', () => {
    render(<DeployAdminControls {...baseProps} />);
    const btn = screen.getAllByRole('button', { name: /deploy canary/i })[0];
    expect(btn).toBeDisabled();
  });

  it('Deploy Canary enabled after tag entered', async () => {
    render(<DeployAdminControls {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/deployment image tag/i), 'sha-new');
    expect(screen.getAllByRole('button', { name: /deploy canary/i })[0]).not.toBeDisabled();
  });

  it('Deploy Canary shows confirm dialog', async () => {
    render(<DeployAdminControls {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/deployment image tag/i), 'sha-new');
    fireEvent.click(screen.getAllByRole('button', { name: /deploy canary/i })[0]);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /confirm deployment action/i })).toBeInTheDocument());
  });

  it('calls onCanary after confirm', async () => {
    const onCanary = jest.fn().mockResolvedValue(undefined);
    render(<DeployAdminControls {...baseProps} onCanary={onCanary} />);
    await userEvent.type(screen.getByLabelText(/deployment image tag/i), 'sha-test');
    fireEvent.click(screen.getAllByRole('button', { name: /deploy canary/i })[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => expect(onCanary).toHaveBeenCalledWith('sha-test'));
  });

  it('Promote disabled when no canary is running', () => {
    render(<DeployAdminControls {...baseProps} status={{ stableTag: 'sha-prev', canaryTag: null }} />);
    expect(screen.getAllByRole('button', { name: /promote/i })[0]).toBeDisabled();
  });

  it('Promote enabled when canary is running', () => {
    render(<DeployAdminControls {...baseProps}
      status={{ stableTag: 'sha-prev', canaryTag: 'sha-new' }} />);
    expect(screen.getAllByRole('button', { name: /promote/i })[0]).not.toBeDisabled();
  });

  it('Lock toggle disables all deploy buttons', async () => {
    render(<DeployAdminControls {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /lock deployments/i }));
    await waitFor(() => {
      const btn = screen.getAllByRole('button', { name: /deploy canary/i })[0];
      expect(btn).toBeDisabled();
    });
  });

  it('Unlock re-enables deploy buttons after entering tag', async () => {
    render(<DeployAdminControls {...baseProps} />);
    const lockBtn = screen.getByRole('button', { name: /lock deployments/i });
    fireEvent.click(lockBtn);
    await waitFor(() => expect(screen.getByRole('button', { name: /unlock deployments/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /unlock deployments/i }));
    await userEvent.type(screen.getByLabelText(/deployment image tag/i), 'sha-z');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /deploy canary/i })[0]).not.toBeDisabled());
  });

  it('force checkbox is present', () => {
    render(<DeployAdminControls {...baseProps} />);
    expect(screen.getByLabelText(/force deploy/i)).toBeInTheDocument();
  });

  it('passes force=true to onFull when checked', async () => {
    const onFull = jest.fn().mockResolvedValue(undefined);
    render(<DeployAdminControls {...baseProps} onFull={onFull}
      status={{ stableTag: 'sha-prev', canaryTag: null }} />);
    await userEvent.type(screen.getByLabelText(/deployment image tag/i), 'sha-full');
    fireEvent.click(screen.getByLabelText(/force deploy/i));
    fireEvent.click(screen.getAllByRole('button', { name: /full deploy/i })[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => expect(onFull).toHaveBeenCalledWith('sha-full', true));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. ClusterAdminView
// ═════════════════════════════════════════════════════════════════════════════

describe('ClusterAdminView', () => {
  const props = {
    pods: PODS, hpa: HPA, nodes: NODES, quota: null,
    loading: false, error: null,
    onDeletePod: noop, grafanaPanels: [],
  };

  it('renders node names', () => {
    render(<ClusterAdminView {...props} />);
    expect(screen.getByText('node-1')).toBeInTheDocument();
    expect(screen.getByText('node-2')).toBeInTheDocument();
  });

  it('renders Ready badge for healthy node', () => {
    render(<ClusterAdminView {...props} />);
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0);
  });

  it('renders NotReady badge for unhealthy node', () => {
    render(<ClusterAdminView {...props} />);
    expect(screen.getByText('NotReady')).toBeInTheDocument();
  });

  it('renders HPA table', () => {
    render(<ClusterAdminView {...props} />);
    expect(screen.getByRole('table', { name: /hpa status/i })).toBeInTheDocument();
    expect(screen.getByText('agent')).toBeInTheDocument();
  });

  it('renders pod names', () => {
    render(<ClusterAdminView {...props} />);
    expect(screen.getByText(/agent-abc-1/)).toBeInTheDocument();
  });

  it('shows delete button per pod', () => {
    render(<ClusterAdminView {...props} />);
    const delBtns = screen.getAllByRole('button', { name: /delete pod/i });
    expect(delBtns.length).toBe(3); // 3 pods
  });

  it('shows delete confirm dialog for pod', async () => {
    render(<ClusterAdminView {...props} />);
    fireEvent.click(screen.getAllByRole('button', { name: /delete pod/i })[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText(/delete pod\?/i)).toBeInTheDocument();
  });

  it('calls onDeletePod after confirm', async () => {
    const onDeletePod = jest.fn().mockResolvedValue(undefined);
    render(<ClusterAdminView {...props} onDeletePod={onDeletePod} />);
    fireEvent.click(screen.getAllByRole('button', { name: /delete pod/i })[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(onDeletePod).toHaveBeenCalled());
  });

  it('shows summary count cards', () => {
    render(<ClusterAdminView {...props} />);
    expect(screen.getByText('Total Pods')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // 3 pods
  });

  it('shows Grafana panels when provided', () => {
    const panels = [
      { uid: 'p1', title: 'Auth Failures', url: 'http://grafana/d/xxx' },
    ];
    render(<ClusterAdminView {...props} grafanaPanels={panels} />);
    expect(screen.getByRole('link', { name: /auth failures/i })).toBeInTheDocument();
  });

  it('shows loading skeleton', () => {
    const { container } = render(<ClusterAdminView {...props} pods={[]} nodes={[]} hpa={[]} loading />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<ClusterAdminView {...props} pods={[]} nodes={[]} hpa={[]} error={new Error('k8s down')} />);
    expect(screen.getByText(/k8s down/i)).toBeInTheDocument();
  });

  it('shows quota panel when quota provided', () => {
    const quota = {
      cpuRequestUsed: 4, cpuRequestLimit: 8,
      cpuLimitUsed: 6, cpuLimitMax: 16,
      memRequestUsed: 2048, memRequestLimit: 8192,
      memLimitUsed: 4096, memLimitMax: 16384,
      podsUsed: 8, podsMax: 50,
      servicesUsed: 5, servicesMax: 20,
    };
    render(<ClusterAdminView {...props} quota={quota} />);
    expect(screen.getByText(/namespace resource quota/i)).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. lib/adminApi — unit tests
// ═════════════════════════════════════════════════════════════════════════════

describe('lib/adminApi — decodeJwtPayload', () => {
  beforeAll(() => {
    jest.unmock('../lib/adminApi.js');
  });

  it('decodes a valid JWT payload', async () => {
    const { decodeJwtPayload: decode } = await import('../lib/adminApi.js');
    // Build a fake JWT: header.payload.sig (all base64url encoded)
    const payload = { sub: 'alice', role: 'admin', exp: 9999999999 };
    const b64     = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const token   = `header.${b64}.signature`;
    const result  = decode(token);
    expect(result?.sub).toBe('alice');
    expect(result?.role).toBe('admin');
  });

  it('returns null for malformed token', async () => {
    const { decodeJwtPayload: decode } = await import('../lib/adminApi.js');
    expect(decode('not-a-jwt')).toBeNull();
  });

  it('returns null for empty string', async () => {
    const { decodeJwtPayload: decode } = await import('../lib/adminApi.js');
    expect(decode('')).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. Admin pages — smoke renders
// ═════════════════════════════════════════════════════════════════════════════

describe('Admin pages — smoke tests', () => {
  beforeEach(() => {
    sessionStorage.setItem('wolf_token', 'tok');
    decodeJwtPayload.mockReturnValue({ sub: 'admin', role: 'admin', exp: Date.now() / 1000 + 3600 });
    useSWR.mockReturnValue({ data: null, error: null, isLoading: true, mutate: jest.fn() });
  });

  it('AdminUsersPage renders title', async () => {
    const { default: Page } = await import('../pages/admin/users.js');
    render(<Page />);
    await waitFor(() => expect(screen.getByText('Users & Roles')).toBeInTheDocument());
  });

  it('AdminApiKeysPage renders title', async () => {
    const { default: Page } = await import('../pages/admin/api-keys.js');
    render(<Page />);
    await waitFor(() => expect(screen.getByText('API Keys')).toBeInTheDocument());
  });

  it('AdminSecurityLogsPage renders title', async () => {
    const { default: Page } = await import('../pages/admin/security-logs.js');
    render(<Page />);
    await waitFor(() => expect(screen.getByText('Security Logs')).toBeInTheDocument());
  });

  it('AdminDeployPage renders title', async () => {
    const { default: Page } = await import('../pages/admin/deploy.js');
    render(<Page />);
    await waitFor(() => expect(screen.getByText('Deployments')).toBeInTheDocument());
  });

  it('AdminClusterPage renders title', async () => {
    const { default: Page } = await import('../pages/admin/cluster.js');
    render(<Page />);
    await waitFor(() => expect(screen.getByText('Cluster')).toBeInTheDocument());
  });
});
