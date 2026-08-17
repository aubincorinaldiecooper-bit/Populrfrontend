import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import NotificationsPage from '../pages/NotificationsPage';
import { resetNotificationsUnreadForTests } from '../components/app/useNotificationsUnread';
import type { WorkspaceNotification } from '../lib/api';

/* The feed page, and the one thing a page of rows can get wrong.
 *
 * A row with nowhere to go stays where it is after it's followed, so the
 * creator's finger is still over it. If reading were only recorded when
 * the server answered, a second click during that gap would send a second
 * request and spend a second decrement the badge never owed. These tests
 * pin the row turning read on the spot — and coming back if the server
 * never heard it.
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

function notification(id: string, title: string): WorkspaceNotification {
  return {
    id,
    kind: 'account_reconnect',
    title,
    body: null,
    linkPath: null,
    createdAt: new Date().toISOString(),
    readAt: null,
  };
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
});
