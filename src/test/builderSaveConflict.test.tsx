import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { render } from './render';
import AutomationBuilderPage from '../pages/AutomationBuilderPage';
import { appContext } from './appContext.mock';
import { FlowConflictError } from '../lib/api';
import type { AutomationFlow, WorkspaceAccess } from '../lib/api';
import type { FlowGraph } from '../lib/flowSchema';

/* Two people editing the same automation.
 *
 * The server has always been able to refuse a save that would land on top of
 * somebody else's — but only if the client asks it to, by sending the version
 * it believes the server holds. The client never sent one. So the guard sat
 * dormant, autosave was last-write-wins, and whoever saved second silently
 * deleted the other's work while being told "Autosaved just now".
 *
 * The version now goes with every save, and a refusal is treated as what it
 * is: not a failure to retry, but two versions come apart and a choice to
 * make. Nothing is saved until somebody makes it.
 */

const canvas = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));

vi.mock('../components/automation-builder/FlowCanvas', () => ({
  default: (props: Record<string, unknown>) => {
    canvas.props = props;
    return <div data-testid="canvas" />;
  },
}));

const graph: FlowGraph = {
  schemaVersion: 1,
  nodes: [
    {
      id: 'trigger', type: 'trigger', position: { x: 0, y: 0 },
      config: { kind: 'comment', accountId: 'a1', platform: 'instagram', allPosts: true, keywords: ['guide'], matchMode: 'contains' },
    },
    { id: 'send', type: 'send', position: { x: 280, y: 0 }, config: { kind: 'dm', text: 'Here you go' } },
  ],
  edges: [{ id: 'e1', source: 'trigger', target: 'send', branch: 'next' }],
};

/** What the server holds. Bumped by the test to stand for someone else saving. */
let serverVersion = 4;

function flowFixture(): AutomationFlow {
  return {
    id: 'flow_1', name: 'Culture comments', status: 'draft',
    accountId: null, platform: null, graph, version: serverVersion,
    legacyAutomationId: null, activatedAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  } as unknown as AutomationFlow;
}

const updateFlowMock = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchFlow: vi.fn(async () => flowFixture()),
    updateFlow: (...args: unknown[]) => updateFlowMock(...args),
    fetchFlowValidation: vi.fn(async () => ({ ok: true, problems: [] })),
    fetchActiveProposal: vi.fn(async () => ({ proposal: null })),
    fetchConnectedAccounts: vi.fn(async () => []),
    fetchCapabilities: vi.fn(async () => []),
    fetchFlowBuilderMeta: vi.fn(async () => ({ aiConfigured: true, tags: [] })),
    fetchPostsLibrary: vi.fn(async () => []),
    fetchCollaborators: vi.fn(async () => []),
    announcePresence: vi.fn(async () => {}),
    fetchInbox: vi.fn(async () => ({ items: [] })),
    fetchNotifications: vi.fn(async () => ({ notifications: [], unread: 0 })),
    fetchComments: vi.fn(async () => []),
    fetchFlowAiMessages: vi.fn(async () => ({ messages: [] })),
  };
});

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({ useApp: () => mockUseApp() }));

const owner = {
  id: 'w_1', name: 'My Studio', role: 'owner',
  permissions: { editAutomations: true, contactOutreach: true },
  canvasAutomation: null,
} as unknown as WorkspaceAccess;

