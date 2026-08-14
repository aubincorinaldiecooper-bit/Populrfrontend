import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import AutomationBuilderPage from '../pages/AutomationBuilderPage';
import { activityLines, parseOperations, type FlowOperation } from '../lib/composerActivity';
import type { AutomationFlow } from '../lib/api';
import type { FlowGraph } from '../lib/flowSchema';

/* The builder, after the phase-3 pass.
 *
 * Three things this pins.
 *
 * WHAT POPULR DID. The composer answers once — a request goes out, a
 * validated graph comes back — so there is no stream of thinking to show, and
 * inventing one would be theatre. What the response does carry is the list of
 * operations that were parsed, applied and saved. The activity list is that
 * record in the creator's language, and it can only ever describe changes that
 * are already in the graph.
 *
 * ONE CONTEXT AT A TIME. Preview, Inbox and History are about the whole
 * automation; the inspector is about one step. Opening one closes the other,
 * in both directions. Notifications is the deliberate exception — it is an
 * index of steps, and every item in it selects one.
 *
 * ONE RUN PER PERSON. The "Allow multiple triggers" switch is gone. It asked
 * a creator to decide, before their automation had ever run, something they
 * had no way to judge.
 */

const canvas = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));

vi.mock('../components/automation-builder/FlowCanvas', () => ({
  default: (props: Record<string, unknown>) => {
    canvas.props = props;
    return <div data-testid="canvas" />;
  },
}));

function graphFixture(): FlowGraph {
  return {
    schemaVersion: 1,
    nodes: [
      {
        id: 'trigger', type: 'trigger', position: { x: 0, y: 0 },
        config: { kind: 'comment', accountId: 'acc_1', platform: 'instagram', allPosts: true,
          keywords: ['guide'], matchMode: 'contains' },
      },
      { id: 'send', type: 'send', position: { x: 280, y: 0 }, config: { kind: 'dm', text: 'Here you go' } },
    ],
    edges: [{ id: 'e1', source: 'trigger', target: 'send', branch: 'next' }],
  };
}

function flowFixture(): AutomationFlow {
  return {
    id: 'flow_1', name: 'Free Creator Guide', status: 'draft',
    accountId: 'acc_1', platform: 'instagram', graph: graphFixture(), version: 1,
    legacyAutomationId: null, activatedAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  } as unknown as AutomationFlow;
}

/** Held open so a test can look at the builder mid-compose. */
let finishCompose: ((result: unknown) => void) | null = null;
const composeFlowMock = vi.fn(async () => new Promise(resolve => { finishCompose = resolve; }));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchFlow: vi.fn(async () => flowFixture()),
    updateFlow: vi.fn(async () => ({ flow: flowFixture() })),
    fetchFlowValidation: vi.fn(async () => ({ ok: true, problems: [] })),
    composeFlow: (...args: unknown[]) => composeFlowMock(...(args as [])),
    testFlow: vi.fn(async () => ({ matched: true, reason: null, steps: [] })),
    fetchConnectedAccounts: vi.fn(async () => [{
      id: 'acc_1', platform: 'instagram', username: 'populr.space', display_name: null,
      avatar_url: null, is_connected: true, status: 'connected', connected_at: null,
    }]),
    fetchCapabilities: vi.fn(async () => []),
    fetchFlowBuilderMeta: vi.fn(async () => ({ aiConfigured: true, tags: [] })),
    fetchPostsLibrary: vi.fn(async () => []),
    fetchInbox: vi.fn(async () => ({ items: [] })),
  };
});

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({ useApp: () => mockUseApp() }));

