import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import AutomationBuilderPage from '../pages/AutomationBuilderPage';
import type { AutomationFlow } from '../lib/api';
import type { FlowGraph } from '../lib/flowSchema';

/* The contextual step editor.
 *
 * Clicking a step used to open a 320px form panel beside the AI chat — three
 * competing surfaces, with an empty Link URL input shown to everyone. Now a
 * small card opens AT the step (or a bottom sheet on a phone), leads with the
 * one field that matters, and keeps everything optional behind a light touch.
 *
 * What this file pins:
 *
 *   - selecting a step opens the editor; selecting another swaps it; empty
 *     canvas or ✕ or Escape closes it — and closing changes nothing;
 *   - Message leads with the message. Link and Attachment appear only when
 *     asked for — but a link that already exists is visible and removable;
 *   - If shows the check and its one value; matching machinery and reply
 *     timing live behind More options;
 *   - Wait shows the wait and nothing else;
 *   - the editor is a card on the canvas, not a side column — the side region
 *     stays for whole-automation panels only;
 *   - narrow screens get the same editor as a bottom sheet;
 *   - edits still write through to autosave;
 *   - the copy speaks about what the step actually checks — a reply check
 *     never says "comment".
 */

const canvas = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));

vi.mock('../components/automation-builder/FlowCanvas', () => ({
  // The canvas is stood in for; the editor slot it would anchor to the node
  // is rendered inside it, which is exactly the page's contract.
  default: (props: Record<string, unknown>) => {
    canvas.props = props;
    return <div data-testid="canvas">{props.editorSlot as React.ReactNode}</div>;
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
      { id: 'send-plain', type: 'send', position: { x: 280, y: 0 }, config: { kind: 'dm', text: 'Here you go' } },
      {
        id: 'send-linked', type: 'send', position: { x: 280, y: 160 },
        config: { kind: 'dm', text: 'Grab it here', linkUrl: 'https://populr.space/guide' },
      },
      { id: 'wait-1', type: 'wait', position: { x: 560, y: 0 }, config: { kind: 'duration', minutes: 1440 } },
      {
        id: 'if-said', type: 'condition', position: { x: 840, y: 0 },
        config: { kind: 'text_contains', keywords: ['yes'], matchMode: 'contains', withinMinutes: 0 },
      },
      {
        id: 'if-replied', type: 'condition', position: { x: 840, y: 160 },
        config: { kind: 'replied', withinMinutes: 0 },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'send-plain', branch: 'next' },
      { id: 'e2', source: 'send-plain', target: 'wait-1', branch: 'next' },
    ],
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

const updateFlowMock = vi.fn(async (_id: string, patch: { graph: FlowGraph; name: string }) =>
  ({ flow: { ...flowFixture(), name: patch.name, graph: patch.graph } }));

/** The Instagram-shaped capability row — DMs, comment replies, DM images. */
const IG_CAPABILITIES = {
  platform: 'instagram', supportsComments: true, supportsCommentReplies: true,
  supportsDMs: true, supportsCommentToDM: true, supportsDMImages: true,
};

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchFlow: vi.fn(async () => flowFixture()),
    updateFlow: (...args: [string, { graph: FlowGraph; name: string }]) => updateFlowMock(...args),
    fetchFlowValidation: vi.fn(async () => ({ ok: true, problems: [] })),
    proposeFlow: vi.fn(async () => ({ proposal: null, clarification: true, summary: '…', source: 'intent', progress: [] })),
    commitProposal: vi.fn(),
    discardProposal: vi.fn(async () => ({ ok: true })),
    fetchActiveProposal: vi.fn(async () => ({ proposal: null })),
    fetchFlowAiMessages: vi.fn(async () => ({ messages: [], hasMore: false })),
    testFlow: vi.fn(async () => ({ matched: true, reason: null, steps: [] })),
    fetchConnectedAccounts: vi.fn(async () => [{
      id: 'acc_1', platform: 'instagram', username: 'populr.space', display_name: null,
      avatar_url: null, is_connected: true, status: 'connected', connected_at: null,
    }]),
    fetchCapabilities: vi.fn(async () => [IG_CAPABILITIES]),
    fetchFlowBuilderMeta: vi.fn(async () => ({ aiConfigured: true, tags: ['warm_lead'] })),
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

beforeEach(() => {
  vi.clearAllMocks();
  canvas.props = null;
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
  mockUseApp.mockReturnValue({ showToast: vi.fn() });
});

describe('opening, switching, closing', () => {
  it('selecting a Message opens the contextual editor at the step', async () => {
    mountBuilder();
    await screen.findByText('Preview');

    selectNode('send-plain');

    const editor = await screen.findByLabelText('Message settings');
    expect(editor).toBeInTheDocument();
    // At the step means inside the canvas, not a side column: the page hands
    // the card to the canvas to anchor, and the side region stays empty.
    expect(screen.getByTestId('canvas')).toContainElement(editor);
    expect(screen.getByDisplayValue('Here you go')).toBeInTheDocument();
  });

  it('selecting another step swaps the editor to it', async () => {
    mountBuilder();
    await screen.findByText('Preview');

    selectNode('send-plain');
    await screen.findByLabelText('Message settings');

    selectNode('wait-1');
    expect(await screen.findByLabelText('Wait settings')).toBeInTheDocument();
    expect(screen.queryByLabelText('Message settings')).not.toBeInTheDocument();
  });

  it('the ✕ closes it, and closing mutates nothing', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');

    selectNode('send-plain');
    await screen.findByLabelText('Message settings');
    await user.click(screen.getByLabelText('Close settings'));

    expect(screen.queryByLabelText('Message settings')).not.toBeInTheDocument();
    // Long enough for the autosave debounce to have fired if anything wrote.
    await new Promise(r => setTimeout(r, 900));
    expect(updateFlowMock).not.toHaveBeenCalled();
  });

  it('Escape closes it from inside a field', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');

    selectNode('send-plain');
    await screen.findByLabelText('Message settings');
    await user.keyboard('{Escape}');

    expect(screen.queryByLabelText('Message settings')).not.toBeInTheDocument();
  });
});

describe('Message — the message first', () => {
  it('hides Link and Attachment until asked for', async () => {
    mountBuilder();
    await screen.findByText('Preview');
    selectNode('send-plain');
    await screen.findByLabelText('Message settings');

    expect(screen.queryByLabelText('Link')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Attachment')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add link/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add attachment/ })).toBeInTheDocument();
  });

  it('Add link reveals the field; removing it puts the chip back', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    selectNode('send-plain');
    await screen.findByLabelText('Message settings');

    await user.click(screen.getByRole('button', { name: /Add link/ }));
    expect(await screen.findByLabelText('Link')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add link/ })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Remove link'));
    expect(screen.queryByLabelText('Link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add link/ })).toBeInTheDocument();
  });

  it('an existing link is visible and editable straight away', async () => {
    mountBuilder();
    await screen.findByText('Preview');
    selectNode('send-linked');
    await screen.findByLabelText('Message settings');

    const link = screen.getByLabelText('Link') as HTMLInputElement;
    expect(link.value).toBe('https://populr.space/guide');
    expect(screen.queryByRole('button', { name: /Add link/ })).not.toBeInTheDocument();
  });

  it('edits write through to autosave', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    selectNode('send-plain');
    await screen.findByLabelText('Message settings');

    const textarea = screen.getByDisplayValue('Here you go');
    await user.clear(textarea);
    await user.type(textarea, 'Fresh copy');

    await waitFor(() => expect(updateFlowMock).toHaveBeenCalled(), { timeout: 3000 });
    const saved = updateFlowMock.mock.calls[updateFlowMock.mock.calls.length - 1][1] as { graph: FlowGraph };
    expect(saved.graph.nodes.find(n => n.id === 'send-plain')!.config.text).toBe('Fresh copy');
  });
});

describe('If — what are we checking, and what counts as Yes', () => {
  it('shows the check and its keywords; matching machinery waits behind More options', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    selectNode('if-said');
    await screen.findByLabelText('If settings');

    expect(screen.getByText('If they say…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Matching')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'More options' }));
    expect(await screen.findByLabelText('Matching')).toBeInTheDocument();
  });

  it('a reply check adds nothing by default — the canvas already shows Yes and No', async () => {
    mountBuilder();
    await screen.findByText('Preview');
    selectNode('if-replied');
    await screen.findByLabelText('If settings');

    expect(screen.queryByLabelText('When to check')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Duration')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument();
  });

  it('never says "comment" about words they said in a reply', async () => {
    mountBuilder();
    await screen.findByText('Preview');
    selectNode('if-said');
    const editor = await screen.findByLabelText('If settings');

    expect(editor.textContent).not.toMatch(/comment/i);
    expect(editor.textContent).toMatch(/reply/i);
  });
});

