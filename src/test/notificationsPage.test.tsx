import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from './render';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import NotificationsPage from '../pages/NotificationsPage';
import { useNotifications, applyRead, applyAllRead } from '../components/app/useNotifications';
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

    reject(new Error('offline'));

    // The page that started this is gone. The rollback belongs to the
    // cache, not to it.
    await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('2'));
  });

  it('keeps the last real answer when a refresh cannot reach the server', async () => {
    const { queryClient } = render(<Badge />);
    await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('2'));

    fetchNotificationsMock.mockRejectedValue(new Error('offline'));
    await queryClient.refetchQueries({ queryKey: ['notifications'] });

    // Not zero: nothing was read, we simply couldn't ask.
    expect(screen.getByTestId('badge')).toHaveTextContent('2');
  });
});
