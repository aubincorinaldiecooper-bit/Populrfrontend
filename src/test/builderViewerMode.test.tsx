import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { render } from './render';
import { MemoryRouter, Route, Routes } from 'react-router';
import AutomationBuilderPage from '../pages/AutomationBuilderPage';
import type { AutomationFlow, WorkspaceAccess } from '../lib/api';
import type { FlowGraph } from '../lib/flowSchema';
import { appContext } from './appContext.mock';

/* The builder, seen by a guest.
 *
 * A canvas invite used to mean exactly one thing — edit — because view-only
 * was not representable anywhere: not in the invitation, not in the
 * membership row, not in the check. So a creator who wanted a second pair of
 * eyes on an automation had to hand over the ability to rewrite it.
 *
 * It is representable now, and this is what the two seats look like from the
 * inside. What this file pins:
 *   - a viewer's canvas is read-only, and the page says so rather than just
 *     going quiet — a control that is missing without explanation reads as a
 *     bug;
 *   - a viewer cannot rename, cannot ask the AI to build, and is not offered
 *     Activate;
 *   - an edit-granted guest gets the building controls back, so the badge is
 *     tracking the grant and not the role;
 *   - turning it on is the owner's either way, and both seats are told so.
 */

const canvas = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));

vi.mock('../components/automation-builder/FlowCanvas', () => ({
  // React Flow needs a real viewport to measure. The page's contract with the
  // canvas is what matters here — readOnly and the disabled handlers — so it
  // is stood in for and its props asserted directly.
  default: (props: Record<string, unknown>) => {
    canvas.props = props;
    return <div data-testid="canvas" data-read-only={String(props.readOnly)} />;
  },
}));

let serverGraph: FlowGraph = { schemaVersion: 1, nodes: [], edges: [] };

function graphWithSteps(): FlowGraph {
  return {
    schemaVersion: 1,
    nodes: [
      {
        id: 'trigger', type: 'trigger', position: { x: 0, y: 0 },
        config: { kind: 'comment', accountId: 'acc_1', platform: 'instagram', allPosts: true, keywords: ['guide'], matchMode: 'contains' },
      },
      { id: 'send', type: 'send', position: { x: 280, y: 0 }, config: { kind: 'dm', text: 'Here you go' } },
    ],
    edges: [{ id: 'e1', source: 'trigger', target: 'send', branch: 'next' }],
  };
}

function flowFixture(): AutomationFlow {
  return {
    id: 'flow_1', name: 'Culture comments', status: 'draft',
    accountId: null, platform: null, graph: serverGraph, version: 1,
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
  };
});

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({ useApp: () => mockUseApp() }));

function seat(canEdit: boolean): WorkspaceAccess {
  return {
    id: 'w_host', name: 'Host Studio', role: 'canvas',
    permissions: { editAutomations: canEdit, contactOutreach: false },
    canvasAutomation: { id: 'flow_1', name: 'Culture comments' },
  };
}

function mountBuilder(access: WorkspaceAccess) {
  mockUseApp.mockReturnValue(appContext({ showToast: vi.fn(), workspaceAccess: access }));
  return render(
    <MemoryRouter initialEntries={['/automations/flow_1']}>
      <Routes>
        <Route path="/automations/:flowId" element={<AutomationBuilderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  canvas.props = null;
  serverGraph = graphWithSteps();
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
});

describe('a view-only guest', () => {
  it('gets a read-only canvas, and is told why', async () => {
    mountBuilder(seat(false));
    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-read-only', 'true'));
    // Said, not merely enacted. Controls that vanish without a word read as
    // a broken page rather than as a boundary somebody drew on purpose.
    expect(screen.getByText('View only')).toBeInTheDocument();
  });

  it('cannot rename the automation — the name is text, not a field', async () => {
    mountBuilder(seat(false));
    await waitFor(() => expect(screen.getByText('Culture comments')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Culture comments/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Automation name' })).not.toBeInTheDocument();
  });

  it('is not offered the AI, which exists to change things', async () => {
    mountBuilder(seat(false));
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Ask Populr/ })).not.toBeInTheDocument();
  });

  it('is not offered Activate, and is told whose job that is', async () => {
    mountBuilder(seat(false));
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Activate' })).not.toBeInTheDocument();
    expect(screen.getByText('The owner turns it on')).toBeInTheDocument();
  });

  it('is handed no-op editing handlers, so a stray gesture cannot write', async () => {
    mountBuilder(seat(false));
    await waitFor(() => expect(canvas.props).not.toBeNull());

    // The page's contract with the canvas, independent of what the canvas
    // chooses to do with readOnly: deleting and moving arrive as functions
    // that do nothing. Asserted on the graph the page hands back rather than
    // on the save call, because autosave is debounced — a test watching for
    // a request would pass on timing alone.
    await act(async () => {
      (canvas.props!.onDeleteNode as (id: string) => void)('send');
      (canvas.props!.onMove as (id: string, p: { x: number; y: number }) => void)('send', { x: 900, y: 900 });
    });

    const graph = canvas.props!.graph as FlowGraph;
    const send = graph.nodes.find(n => n.id === 'send');
    expect(send).toBeDefined();
    expect(send!.position).toEqual({ x: 280, y: 0 });
  });

  it('on an empty automation, says it is empty rather than showing a blank page', async () => {
    serverGraph = { schemaVersion: 1, nodes: [], edges: [] };
    mountBuilder(seat(false));
    expect(await screen.findByText(/Nothing has been built here yet/)).toBeInTheDocument();
    // And never the owner's invitation to start building.
    expect(screen.queryByText(/start from a blank step/)).not.toBeInTheDocument();
  });
});

describe('a guest who was given editing', () => {
  it('gets the canvas and the AI back — the badge tracks the grant, not the role', async () => {
    mountBuilder(seat(true));
    await waitFor(() => expect(screen.getByTestId('canvas')).toHaveAttribute('data-read-only', 'false'));
    expect(screen.queryByText('View only')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ask Populr/ })).toBeInTheDocument();
  });

  it('still cannot turn it on — building and switching on are different powers', async () => {
    mountBuilder(seat(true));
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Activate' })).not.toBeInTheDocument();
    expect(screen.getByText('The owner turns it on')).toBeInTheDocument();
  });

  it('is not offered the share sheet — inviting stays with the owner', async () => {
    mountBuilder(seat(true));
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Share/ })).not.toBeInTheDocument();
  });
});
