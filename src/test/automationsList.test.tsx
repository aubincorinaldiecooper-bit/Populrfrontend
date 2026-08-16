import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import AutomationsPage from '../pages/AutomationsPage';
import { describeFlow } from '../lib/flowSummary';
import type { AutomationFlow } from '../lib/api';
import type { FlowGraph } from '../lib/flowSchema';

/* The Automations list, after the phase-2 pass.
 *
 * The list is where a creator decides which automation they meant. That means
 * it has to answer three questions without being opened: what is this, is it
 * running, and has it actually done anything. The card used to answer the
 * first two and describe the third in builder vocabulary — "1 Send · 1 Wait" —
 * which is the graph read aloud rather than the behaviour.
 *
 * What these pin:
 *   - the description is English, and it is what the person on the other end
 *     experiences;
 *   - the audience is a real number of real people, and it opens them;
 *   - a number that isn't known reads as nothing, not as nobody;
 *   - pausing an automation doesn't erase how many people it reached;
 *   - deleting takes two deliberate steps and no longer shouts from the row.
 */

function graph(nodes: unknown[], edges: unknown[]): FlowGraph {
  return { schemaVersion: 1, nodes, edges } as unknown as FlowGraph;
}

const TRIGGER = {
  id: 't1', type: 'trigger', position: { x: 0, y: 0 },
  config: { kind: 'comment', accountId: 'acct_1', platform: 'instagram', allPosts: true,
    keywords: ['menu'], matchMode: 'contains' },
};
const SEND = {
  id: 's1', type: 'send', position: { x: 260, y: 0 },
  config: { kind: 'dm', text: "Here's the menu" },
};
const WAIT = {
  id: 'w1', type: 'wait', position: { x: 520, y: 0 },
  config: { kind: 'duration', minutes: 2880 },
};
const TAG = {
  id: 'a1', type: 'action', position: { x: 780, y: 0 },
  config: { kind: 'add_tag', tag: 'warm_lead' },
};

const MENU_GRAPH = graph([TRIGGER, SEND, WAIT, TAG], [
  { id: 'e1', source: 't1', target: 's1', branch: 'next' },
  { id: 'e2', source: 's1', target: 'w1', branch: 'next' },
  { id: 'e3', source: 'w1', target: 'a1', branch: 'next' },
]);

/** A flow as the single-flow routes answer: no audience count on it. */
function withoutAudience(f: AutomationFlow): AutomationFlow {
  const copy = { ...f };
  delete copy.audienceCount;
  return copy;
}

function flow(over: Partial<AutomationFlow> = {}): AutomationFlow {
  return {
    id: 'f1', name: 'Menu comments', status: 'live',
    accountId: 'acct_1', platform: 'instagram', graph: MENU_GRAPH,
    version: 1, legacyAutomationId: null, activatedAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    audienceCount: 143,
    ...over,
  } as AutomationFlow;
}

const fetchFlowsMock = vi.fn();
const updateFlowMock = vi.fn();
const createFlowMock = vi.fn();
const pauseFlowMock = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchFlows: () => fetchFlowsMock(),
    updateFlow: (...args: unknown[]) => updateFlowMock(...args),
    createFlow: (...args: unknown[]) => createFlowMock(...args),
    pauseFlow: (...args: unknown[]) => pauseFlowMock(...args),
    deleteFlow: vi.fn(async () => ({ deleted: true })),
  };
});

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({ useApp: () => mockUseApp() }));

function Probe() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}{location.search}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/automations']}>
      <Routes>
        <Route path="/automations" element={<AutomationsPage />} />
        <Route path="/contacts" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseApp.mockReturnValue({ showToast: vi.fn() });
  fetchFlowsMock.mockResolvedValue([flow()]);
  updateFlowMock.mockImplementation(async (id: string, patch: { name?: string }) =>
    ({ flow: flow({ id, ...patch }) }));
  createFlowMock.mockImplementation(async (input: { name?: string }) =>
    flow({ id: 'f2', name: input.name, status: 'draft', audienceCount: 0 }));
  pauseFlowMock.mockImplementation(async (id: string) => {
    return { flow: withoutAudience(flow({ id, status: 'paused' })), cancelledRuns: 0 };
  });
});

describe('what a card says about an automation', () => {
  it('describes the behaviour in English, not in builder parts', async () => {
    renderPage();

    expect(await screen.findByText('Menu comments')).toBeInTheDocument();
    expect(screen.getByText('Someone comments “menu”')).toBeInTheDocument();
    expect(screen.getByText('→ Sends a DM, waits 2 days, then tags them warm_lead')).toBeInTheDocument();
    // The old wording named node types and counted them.
    expect(screen.queryByText(/1 Send/)).not.toBeInTheDocument();
  });

  it('carries the facts that tell two similar automations apart', async () => {
    renderPage();
    await screen.findByText('Menu comments');

    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('4 steps')).toBeInTheDocument();
    expect(screen.getByLabelText('143 people reached by Menu comments')).toBeInTheDocument();
  });

  it('opens the people it reached, filtered to that automation', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Menu comments');

    await user.click(screen.getByLabelText('143 people reached by Menu comments'));

    expect(screen.getByTestId('where')).toHaveTextContent('/contacts?automation=f1');
  });

  it('says "No one yet" when nobody has been reached', async () => {
    fetchFlowsMock.mockResolvedValue([flow({ audienceCount: 0 })]);
    renderPage();

    expect(await screen.findByText('No one yet')).toBeInTheDocument();
  });

  it('says nothing at all when the count is unknown', async () => {
    // The backend leaves the field off when the aggregation failed. Zero is a
    // claim about the automation; absent is a fact about the request, and
    // showing "No one yet" for it would report a failure as an empty audience.
    fetchFlowsMock.mockResolvedValue([withoutAudience(flow())]);
    renderPage();

    await screen.findByText('Menu comments');
    expect(screen.queryByText('No one yet')).not.toBeInTheDocument();
    expect(screen.queryByText(/people/)).not.toBeInTheDocument();
  });

  it('keeps the audience when the automation is paused', async () => {
    // Pause returns a single flow, which carries no count — reading the number
    // off the flow would make it vanish at exactly the moment a creator is
    // deciding whether to switch something off.
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Menu comments');

    await user.click(screen.getByLabelText('Pause Menu comments'));

    await waitFor(() => expect(screen.getByLabelText('Activate Menu comments')).toBeInTheDocument());
    expect(screen.getByLabelText('143 people reached by Menu comments')).toBeInTheDocument();
  });
});