describe('Wait — extremely simple', () => {
  it('shows the duration and nothing else', async () => {
    mountBuilder();
    await screen.findByText('Preview');
    selectNode('wait-1');
    const editor = await screen.findByLabelText('Wait settings');

    expect(screen.getByText('Wait for')).toBeInTheDocument();
    expect(screen.getByLabelText('Duration')).toBeInTheDocument();
    expect(editor.querySelectorAll('input, textarea')).toHaveLength(1);
    expect(screen.queryByText('More options')).not.toBeInTheDocument();
  });
});

describe('the canvas keeps its width', () => {
  it('the side region opens for panels, never for a selected step', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');

    selectNode('send-plain');
    await screen.findByLabelText('Message settings');
    // No complementary landmark outside the canvas belongs to the step.
    expect(screen.queryByRole('complementary', { name: 'Preview' })).not.toBeInTheDocument();

    await user.click(screen.getByText('Preview'));
    expect(await screen.findByRole('complementary', { name: 'Preview' })).toBeInTheDocument();
    // One context at a time, same rule as before: the panel took the slot.
    await waitFor(() => expect(screen.queryByLabelText('Message settings')).not.toBeInTheDocument());
  });
});

describe('narrow screens', () => {
  it('the same editor arrives as a bottom sheet instead of a floating card', async () => {
    // A phone-shaped viewport: media queries answer as a 480px window would —
    // the setup polyfill's blanket `matches: false` would otherwise hide the
    // narrow path entirely.
    Object.defineProperty(window, 'innerWidth', { value: 480, configurable: true });
    const realMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true, configurable: true,
      value: (query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
    try {
      mountBuilder();
      await screen.findByText('Preview');

      selectNode('send-plain');
      const editor = await screen.findByLabelText('Message settings');

      // Rendered by the page as a sheet — NOT handed to the canvas to anchor.
      expect(screen.getByTestId('canvas')).not.toContainElement(editor);
      expect(canvas.props?.editorSlot ?? null).toBeNull();
      expect(screen.getByDisplayValue('Here you go')).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true, configurable: true, value: realMatchMedia,
      });
    }
  });

  it('a tablet with the sidebar showing is a narrow screen too', async () => {
    // "Narrow" is about the CANVAS, not the window. From 768px up the 280px
    // sidebar is on screen, so a 900px tablet has a 620px content column —
    // anchoring a 320px card there would leave 300px of canvas. The
    // breakpoint answers for the room the editor actually has: media
    // queries here respond as a real 900px window would (max-width: 987px
    // matches; the desktop min-widths do not).
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true });
    const realMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true, configurable: true,
      value: (query: string) => ({
        matches: /max-width:\s*(\d+)/.test(query)
          ? 900 <= Number(/max-width:\s*(\d+)/.exec(query)![1])
          : /min-width:\s*(\d+)/.test(query)
            ? 900 >= Number(/min-width:\s*(\d+)/.exec(query)![1])
            : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
    try {
      mountBuilder();
      await screen.findByText('Preview');

      selectNode('send-plain');
      const editor = await screen.findByLabelText('Message settings');

      // The sheet, not the anchored card — same assertion as the phone case.
      expect(screen.getByTestId('canvas')).not.toContainElement(editor);
      expect(canvas.props?.editorSlot ?? null).toBeNull();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true, configurable: true, value: realMatchMedia,
      });
    }
  });
});
