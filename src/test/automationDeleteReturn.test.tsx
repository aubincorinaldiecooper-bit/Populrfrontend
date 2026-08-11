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
 * The cause was the architecture, not a missing event handler. Delete held the
 * server call for seven seconds so Undo could restore the automation rather
 * than rebuild a lookalike — which made the deletion itself contingent on the
 * browser surviving those seven seconds. A reload, a crash, a closed tab or a
 * phone that discarded the tab meant the DELETE was never sent at all. Not a
 * race with the refetch: no request existed to race.
 *
 * The delete is sent when it is asked for now, and Undo is an explicit
 * restore. What this file pins:
 *  1. deleting sends the DELETE immediately, with no timer to wait out;
 *  2. nothing about leaving the page can lose it — unmount, `pagehide`, or
 *     simply waiting past the old window all leave exactly one request sent;
 *  3. the return refetch still waits for a delete that is in flight, and the
 *     list is filtered by what is in flight so the wait can safely give up;
 *  4. a delete that genuinely failed puts the row back AND says why;
 *  5. Undo restores through the backend, and takes the server's flow — which
 *     comes back paused — rather than re-inserting the stale captured one;
 *  6. Undo waits for the DELETE to land before restoring, so it cannot be
 *     overtaken by the very request it is undoing.
 */

