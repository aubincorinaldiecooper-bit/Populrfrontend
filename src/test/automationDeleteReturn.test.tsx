import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import AutomationsPage from '../pages/AutomationsPage';
import type { AutomationFlow } from '../lib/api';

/* Deleting an automation, then navigating away and coming back.
 *
 * The reported symptom: delete an automation, leave the page, return, and it
 * is still listed as though the delete never happened.
 *
 * The cause is the undo window. Delete holds the server call for seven
 * seconds so Undo can genuinely restore the automation rather than rebuild a
 * lookalike, and leaving the page inside that window commits the delete on the
 * way out. But it was sent fire-and-forget — so navigating straight back
 * re-mounted the page and refetched the list before the DELETE had reached the
 * server, and the response still contained the deleted automation. It then sat
 * there looking undeleted until something else happened to reload.
 *
 * What this pins:
 *  1. the return refetch waits for a delete committed on the way out;
 *  2. a delete that genuinely failed puts the row back AND says why, rather
 *     than letting the reappearance be the only evidence — that failure used
 *     to be swallowed by a component that no longer existed;
 *  3. Undo inside the window still cancels the delete entirely.
 */

function flow(id: string, name: string): AutomationFlow {
  return {
    id,
    name,
    status: 'draft',
    accountId: 'acct_1',
    platform: 'instagram',
    graph: { schemaVersion: 1, nodes: [], edges: [] },
    version: 1,
    activatedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as AutomationFlow;
}

let serverFlows: AutomationFlow[] = [];
/** Resolves the pending DELETE, so a test controls when it lands. */
let releaseDelete: (() => void) | null = null;

/** Called through a function so the assignment inside the mock is visible to
 *  the type checker — read directly, it narrows to `never` after the reset. */
function landPendingDelete() {
  releaseDelete?.();
}

const mockFetchFlows = vi.fn(async () => [...serverFlows]);
const mockDeleteFlow = vi.fn(async (id: string) => {
  await new Promise<void>(resolve => { releaseDelete = resolve; });
  serverFlows = serverFlows.filter(f => f.id !== id);
});

const mockUseApp = vi.fn();

vi.mock('../context/AppContext', () => ({ useApp: () => mockUseApp() }));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchFlows: () => mockFetchFlows(),
    deleteFlow: (id: string) => mockDeleteFlow(id),
  };
});

/** The toast's Undo handler, captured from the success toast. */
function undoFrom(showToast: ReturnType<typeof vi.fn>): (() => void) | undefined {
  const call = showToast.mock.calls.find(c => String(c[0]).includes('deleted'));
  return (call?.[2] as { action?: { onClick: () => void } } | undefined)?.action?.onClick;
}