describe('the actions on a card', () => {
  it('no longer puts delete on the row', async () => {
    renderPage();
    await screen.findByText('Menu comments');

    expect(screen.queryByLabelText('Delete Menu comments')).not.toBeInTheDocument();
    expect(screen.getByLabelText('More options for Menu comments')).toBeInTheDocument();
  });

  it('keeps pause one click away', async () => {
    renderPage();
    await screen.findByText('Menu comments');
    expect(screen.getByLabelText('Pause Menu comments')).toBeInTheDocument();
  });

  it('renames in place, and saves it', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Menu comments');

    await user.click(screen.getByLabelText('More options for Menu comments'));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));

    const field = await screen.findByLabelText('Rename Menu comments');
    await user.clear(field);
    await user.type(field, 'Menu DMs{Enter}');

    await waitFor(() => expect(updateFlowMock).toHaveBeenCalledWith('f1', { name: 'Menu DMs' }));
    expect(await screen.findByText('Menu DMs')).toBeInTheDocument();
  });

  it('puts the old name back when the rename fails', async () => {
    const showToast = vi.fn();
    mockUseApp.mockReturnValue({ showToast });
    updateFlowMock.mockRejectedValue(new Error('Could not rename this automation.'));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Menu comments');

    await user.click(screen.getByLabelText('More options for Menu comments'));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const field = await screen.findByLabelText('Rename Menu comments');
    await user.clear(field);
    await user.type(field, 'Menu DMs{Enter}');

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      'Could not rename this automation.', 'error'));
    expect(await screen.findByText('Menu comments')).toBeInTheDocument();
  });

  it('duplicates a live automation as a draft, never as a second live one', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Menu comments');

    await user.click(screen.getByLabelText('More options for Menu comments'));
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));

    await waitFor(() => expect(createFlowMock).toHaveBeenCalledWith({
      name: 'Menu comments copy', graph: MENU_GRAPH,
    }));
    expect(await screen.findByText('Menu comments copy')).toBeInTheDocument();
    // Created through the ordinary create route, which only makes drafts.
    expect(screen.getByLabelText('Activate Menu comments copy')).toBeInTheDocument();
  });

  it('closes the menu on Escape without acting', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Menu comments');

    await user.click(screen.getByLabelText('More options for Menu comments'));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(updateFlowMock).not.toHaveBeenCalled();
    expect(createFlowMock).not.toHaveBeenCalled();
  });
});

describe('describing a graph', () => {
  it('names the first three steps and counts the rest', () => {
    const nodes = [TRIGGER, SEND, WAIT, TAG,
      { id: 's2', type: 'send', position: { x: 0, y: 0 }, config: { kind: 'dm', text: 'again' } },
      { id: 'a2', type: 'action', position: { x: 0, y: 0 }, config: { kind: 'notify_creator' } }];
    const edges = [
      { id: 'e1', source: 't1', target: 's1', branch: 'next' },
      { id: 'e2', source: 's1', target: 'w1', branch: 'next' },
      { id: 'e3', source: 'w1', target: 'a1', branch: 'next' },
      { id: 'e4', source: 'a1', target: 's2', branch: 'next' },
      { id: 'e5', source: 's2', target: 'a2', branch: 'next' },
    ];
    expect(describeFlow(graph(nodes, edges)).then)
      .toBe('Sends a DM, waits 2 days, then tags them warm_lead, and 2 more steps');
  });

  it('says so when an automation has no trigger yet', () => {
    expect(describeFlow(graph([], []))).toEqual({ when: 'Not set up yet', then: null });
  });

  it('says what happens with no keywords, rather than quoting nothing', () => {
    const anyTrigger = { ...TRIGGER, config: { ...TRIGGER.config, keywords: [], matchMode: 'any' } };
    expect(describeFlow(graph([anyTrigger], [])).when).toBe('Someone comments');
  });

  it('has nothing to promise when a trigger leads nowhere', () => {
    expect(describeFlow(graph([TRIGGER], [])).then).toBeNull();
  });
});

describe('a live automation that cannot fully run', () => {
  const PROBLEM = 'That account needs reconnecting before this automation can run.';

  it('wears a Needs-attention chip naming the problem', async () => {
    // The backend sends `problems` on the list for live flows the activation
    // checks would refuse today — a flow that went live before a rule
    // existed, or whose account has since disconnected. "Active" alone would
    // be a lie the creator discovers from a fan.
    fetchFlowsMock.mockResolvedValue([flow({ problems: [PROBLEM] })]);
    renderPage();

    const chip = await screen.findByText('Needs attention');
    expect(chip).toHaveAttribute('title', PROBLEM);
  });

  it('stays quiet when the backend reported nothing wrong', async () => {
    fetchFlowsMock.mockResolvedValue([flow()]);
    renderPage();

    await screen.findByText('Menu comments');
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
  });
});