function flow(id: string, name: string, status: AutomationFlow['status'] = 'draft'): AutomationFlow {
  return {
    id,
    name,
    status,
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

/** Soft delete: held out of the list, kept for restore. */
let softDeleted: AutomationFlow[] = [];
const mockDeleteFlow = vi.fn(async (id: string) => {
  await new Promise<void>(resolve => { releaseDelete = resolve; });
  const hit = serverFlows.find(f => f.id === id);
  if (hit) softDeleted.push(hit);
  serverFlows = serverFlows.filter(f => f.id !== id);
  return { deleted: true };
});

/** Restore, as the backend does it: the row comes back PAUSED. */
const mockRestoreFlow = vi.fn(async (id: string) => {
  const hit = softDeleted.find(f => f.id === id);
  if (!hit) throw new Error('not found');
  softDeleted = softDeleted.filter(f => f.id !== id);
  const restored = { ...hit, status: 'paused' as const, updatedAt: new Date().toISOString() };
  serverFlows = [restored, ...serverFlows];
  return { flow: restored, restoredPaused: true };
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
    restoreFlow: (id: string) => mockRestoreFlow(id),
  };
});

/** The toast's Undo handler, captured from the success toast. */
function undoFrom(showToast: ReturnType<typeof vi.fn>): (() => void) | undefined {
  const call = showToast.mock.calls.find(c => String(c[0]).includes('deleted'));
  return (call?.[2] as { action?: { onClick: () => void } } | undefined)?.action?.onClick;
}

function reset() {
  releaseDelete = null;
  softDeleted = [];
  mockDeleteFlow.mockClear();
  mockRestoreFlow.mockClear();
}

describe('deleting an automation, then coming back to the page', () => {
  it('sends the DELETE straight away, with no window to wait out', async () => {
    // The whole point of the change. Under the old design nothing had been
    // sent at this moment, and everything that could go wrong from here —
    // reload, crash, tab close — went wrong because of that.
    serverFlows = [flow('f1', 'Guide DM'), flow('f2', 'Waitlist DM')];
    reset();
    const showToast = vi.fn();
    mockUseApp.mockReturnValue({ showToast });
    const user = userEvent.setup();

    render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Guide DM')).toBeInTheDocument());

    await user.click(screen.getAllByLabelText(/delete/i)[0]);

    expect(mockDeleteFlow).toHaveBeenCalledWith('f1');
    expect(screen.queryByText('Guide DM')).not.toBeInTheDocument();

    landPendingDelete();
    await act(async () => { await Promise.resolve(); });
  });

  it('does not show it again while the delete is still in flight', async () => {
    serverFlows = [flow('f1', 'Guide DM'), flow('f2', 'Waitlist DM')];
    reset();
    const showToast = vi.fn();
    mockUseApp.mockReturnValue({ showToast });
    const user = userEvent.setup();

    const view = render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Guide DM')).toBeInTheDocument());

    await user.click(screen.getAllByLabelText(/delete/i)[0]);
    // Left unresolved so the return happens while the request is still open —
    // "sent" is not "answered", and a list fetched in between is stale.
    view.unmount();

    render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText('Guide DM')).not.toBeInTheDocument();

    landPendingDelete();
    await waitFor(() => expect(screen.getByText('Waitlist DM')).toBeInTheDocument());
    expect(screen.queryByText('Guide DM')).not.toBeInTheDocument();
  });

  it('sends exactly one delete no matter how the page goes away', async () => {
    // Unmount, `pagehide`, and waiting past the old seven-second window used
    // to be three different ways of sending — or losing — the request. They
    // are now three ways of doing nothing, because it has already gone. A
    // second dispatch would be worse than none: it would 404 against a row
    // already deleted and report a failure for a delete that succeeded.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      serverFlows = [flow('f1', 'daytime party'), flow('f2', 'weekend boat drops!')];
      reset();
      const showToast = vi.fn();
      mockUseApp.mockReturnValue({ showToast });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      const view = render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
      await waitFor(() => expect(screen.getByText('daytime party')).toBeInTheDocument());

      await user.click(screen.getAllByLabelText(/delete/i)[0]);
      landPendingDelete();
      await act(async () => { await Promise.resolve(); });
      await user.click(screen.getAllByLabelText(/delete/i)[0]);
      landPendingDelete();
      await act(async () => { await Promise.resolve(); });

      expect(mockDeleteFlow.mock.calls.map(c => c[0]).sort()).toEqual(['f1', 'f2']);

      // The document goes away, then React tears down, then time passes well
      // past the old undo window. None of it may send anything.
      act(() => { window.dispatchEvent(new Event('pagehide')); });
      view.unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(15000); });

      expect(mockDeleteFlow).toHaveBeenCalledTimes(2);

      // And they are gone from the server, so the next load agrees.
      render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
      await waitFor(() => expect(screen.getByText('No automations yet')).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts it back and says why when the delete actually failed', async () => {
    serverFlows = [flow('f1', 'Guide DM')];
    reset();
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
    reset();
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
      reset();
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
});

describe('Undo', () => {
  it('restores through the backend and shows the server\'s flow, paused', async () => {
    // Undo can no longer mean "cancel a request we never sent". It restores a
    // row the backend still has — and takes back what the backend says that
    // row now is, rather than re-inserting the captured object. Restoring a
    // live automation as "live" would claim something Instagram was told to
    // stop and has not been told to start again.
    serverFlows = [flow('f1', 'Guide DM', 'live')];
    reset();
    const showToast = vi.fn();
    mockUseApp.mockReturnValue({ showToast });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Guide DM')).toBeInTheDocument());
    await user.click(screen.getAllByLabelText(/delete/i)[0]);
    expect(screen.queryByText('Guide DM')).not.toBeInTheDocument();

    landPendingDelete();
    await act(async () => { await Promise.resolve(); });

    undoFrom(showToast)?.();
    await waitFor(() => expect(mockRestoreFlow).toHaveBeenCalledWith('f1'));
    await waitFor(() => expect(screen.getByText('Guide DM')).toBeInTheDocument());

    // Back switched off, not live — read off the row's own control, which
    // offers Activate for anything that isn't running and Pause for anything
    // that is. And said out loud, because it was live when it was deleted.
    await waitFor(() => expect(screen.getByLabelText('Activate Guide DM')).toBeInTheDocument());
    expect(screen.queryByLabelText('Pause Guide DM')).not.toBeInTheDocument();
    expect(showToast.mock.calls.some(c => String(c[0]).includes('switched off'))).toBe(true);
  });

  it('waits for the DELETE to land before restoring', async () => {
    // Pressing Undo quickly is the normal case, not the edge case. Firing the
    // restore straight away would race the DELETE it is undoing: restore
    // first, 404 (nothing is deleted yet), then the delete lands and the
    // automation is gone for good with the toast already dismissed.
    serverFlows = [flow('f1', 'Guide DM')];
    reset();
    const showToast = vi.fn();
    mockUseApp.mockReturnValue({ showToast });
    const user = userEvent.setup();

    render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Guide DM')).toBeInTheDocument());
    await user.click(screen.getAllByLabelText(/delete/i)[0]);

    // Undo while the DELETE is still open.
    undoFrom(showToast)?.();
    await act(async () => { await Promise.resolve(); });
    expect(mockRestoreFlow).not.toHaveBeenCalled();

    landPendingDelete();
    await waitFor(() => expect(mockRestoreFlow).toHaveBeenCalledWith('f1'));
    await waitFor(() => expect(screen.getByText('Guide DM')).toBeInTheDocument());
  });

  it('does not call restore when the delete failed, because nothing was deleted', async () => {
    // The row is already back, put there by the failure path. Restoring on top
    // of that would 404 and report a second failure for one failed delete.
    serverFlows = [flow('f1', 'Guide DM')];
    reset();
    mockDeleteFlow.mockImplementationOnce(async () => { throw new Error('Network unreachable'); });
    const showToast = vi.fn();
    mockUseApp.mockReturnValue({ showToast });
    const user = userEvent.setup();

    render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Guide DM')).toBeInTheDocument());
    await user.click(screen.getAllByLabelText(/delete/i)[0]);
    await waitFor(() => expect(screen.getByText('Guide DM')).toBeInTheDocument());

    undoFrom(showToast)?.();
    await act(async () => { await Promise.resolve(); });
    expect(mockRestoreFlow).not.toHaveBeenCalled();
    expect(screen.getByText('Guide DM')).toBeInTheDocument();
  });
});