describe('deleting an automation, then coming back to the page', () => {
  it('does not show it again while the committed delete is still in flight', async () => {
    serverFlows = [flow('f1', 'Guide DM'), flow('f2', 'Waitlist DM')];
    releaseDelete = null;
    const showToast = vi.fn();
    mockUseApp.mockReturnValue({ showToast });
    const user = userEvent.setup();

    const view = render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Guide DM')).toBeInTheDocument());

    await user.click(screen.getAllByLabelText(/delete/i)[0]);
    expect(screen.queryByText('Guide DM')).not.toBeInTheDocument();

    // Navigate away inside the undo window: the delete is committed on the
    // way out, and is deliberately left unresolved here so the return happens
    // while it is still in flight — the exact race that caused the bug.
    view.unmount();
    expect(mockDeleteFlow).toHaveBeenCalledWith('f1');

    render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
    // Let the re-mount get as far as it can while the DELETE hangs.
    await Promise.resolve();
    expect(screen.queryByText('Guide DM')).not.toBeInTheDocument();

    // The DELETE lands; the list that follows is the truthful one.
    landPendingDelete();
    await waitFor(() => expect(screen.getByText('Waitlist DM')).toBeInTheDocument());
    expect(screen.queryByText('Guide DM')).not.toBeInTheDocument();
  });

  it('does not show it again when the undo window expired and the request is still in flight', async () => {
    // The narrower door left open by the first fix: once the undo timer
    // fires, the delete stopped being tracked as pending and was awaited
    // untracked. Leaving the page during that request and returning raced it
    // exactly as before — and a draft, the thing most often deleted right
    // after being abandoned in the builder, is where that happens most.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      serverFlows = [flow('f1', 'Half-built draft'), flow('f2', 'Waitlist DM')];
      releaseDelete = null;
      const showToast = vi.fn();
      mockUseApp.mockReturnValue({ showToast });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      const view = render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
      await waitFor(() => expect(screen.getByText('Half-built draft')).toBeInTheDocument());
      await user.click(screen.getAllByLabelText(/delete/i)[0]);

      // Let the undo window expire, so the delete is sent — and left hanging.
      await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
      await waitFor(() => expect(mockDeleteFlow).toHaveBeenCalledWith('f1'));

      view.unmount();
      render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
      await act(async () => { await Promise.resolve(); });
      expect(screen.queryByText('Half-built draft')).not.toBeInTheDocument();

      landPendingDelete();
      await waitFor(() => expect(screen.getByText('Waitlist DM')).toBeInTheDocument());
      expect(screen.queryByText('Half-built draft')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts it back and says why when the delete actually failed', async () => {
    serverFlows = [flow('f1', 'Guide DM')];
    releaseDelete = null;
    mockDeleteFlow.mockImplementationOnce(async () => { throw new Error('Network unreachable'); });
    const showToast = vi.fn();
    mockUseApp.mockReturnValue({ showToast });
    const user = userEvent.setup();

    const view = render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Guide DM')).toBeInTheDocument());
    await user.click(screen.getAllByLabelText(/delete/i)[0]);
    view.unmount();

    render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
    // It comes back because it was never deleted — and the creator is told,
    // instead of being left to infer it from the row's reappearance.
    await waitFor(() => expect(screen.getByText('Guide DM')).toBeInTheDocument());
    await waitFor(() =>
      expect(showToast.mock.calls.some(c => String(c[0]).includes('Network unreachable'))).toBe(true));
  });

  it('stays gone across a second round trip while one delete is still in flight', async () => {
    // Raised in review on #80. The first return used to consume the record of
    // the in-flight delete, so if that page was left again before the server
    // answered, the return after it had nothing left to wait on and fetched
    // straight into the stale list.
    serverFlows = [flow('f1', 'Half-built draft'), flow('f2', 'Waitlist DM')];
    releaseDelete = null;
    const showToast = vi.fn();
    mockUseApp.mockReturnValue({ showToast });
    const user = userEvent.setup();

    const first = render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Half-built draft')).toBeInTheDocument());
    await user.click(screen.getAllByLabelText(/delete/i)[0]);
    first.unmount();

    const second = render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    second.unmount();

    render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText('Half-built draft')).not.toBeInTheDocument();

    landPendingDelete();
    await waitFor(() => expect(screen.getByText('Waitlist DM')).toBeInTheDocument());
    expect(screen.queryByText('Half-built draft')).not.toBeInTheDocument();
  });

  it('still renders the list when the delete never answers at all', async () => {
    // Also raised in review: the API client sets no timeout, so a DELETE the
    // server accepts and abandons would leave this page on its skeleton for as
    // long as the tab is open. The wait gives up — and the automation being
    // deleted still does not come back, because the list is filtered by what
    // is in flight rather than by what the wait managed to observe.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      serverFlows = [flow('f1', 'Half-built draft'), flow('f2', 'Waitlist DM')];
      releaseDelete = null;
      const showToast = vi.fn();
      mockUseApp.mockReturnValue({ showToast });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      const view = render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
      await waitFor(() => expect(screen.getByText('Half-built draft')).toBeInTheDocument());
      await user.click(screen.getAllByLabelText(/delete/i)[0]);
      view.unmount();

      render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
      // The DELETE is never released. Past the bounded wait, the page must
      // show the rest of the list rather than a skeleton.
      await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
      await waitFor(() => expect(screen.getByText('Waitlist DM')).toBeInTheDocument());
      expect(screen.queryByText('Half-built draft')).not.toBeInTheDocument();
    } finally {
      // Let the abandoned request finish. The in-flight record lives at module
      // scope — that is the whole point of it — so a delete left hanging here
      // would still be filtering that id out of the list in the next test.
      landPendingDelete();
      await act(async () => { await Promise.resolve(); });
      vi.useRealTimers();
    }
  });

  it('Undo inside the window cancels the delete outright', async () => {
    serverFlows = [flow('f1', 'Guide DM')];
    releaseDelete = null;
    mockDeleteFlow.mockClear();
    const showToast = vi.fn();
    mockUseApp.mockReturnValue({ showToast });
    const user = userEvent.setup();

    render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Guide DM')).toBeInTheDocument());
    await user.click(screen.getAllByLabelText(/delete/i)[0]);
    expect(screen.queryByText('Guide DM')).not.toBeInTheDocument();

    undoFrom(showToast)?.();
    await waitFor(() => expect(screen.getByText('Guide DM')).toBeInTheDocument());
    expect(mockDeleteFlow).not.toHaveBeenCalled();
  });
});
