import { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import NotificationsPage from '../pages/NotificationsPage';
import {
  resetNotificationsUnreadForTests,
  refreshNotificationsUnread,
  useNotificationsUnread,
} from '../components/app/useNotificationsUnread';
import type { WorkspaceNotification } from '../lib/api';

/* The feed page, and what a page of rows can get wrong about reading.
 *
 * A row with nowhere to go stays where it is after it's followed, so the
 * creator's finger is still over it. If reading were only recorded when
 * the server answered, a second click during that gap would send a second
 * request and spend a second decrement the badge never owed. So the row
 * turns read on the spot — which puts the weight on the other side: every
 * optimistic decrement has to come back if the read never lands, INCLUDING
 * when the row was a link and this page is already gone, and including
 * when the network is down hard enough that asking again fails too.
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

/** The bell's dot, standing in for every badge fed by the shared store. */
function Badge() {
  const { count } = useNotificationsUnread();
  return <span data-testid="badge">{count}</span>;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetNotificationsUnreadForTests();
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

describe('/notifications', () => {
  it('spends one decrement per linkless row, however fast the second click lands', async () => {
    let release: (value: { marked: number }) => void = () => {};
    markNotificationsReadMock.mockReturnValue(
      new Promise<{ marked: number }>(resolve => {
        release = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPage();

    const row = await screen.findByRole('button', { name: /Welcome DM/ });
    await user.dblClick(row);
    release({ marked: 1 });

    await waitFor(() => expect(markNotificationsReadMock).toHaveBeenCalledTimes(1));
    expect(markNotificationsReadMock).toHaveBeenCalledWith('1');
    // One of two rows read: the other still owes a decrement, so the page
    // still offers the bulk escape. Two decrements would have zeroed it.
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Comment catcher/ })).toBeInTheDocument();
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
    // Read on the spot, while the request is still out.
    expect(screen.queryByRole('button', { name: /Welcome DM.*unread/ })).not.toBeInTheDocument();

    reject(new Error('offline'));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Welcome DM.*unread/ })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeInTheDocument();
  });

  it('gives the shared badge its count back even after a linked row navigated away', async () => {
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
    // Followed: the page is gone, and the dot dropped on the way out.
    expect(screen.getByText('The automation')).toBeInTheDocument();
    expect(screen.getByTestId('badge')).toHaveTextContent('1');

    await act(async () => {
      reject(new Error('offline'));
      await Promise.resolve();
    });

    // The page's own state updates are dropped on an unmounted component —
    // the shared count is not this page's to lose.
    expect(screen.getByTestId('badge')).toHaveTextContent('2');
  });
});

describe('the shared unread count', () => {
  it('keeps standing when the refresh itself cannot reach the server', async () => {
    render(<Badge />);
    await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('2'));

    fetchNotificationsMock.mockRejectedValue(new Error('offline'));
    await act(async () => {
      refreshNotificationsUnread();
      await Promise.resolve();
    });

    // Not zero: nothing was read, we simply couldn't ask.
    expect(screen.getByTestId('badge')).toHaveTextContent('2');
  });
});
