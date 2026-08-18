import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { render } from './render';
import { authClientMock, resetAuthClientMock } from './authClient.mock';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { useNotifications } from '../components/app/useNotifications';

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

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchNotifications: (...args: unknown[]) => fetchNotificationsMock(...args),
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
  fetchNotificationsMock.mockResolvedValue({ notifications: [], unread: 4 });
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