function mountBuilder() {
  mockUseApp.mockReturnValue(appContext({ showToast: vi.fn(), workspaceAccess: owner }));
  return render(
    <MemoryRouter initialEntries={['/automations/flow_1']}>
      <Routes>
        <Route path="/automations/:flowId" element={<AutomationBuilderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * What updateFlow throws when the server refuses. The translation from the
 * wire's 409 into this is the API client's job and is covered separately
 * below, against a real fetch rather than a mocked client.
 */
const refuse = () =>
  new FlowConflictError(
    'Robin changed this automation while you were working. Reload to see their version.',
  );

/** Make an edit the builder will try to autosave. */
function editAStep() {
  const onMove = canvas.props?.onMove as (id: string, at: { x: number; y: number }) => void;
  onMove('send', { x: 400, y: 120 });
}

beforeEach(() => {
  vi.clearAllMocks();
  canvas.props = null;
  serverVersion = 4;
  updateFlowMock.mockResolvedValue({ flow: flowFixture() });
});

describe('saving over somebody else', () => {
  it('tells the server which version it thinks it is changing', async () => {
    mountBuilder();
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());

    editAStep();

    // Without this the server cannot refuse anything, which is how the
    // silent overwrite happened: the guard was never asked to run.
    await waitFor(() => expect(updateFlowMock).toHaveBeenCalled());
    expect(updateFlowMock.mock.calls[0][1]).toMatchObject({ expectedVersion: 4 });
  });

  it('says who changed it, and does not pretend the save landed', async () => {
    updateFlowMock.mockRejectedValue(refuse());
    mountBuilder();
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());

    editAStep();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Robin changed this automation/);
    // "Autosaved just now" beside a save that was refused is the one lie
    // this screen is capable of telling.
    expect(screen.queryByText(/Autosaved/)).not.toBeInTheDocument();
  });

  it('offers both ways out, because either one costs somebody an edit', async () => {
    updateFlowMock.mockRejectedValue(refuse());
    mountBuilder();
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());
    editAStep();
    await screen.findByRole('alert');

    expect(screen.getByRole('button', { name: 'Load their version' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep mine' })).toBeInTheDocument();
  });

  it('stops trying while the versions are apart', async () => {
    updateFlowMock.mockRejectedValue(refuse());
    mountBuilder();
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());

    editAStep();
    await screen.findByRole('alert');
    const afterFirst = updateFlowMock.mock.calls.length;

    // More typing while the banner is up. Retrying would be refused again,
    // every few seconds, forever — and would bury the banner in noise.
    editAStep();
    await new Promise(r => setTimeout(r, 1200));
    expect(updateFlowMock.mock.calls.length).toBe(afterFirst);
  });

  it('clears the banner and saves again once the creator keeps theirs', async () => {
    updateFlowMock.mockRejectedValue(refuse());
    const user = userEvent.setup();
    mountBuilder();
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());
    editAStep();
    await screen.findByRole('alert');

    // Their save landed; the server has moved on.
    serverVersion = 5;
    updateFlowMock.mockResolvedValue({ flow: flowFixture() });
    await user.click(screen.getByRole('button', { name: 'Keep mine' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    // Written against what the server holds NOW, or it would be refused again.
    const calls = updateFlowMock.mock.calls;
    const last = calls[calls.length - 1]?.[1];
    expect(last).toMatchObject({ expectedVersion: 5 });
  });

  it('takes their version when asked, and stops being in conflict', async () => {
    updateFlowMock.mockRejectedValue(refuse());
    const user = userEvent.setup();
    mountBuilder();
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());
    editAStep();
    await screen.findByRole('alert');

    serverVersion = 5;
    await user.click(screen.getByRole('button', { name: 'Load their version' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    // Nothing of the local edit was written on the way out.
    expect(updateFlowMock.mock.calls.every(c => c[1].expectedVersion === 4)).toBe(true);
  });
});

describe('the client turning a refusal into a choice', () => {
  it('reads a 409 as a conflict rather than a failure', async () => {
    const { updateFlow, ApiError } = await vi.importActual<typeof import('../lib/api')>('../lib/api');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/auth/token')) {
        return { ok: true, status: 200, json: async () => ({ token: 't' }) } as Response;
      }
      return {
        ok: false,
        status: 409,
        json: async () => ({
          error: 'flow_changed',
          message: 'Robin changed this automation while you were working.',
        }),
      } as Response;
    }));

    // Without this the hook sees a generic error, shows "couldn't save", and
    // keeps retrying a write the server will refuse every time.
    await expect(updateFlow('flow_1', { expectedVersion: 4 }))
      .rejects.toBeInstanceOf(FlowConflictError);
    await expect(updateFlow('flow_1', { expectedVersion: 4 }))
      .rejects.toThrow(/Robin changed this automation/);
    expect(ApiError).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
