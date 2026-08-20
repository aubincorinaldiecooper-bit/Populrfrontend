import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from './render';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import NotificationsPage from '../pages/NotificationsPage';
import NotificationRow from '../components/app/NotificationRow';
import { useNotifications, applyRead, applyAllRead } from '../components/app/useNotifications';
import { focusManager } from '@tanstack/react-query';
import { listenForCreatorsReturn } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import type { WorkspaceNotification } from '../lib/api';

/* Reading a notification, and the four ways that used to go wrong.
 *
 * The rows and the unread count were two values kept in step by hand, so
 * every path that could interrupt the hand-off broke something: an
 * impatient second click spent two decrements, a row that navigated away
 * lost its rollback, a refresh that failed claimed everything was read.
 * They are one cached fact now, changed by pure functions and reverted by
 * the cache — so these tests are less about the page than about that fact
 * surviving the page.
 */

const fetchNotificationsMock = vi.fn();
const markNotificationsReadMock = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchNotifications: (...args: unknown[]) => fetchNotificationsMock(...args),
    markNotificationsRead: (...args: unknown[]) => markNotificationsReadMock(...args),
  };
});

function notification(
  id: string,
  title: string,
  linkPath: string | null = null,
): WorkspaceNotification {
  return {
    id,
    kind: 'account_reconnect',
    title,
    body: null,
    linkPath,
    createdAt: new Date().toISOString(),
    readAt: null,
  actor: null,
  };
}

/** The bell's dot, standing in for every badge fed by the shared cache. */
function Badge() {
  const { data } = useNotifications();
  return <span data-testid="badge">{data?.unread ?? 0}</span>;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchNotificationsMock.mockResolvedValue({
    notifications: [notification('1', 'Welcome DM'), notification('2', 'Comment catcher')],
    unread: 2,
  });
  markNotificationsReadMock.mockResolvedValue({ marked: 1 });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  );
}