function mountBuilder() {
  return render(
    <MemoryRouter initialEntries={['/automations/flow_1']}>
      <Routes>
        <Route path="/automations/:flowId" element={<AutomationBuilderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Select a step, the way the canvas does. */
function selectNode(id: string | null) {
  act(() => {
    (canvas.props?.onSelect as (id: string | null) => void)(id);
  });
}

async function ask(user: ReturnType<typeof userEvent.setup>, prompt: string) {
  await user.type(
    await screen.findByLabelText('Ask Populr to build or change anything…'),
    `${prompt}{Enter}`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  canvas.props = null;
  finishCompose = null;
  mockUseApp.mockReturnValue({ showToast: vi.fn() });
});

describe('what Populr says it is doing', () => {
  it('says it is working, in the field the creator is looking at', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');

    await ask(user, 'follow up if they don’t reply');

    expect(await screen.findByText('Populr is making that change')).toBeInTheDocument();
    // A disabled box and a spinning button read as a stall; the field says it.
    expect(screen.getByLabelText('Populr is building…')).toBeInTheDocument();
  });

  it('lists what it actually changed, and finishes', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await ask(user, 'wait two days then follow up');

    act(() => {
      finishCompose?.({
        applied: true, summary: 'Added a follow-up.', source: 'model',
        operations: [
          { op: 'create_node', id: 'wait-1', type: 'wait', config: { kind: 'duration', minutes: 2880 } },
          { op: 'create_node', id: 'send-2', type: 'send', config: { kind: 'dm', text: 'Still there?' } },
          { op: 'connect', source: 'send', target: 'wait-1', branch: 'next' },
        ],
        touchedNodeIds: ['wait-1', 'send-2'], flow: flowFixture(),
      });
    });

    expect(await screen.findByText('Added a wait of 2 days')).toBeInTheDocument();
    expect(await screen.findByText('Added a DM')).toBeInTheDocument();
    expect(await screen.findByText('Done')).toBeInTheDocument();
    // The in-progress line is gone: it is a report of something finished.
    expect(screen.queryByText('Populr is making that change')).not.toBeInTheDocument();
  });

  it('claims nothing when nothing was applied', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await ask(user, 'do something impossible');

    act(() => {
      finishCompose?.({
        applied: false, summary: "Populr couldn't work out what to change.",
        source: 'model', operations: [], flow: flowFixture(),
      });
    });

    await waitFor(() =>
      expect(screen.queryByText('Populr is making that change')).not.toBeInTheDocument());
    expect(screen.queryByText('Done')).not.toBeInTheDocument();
  });
});

describe('one context at a time', () => {
  it('closes the step inspector when a whole-automation panel opens', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');

    selectNode('trigger');
    expect(await screen.findByText('When')).toBeInTheDocument();

    await user.click(screen.getByText('Preview'));

    await waitFor(() => expect(screen.queryByText('When')).not.toBeInTheDocument());
  });

  it('and closes the panel when a step is picked instead', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await user.click(await screen.findByText('Preview'));
    expect(await screen.findByRole('complementary', { name: 'Preview' })).toBeInTheDocument();

    selectNode('trigger');

    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Preview' })).not.toBeInTheDocument());
    expect(screen.getByText('When')).toBeInTheDocument();
  });

  it('keeps notifications open beside the step it sent you to', async () => {
    // The deliberate exception: the feed is an index into the canvas, and
    // every item in it selects a step. Closing the inspector it just opened
    // would undo the thing the creator clicked for.
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    selectNode('trigger');
    await screen.findByText('When');

    await user.click(screen.getByLabelText(/^Notifications,/));

    expect(await screen.findByRole('complementary', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByText('When')).toBeInTheDocument();
  });
});

describe('one run per person', () => {
  it('no longer asks whether the same fan may start it twice', async () => {
    mountBuilder();
    await screen.findByText('Preview');

    selectNode('trigger');
    await screen.findByText('When');

    expect(screen.queryByText('Allow multiple triggers')).not.toBeInTheDocument();
  });
});

describe('turning operations into what happened', () => {
  const graph = graphFixture();
  const lines = (ops: FlowOperation[]) => activityLines(ops, graph);

  it('names steps, not wiring', () => {
    expect(lines([
      { op: 'create_node', id: 't', type: 'trigger', config: { kind: 'comment' } },
      { op: 'connect', source: 't', target: 's', branch: 'next' },
      { op: 'move_node', id: 't', position: { x: 0, y: 0 } },
    ])).toEqual(['Added the comment trigger']);
  });

  it('mentions rewiring only when it is the whole change', () => {
    expect(lines([{ op: 'connect', source: 'trigger', target: 'send', branch: 'next' }]))
      .toEqual(['Reconnected the steps']);
  });

  it('names the step an update touched', () => {
    expect(lines([{ op: 'update_node', id: 'send', config: { text: 'hi' } }]))
      .toEqual(['Updated the Send step']);
  });

  it('falls back rather than guessing at a step it cannot find', () => {
    expect(lines([{ op: 'update_node', id: 'ghost', config: {} }])).toEqual(['Updated a step']);
  });

  it('counts the tail once the list stops being readable', () => {
    const many: FlowOperation[] = Array.from({ length: 9 }, (_, i) => ({
      op: 'create_node', id: `s${i}`, type: 'send', config: { kind: 'dm' },
    }));
    const out = lines(many);
    expect(out).toHaveLength(7);
    expect(out[6]).toBe('…and 3 more changes');
  });

  it('ignores anything that isn’t one of the operations we know', () => {
    expect(parseOperations([{ op: 'drop_database' }, { op: 'delete_node', id: 'x' }, 'nonsense']))
      .toEqual([{ op: 'delete_node', id: 'x' }]);
  });
});
