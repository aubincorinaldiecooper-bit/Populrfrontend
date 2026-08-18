import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { render } from './render';
import { authClientMock, resetAuthClientMock } from './authClient.mock';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { useNotifications, useMarkRead } from '../components/app/useNotifications';
import { queryKeys } from '../lib/queryKeys';

/* What the browser remembers about a workspace, and how long it may.
 *
 * Cached answers describe ONE person's workspace. They used to live in
 * module-level stores that no sign-out touched, so the next person to sign
 * in on the same browser could read the previous one's unread count for as
 * long as the first request took to land. The cache is scoped to the
 * session now — and to the SESSION, not to the sign-out button, because a
 * session also ends by expiring and by the backend refusing it.
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

/** Stands in for the authenticated shell, which the route gate unmounts. */
function Workspace() {
  const { data } = useNotifications();
  return <span data-testid="unread">{data ? String(data.unread) : 'nothing cached'}</span>;
}

function Harness() {
  const { session, signOut, refresh } = useAuth();
  return (
    <div>
      <span data-testid="session">{session ? 'signed in' : 'signed out'}</span>
      {session ? <Workspace /> : <p>The login screen</p>}
      <button onClick={() => void signOut()}>Sign out</button>
      <button onClick={() => void refresh()}>Sign in</button>
    </div>
  );
}

beforeEach(() => {
  resetAuthClientMock();
  fetchNotificationsMock.mockReset();
  fetchNotificationsMock.mockResolvedValue({
    notifications: [
      { id: '1', kind: 'account_reconnect', title: "Aubin's private notification",
        body: null, linkPath: null, createdAt: new Date().toISOString(), readAt: null },
    ],
    unread: 4,
  });
  markNotificationsReadMock.mockReset();
  authClientMock.getSession.mockResolvedValue({
    data: {
      session: { id: 's1', userId: 'u1', expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
      user: { id: 'u1', email: 'aubin@example.com', name: 'Aubin' },
    },
  });
  authClientMock.signOut.mockResolvedValue({});
});

describe('cached workspace data', () => {
  it('does not outlive the session that asked for it', async () => {
    const user = userEvent.setup();
    // A lifelike cache: answers outlive the component that asked for them,
    // which is the whole reason this has to be cleared deliberately. The
    // suite's default client garbage-collects on unmount and would let this
    // pass without anything clearing anything.
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 5 * 60_000, staleTime: 30_000, refetchOnWindowFocus: false },
      },
    });
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
      { queryClient },
    );

    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('4'));

    await user.click(screen.getByText('Sign out'));
    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('signed out'));

    // Someone else signs in on this browser. Their first request is still in
    // flight — which is exactly the window in which the old answer used to
    // show, because nothing had thrown it away.
    authClientMock.getSession.mockResolvedValue({
      data: {
        session: {
          id: 's2',
          userId: 'u2',
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
        user: { id: 'u2', email: 'someone@example.com', name: 'Someone else' },
      },
    });
    fetchNotificationsMock.mockReturnValue(new Promise(() => {}));
    await user.click(screen.getByText('Sign in'));

    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('signed in'));
    expect(screen.getByTestId('unread')).toHaveTextContent('nothing cached');
  });
});

describe('work still in flight when a session ends', () => {
  it('cannot write the departing person\u2019s notifications into the next one\u2019s cache', async () => {
    // The rollback outliving its caller is the property the optimistic read
    // depends on — it is what lets a linked row navigate away mid-request.
    // The same property is a leak the moment the session, rather than the
    // page, is what went away.
    let reject: (reason: Error) => void = () => {};
    markNotificationsReadMock.mockReturnValue(
      new Promise<{ marked: number }>((_resolve, r) => { reject = r; }),
    );
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 5 * 60_000, staleTime: 30_000, refetchOnWindowFocus: false },
        mutations: { retry: false },
      },
    });

    function Reader() {
      const { data } = useNotifications();
      const markRead = useMarkRead();
      return (
        <div>
          <span data-testid="unread">{data ? String(data.unread) : 'nothing cached'}</span>
          <button onClick={() => markRead.mutate('1')}>Read it</button>
        </div>
      );
    }
    function Host() {
      const { session, signOut } = useAuth();
      return (
        <div>
          <span data-testid="session">{session ? 'signed in' : 'signed out'}</span>
          {session ? <Reader /> : <p>The login screen</p>}
          <button onClick={() => void signOut()}>Sign out</button>
        </div>
      );
    }

    render(<AuthProvider><Host /></AuthProvider>, { queryClient });
    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('4'));

    // A read leaves, then the creator signs out before the server answers.
    await user.click(screen.getByText('Read it'));
    await user.click(screen.getByText('Sign out'));
    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('signed out'));

    // The request fails on the way out. Its rollback holds the previous
    // person's rows and would happily put them back.
    reject(new Error('signed out'));
    await waitFor(() => expect(markNotificationsReadMock).toHaveBeenCalled());

    expect(queryClient.getQueryData(queryKeys.notifications)).toBeUndefined();
    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain('private notification');
  });

  it('ends when the session becomes a different person, with no signing out in between', async () => {
    // A session can be replaced outright — swapped in another tab, or an
    // account switch — and never pass through null on the way.
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 5 * 60_000, staleTime: 30_000, refetchOnWindowFocus: false },
      },
    });
    function Host() {
      const { session, refresh } = useAuth();
      const { data } = useNotifications();
      return (
        <div>
          <span data-testid="who">{session?.userId ?? 'nobody'}</span>
          <span data-testid="unread">{data ? String(data.unread) : 'nothing cached'}</span>
          <button onClick={() => void refresh()}>Refresh session</button>
        </div>
      );
    }
    const user = userEvent.setup();
    render(<AuthProvider><Host /></AuthProvider>, { queryClient });
    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('4'));

    authClientMock.getSession.mockResolvedValue({
      data: {
        session: { id: 's2', userId: 'u2', expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
        user: { id: 'u2', email: 'someone@example.com', name: 'Someone else' },
      },
    });
    fetchNotificationsMock.mockReturnValue(new Promise(() => {}));
    await user.click(screen.getByText('Refresh session'));

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('u2'));
    expect(screen.getByTestId('unread')).toHaveTextContent('nothing cached');
  });
});