describe('reading a notification', () => {
  it('is one fact: the row and the count move together, or not at all', () => {
    const before = {
      notifications: [notification('1', 'Welcome DM'), notification('2', 'Comment catcher')],
      unread: 2,
    };

    const after = applyRead(before, '1');
    expect(after.notifications[0].readAt).not.toBeNull();
    expect(after.unread).toBe(1);

    // Reading it again is not news — the count can't be spent twice, which
    // is what a second click used to do.
    expect(applyRead(after, '1')).toBe(after);
    // Nor can an id we don't hold move the count.
    expect(applyRead(after, 'nope')).toBe(after);

    const all = applyAllRead(before);
    expect(all.notifications.every(n => n.readAt !== null)).toBe(true);
    expect(all.unread).toBe(0);
  });

  it('spends one request and one decrement, however fast the second click lands', async () => {
    let release: (value: { marked: number }) => void = () => {};
    markNotificationsReadMock.mockReturnValue(
      new Promise<{ marked: number }>(resolve => {
        release = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.dblClick(await screen.findByRole('button', { name: /Welcome DM/ }));
    release({ marked: 1 });

    await waitFor(() => expect(markNotificationsReadMock).toHaveBeenCalledTimes(1));
    expect(markNotificationsReadMock).toHaveBeenCalledWith('1');
    // One of two read: the other still owes a decrement, so the bulk escape
    // is still offered. Two decrements would have zeroed it and hidden it.
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeInTheDocument();
  });

  it('puts the dot back when the server never heard it', async () => {
    let reject: (reason: Error) => void = () => {};
    markNotificationsReadMock.mockReturnValue(
      new Promise<{ marked: number }>((_resolve, r) => {
        reject = r;
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Welcome DM.*unread/ }));
    expect(screen.queryByRole('button', { name: /Welcome DM.*unread/ })).not.toBeInTheDocument();

    // The settling refetch must fail too, or IT would restore the row and
    // this test would pass with the rollback deleted — which is exactly how
    // the first version of it passed.
    fetchNotificationsMock.mockRejectedValue(new Error('offline'));
    reject(new Error('offline'));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Welcome DM.*unread/ })).toBeInTheDocument(),
    );
  });

  it('finishes marking read after a linked row has taken the page away', async () => {
    fetchNotificationsMock.mockResolvedValue({
      notifications: [
        notification('1', 'Guide DM is live', '/automations/a1'),
        notification('2', 'Comment catcher'),
      ],
      unread: 2,
    });
    let reject: (reason: Error) => void = () => {};
    markNotificationsReadMock.mockReturnValue(
      new Promise<{ marked: number }>((_resolve, r) => {
        reject = r;
      }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <Badge />
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/automations/a1" element={<p>The automation</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('2'));

    await user.click(await screen.findByRole('link', { name: /Guide DM is live/ }));
    expect(screen.getByText('The automation')).toBeInTheDocument();
    expect(screen.getByTestId('badge')).toHaveTextContent('1');

    // Same reason as above: with the refetch alive, the count would come
    // back whether or not anything rolled it back.
    fetchNotificationsMock.mockRejectedValue(new Error('offline'));
    reject(new Error('offline'));

    // The page that started this is gone. The rollback belongs to the
    // cache, not to it.
    await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('2'));
  });

  it('does not let one failed read un-read the row another click just read', async () => {
    // Reading is not one-at-a-time: two rows get clicked inside one request.
    // A rollback that restores the whole snapshot would take the second row
    // back to unread, undoing something the creator watched happen.
    const settlers: { reject: (e: Error) => void; resolve: (v: { marked: number }) => void }[] = [];
    markNotificationsReadMock.mockImplementation(
      () => new Promise<{ marked: number }>((resolve, reject) => { settlers.push({ resolve, reject }); }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Welcome DM.*unread/ }));
    await user.click(await screen.findByRole('button', { name: /Comment catcher.*unread/ }));
    await waitFor(() => expect(settlers.length).toBe(2));

    // The first read fails while the second is still out. Nothing may come
    // back for it — the refetch would tell us, but it hasn't happened yet.
    fetchNotificationsMock.mockReturnValue(new Promise(() => {}));
    settlers[0].reject(new Error('offline'));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Welcome DM.*unread/ })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Comment catcher.*unread/ })).not.toBeInTheDocument();
  });

  it('clears the dot the moment Mark all read is pressed, not when the server agrees', async () => {
    // The whole optimistic update for marking everything read was removable
    // without a test noticing: the old assertion only checked the request
    // went out. What the creator is promised is the dot going away NOW.
    let release: (value: { marked: number }) => void = () => {};
    markNotificationsReadMock.mockReturnValue(
      new Promise<{ marked: number }>(resolve => { release = resolve; }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Badge />
        <NotificationsPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('2'));

    await user.click(screen.getByRole('button', { name: 'Mark all read' }));

    // Still in flight — and already read, everywhere.
    expect(screen.getByTestId('badge')).toHaveTextContent('0');
    expect(screen.queryByRole('button', { name: /unread/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all read' })).not.toBeInTheDocument();

    release({ marked: 2 });
    await waitFor(() => expect(markNotificationsReadMock).toHaveBeenCalledWith());
  });

  it('a refetch already in flight cannot undo the read it predates', async () => {
    // cancelQueries in the optimistic helper is what stops a fetch that left
    // BEFORE the click from landing after it with an answer that knows
    // nothing about it.
    const user = userEvent.setup();
    const { queryClient } = renderPage();
    await screen.findByRole('button', { name: /Welcome DM.*unread/ });

    // A refetch leaves and hangs — the 60s poll, or a window regaining focus.
    let answerStaleFetch: (value: unknown) => void = () => {};
    fetchNotificationsMock.mockReturnValue(
      new Promise(resolve => { answerStaleFetch = resolve; }),
    );
    void queryClient.refetchQueries({ queryKey: queryKeys.notifications });
    await waitFor(() => expect(queryClient.isFetching()).toBe(1));

    // Now the row is read, while that fetch is still out.
    markNotificationsReadMock.mockReturnValue(new Promise(() => {}));
    await user.click(screen.getByRole('button', { name: /Welcome DM.*unread/ }));
    expect(screen.queryByRole('button', { name: /Welcome DM.*unread/ })).not.toBeInTheDocument();

    // The stale answer arrives, still describing the row as unread.
    answerStaleFetch({
      notifications: [notification('1', 'Welcome DM'), notification('2', 'Comment catcher')],
      unread: 2,
    });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    // It must not resurrect what it never knew was read.
    expect(screen.queryByRole('button', { name: /Welcome DM.*unread/ })).not.toBeInTheDocument();
  });

  it('keeps the last real answer when a refresh cannot reach the server', async () => {
    const { queryClient } = render(<Badge />);
    await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('2'));

    fetchNotificationsMock.mockRejectedValue(new Error('offline'));
    await queryClient.refetchQueries({ queryKey: queryKeys.notifications });

    // The refetch really happened — a key typo that made this a no-op would
    // otherwise leave the assertion below passing for nothing.
    expect(fetchNotificationsMock.mock.calls.length).toBeGreaterThan(1);
    // Not zero: nothing was read, we simply couldn't ask.
    expect(screen.getByTestId('badge')).toHaveTextContent('2');
  });
});

describe('coming back to the app', () => {
  it('counts a window regaining focus, not only a tab becoming visible', () => {
    // The cache's own answer is visibilitychange alone, which never fires
    // when the browser was on screen the whole time and the creator was in
    // another application — the ordinary desktop case, and the one the
    // deleted store covered by listening for window focus too.
    const seen: boolean[] = [];
    const unsubscribe = focusManager.subscribe(focused => seen.push(focused));
    listenForCreatorsReturn();
    try {
      window.dispatchEvent(new Event('focus'));
      expect(seen.length).toBeGreaterThan(0);
    } finally {
      unsubscribe();
    }
  });
});

describe('who did it', () => {
  const row = (over: Partial<WorkspaceNotification> = {}): WorkspaceNotification => ({
    id: 'n1', kind: 'automation_edited',
    title: 'Robin edited Culture comments',
    body: null, linkPath: '/automations/flow_1',
    createdAt: new Date().toISOString(), readAt: null,
    actor: { name: 'Robin', email: 'robin@example.com', avatarUrl: null },
    ...over,
  });

  it('shows the person, not a generic glyph', () => {
    render(<MemoryRouter><NotificationRow notification={row()} onOpen={vi.fn()} /></MemoryRouter>);
    // The icon says the KIND, which the sentence beside it already says.
    // Who did it is the part a face can carry and a sentence reads slower.
    expect(screen.getByText('R')).toBeInTheDocument();
  });

  it('keeps the glyph when nobody did it', () => {
    // An account falling out of authorisation is not somebody's doing, and
    // borrowing a face for it would say something untrue.
    const { container } = render(
      <MemoryRouter>
        <NotificationRow
          notification={row({ kind: 'account_reconnect', title: 'Reconnect Instagram', actor: null })}
          onOpen={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText('R')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
