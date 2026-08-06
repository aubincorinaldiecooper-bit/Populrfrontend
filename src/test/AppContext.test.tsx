import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { authClientMock, resetAuthClientMock } from './authClient.mock';
import { AppProvider, useApp } from '../context/AppContext';
import { AuthProvider } from '../context/AuthContext';
import type { ConnectedAccount } from '../lib/api';

/* Regression coverage for a bug found in PR review: refreshConnectedAccounts
 * previously (a) didn't return its promise, so `await refreshConnectedAccounts()`
 * in ConnectionsPage.tsx's disconnect handler was a no-op, and (b) left a
 * platform's status untouched when the backend reported it 'disconnected'
 * instead of explicitly transitioning to 'idle' — so a card stayed on
 * "Connected" / "Disconnect" after a successful disconnect until a full
 * reload. Both are fixed in AppContext.tsx. Exercises the real AppProvider
 * (not a mock of useApp) against a controllable fetchConnectedAccounts,
 * since the bug lived in the provider's own reconciliation logic. */

let mockAccounts: ConnectedAccount[] = [];

// Spied at the API (endpoint) boundary so tests can assert which endpoints
// the REAL AppContext lifecycle actually reaches. getPlatformConnectUrl
// rejects by default: the success path assigns window.location.href, which
// jsdom can't navigate — the rejection exercises the real error handling
// while keeping the full code path in play.
const apiSpies = vi.hoisted(() => ({
  disconnectAccount: vi.fn(async () => { throw new Error('disconnect endpoint must not be reached by connect flows'); }),
  getPlatformConnectUrl: vi.fn(async (): Promise<string> => { throw new Error('redirect suppressed in jsdom'); }),
  // Overridable per-test so the stale-write guard can be exercised with
  // controlled resolution ordering; defaults to the current mockAccounts.
  fetchConnectedAccounts: vi.fn(),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchConnectedAccounts: apiSpies.fetchConnectedAccounts,
    syncConnectedAccounts: () => Promise.resolve({ synced: 0, skipped: 0, accounts: [] }),
    getPlatformConnectUrl: apiSpies.getPlatformConnectUrl,
    disconnectAccount: apiSpies.disconnectAccount,
  };
});

function Harness() {
  const { connectedPlatforms, refreshConnectedAccounts, completeOAuthReturn, beginPlatformConnect, toasts } = useApp();
  const instagram = connectedPlatforms.find(p => p.id === 'instagram');
  return (
    <div>
      <button onClick={() => { void refreshConnectedAccounts(); }}>refresh</button>
      <button onClick={() => beginPlatformConnect('instagram')}>begin-connect</button>
      <button onClick={() => { void completeOAuthReturn('instagram', { accountId: 'acc_ig_2' }); }}>verify-second</button>
      <button onClick={() => { void completeOAuthReturn('instagram', { accountId: 'acc_ig_2', restored: true }); }}>verify-restored</button>
      <span data-testid="status">{instagram?.status ?? 'missing'}</span>
      <span data-testid="toasts">{toasts.map(t => t.message).join('|')}</span>
    </div>
  );
}

beforeEach(() => {
  resetAuthClientMock();
  apiSpies.fetchConnectedAccounts.mockReset();
  apiSpies.fetchConnectedAccounts.mockImplementation(async () => mockAccounts);
  authClientMock.getSession.mockResolvedValue({
    data: {
      session: { id: 'sess_1', userId: 'user_1', expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
      user: { id: 'user_1', email: 'creator@example.test', name: 'Creator' },
    },
  });
});

function igAccount(over: Partial<ConnectedAccount>): ConnectedAccount {
  return {
    id: 'acc', platform: 'instagram', username: 'creator', display_name: null,
    avatar_url: null, is_connected: true, status: 'connected', connected_at: null, ...over,
  };
}

describe('AppContext — accounts stale-write guard', () => {
  it('a slow earlier refresh cannot overwrite a newer one that already resolved', async () => {
    mockAccounts = [];
    // Two reads: the first (older) resolves LAST with a stale empty list; the
    // second (newer) resolves first with the real account. The guard must keep
    // the newer result — the app-mount-vs-OAuth-verify race in miniature.
    let resolveOld!: (v: ConnectedAccount[]) => void;
    const oldRead = new Promise<ConnectedAccount[]>(r => { resolveOld = r; });
    const fresh = [igAccount({ id: 'acc_ig_1' })];

    // The mount effect issues read #0 (resolves []); we then issue #1 (old,
    // deferred) and #2 (new, immediate) via the refresh button.
    apiSpies.fetchConnectedAccounts
      .mockImplementationOnce(async () => [])        // mount read
      .mockImplementationOnce(() => oldRead)          // older, resolves last
      .mockImplementationOnce(async () => fresh);     // newer, resolves first

    render(<AuthProvider><AppProvider><Harness /></AppProvider></AuthProvider>);
    await waitFor(() => expect(apiSpies.fetchConnectedAccounts).toHaveBeenCalledTimes(1));

    // Issue the older read (stays pending), then the newer read (resolves now).
    fireEvent.click(screen.getByText('refresh'));
    fireEvent.click(screen.getByText('refresh'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('connected'));

    // Now let the older read resolve with the stale empty list — it must be
    // dropped, leaving the connected account in place.
    await act(async () => { resolveOld([]); await oldRead; });
    expect(screen.getByTestId('status')).toHaveTextContent('connected');
  });

  it('a newer read that FAILS still supersedes an older read that later succeeds', async () => {
    // Codex's case: the latest issued read is what counts, even when it fails.
    // Order of resolution: newer fails first, older succeeds last — the older
    // success must NOT land (it's stale), and the newer failure's error stands.
    mockAccounts = [];
    let resolveOld!: (v: ConnectedAccount[]) => void;
    const oldRead = new Promise<ConnectedAccount[]>(r => { resolveOld = r; });
    apiSpies.fetchConnectedAccounts
      .mockImplementationOnce(async () => [])                                   // mount read
      .mockImplementationOnce(() => oldRead)                                    // older, resolves LAST (success)
      .mockImplementationOnce(async () => { throw new Error('newer failed'); }); // newer, fails FIRST

    render(<AuthProvider><AppProvider><Harness /></AppProvider></AuthProvider>);
    await waitFor(() => expect(apiSpies.fetchConnectedAccounts).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('refresh')); // older (pending)
    fireEvent.click(screen.getByText('refresh')); // newer (rejects)
    await waitFor(() => expect(apiSpies.fetchConnectedAccounts).toHaveBeenCalledTimes(3));

    // Let the older read succeed with a real account — it must be dropped.
    await act(async () => { resolveOld([igAccount({ id: 'acc_stale' })]); await oldRead.catch(() => {}); });
    expect(screen.getByTestId('status')).not.toHaveTextContent('connected');
  });
});

describe('AppContext — refreshConnectedAccounts', () => {
  it('transitions a platform back to idle once the backend reports it disconnected', async () => {
    mockAccounts = [];
    render(
      <AuthProvider>
        <AppProvider>
          <Harness />
        </AppProvider>
      </AuthProvider>
    );

    // Bring it to "connected" first, matching a real prior-connection state.
    mockAccounts = [{
      id: 'acc_ig_1',
      platform: 'instagram',
      username: 'creator',
      display_name: null,
      avatar_url: null,
      is_connected: true,
      status: 'connected',
      connected_at: new Date().toISOString(),
    }];
    fireEvent.click(screen.getByText('refresh'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('connected'));

    // Simulate what the backend reports right after a successful disconnect.
    mockAccounts = [{
      id: 'acc_ig_1',
      platform: 'instagram',
      username: 'creator',
      display_name: null,
      avatar_url: null,
      is_connected: false,
      status: 'disconnected',
      connected_at: null,
    }];
    fireEvent.click(screen.getByText('refresh'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('idle'));
  });
});

describe('AppContext — completeOAuthReturn with a specific account id', () => {
  /* "Connect another" verification must target the account the callback said
   * was added, not the platform. Platform-level matching declares success the
   * moment ANY account on the platform is connected — with an account already
   * live, that's instantly, regardless of whether the new one ever arrived.
   * The toast naming the SECOND account's handle is the discriminator: the
   * platform-level match would find the first account and name that one. */

  function twoAccounts(): ConnectedAccount[] {
    const base = {
      display_name: null, avatar_url: null, is_connected: true,
      status: 'connected' as const, connected_at: new Date().toISOString(),
    };
    return [
      { id: 'acc_ig_1', platform: 'instagram', username: 'main_ig', ...base },
      { id: 'acc_ig_2', platform: 'instagram', username: 'second_ig', ...base },
    ];
  }

  it('verifies the named account and toasts ITS handle, not the pre-existing one', async () => {
    mockAccounts = twoAccounts();
    render(
      <AuthProvider>
        <AppProvider>
          <Harness />
        </AppProvider>
      </AuthProvider>
    );
    fireEvent.click(screen.getByText('verify-second'));
    await waitFor(() => expect(screen.getByTestId('toasts')).toHaveTextContent('@second_ig connected.'));
  });

  it('a restored account is announced as reconnected, not newly connected', async () => {
    mockAccounts = twoAccounts();
    render(
      <AuthProvider>
        <AppProvider>
          <Harness />
        </AppProvider>
      </AuthProvider>
    );
    fireEvent.click(screen.getByText('verify-restored'));
    await waitFor(() => expect(screen.getByTestId('toasts')).toHaveTextContent('@second_ig reconnected.'));
  });

  it('the REAL connect lifecycle never reaches the disconnect endpoint', async () => {
    /* Endpoint-level regression for the multi-account incident: this runs
     * the production beginPlatformConnect and completeOAuthReturn (no
     * mocked context), with spies at the API boundary — a regression that
     * wired any connect path to the disconnect API would trip the spy. */
    mockAccounts = twoAccounts();
    render(
      <AuthProvider>
        <AppProvider>
          <Harness />
        </AppProvider>
      </AuthProvider>
    );

    fireEvent.click(screen.getByText('begin-connect'));
    await waitFor(() => expect(apiSpies.getPlatformConnectUrl).toHaveBeenCalledWith('instagram', expect.any(String)));

    fireEvent.click(screen.getByText('verify-second'));
    await waitFor(() => expect(screen.getByTestId('toasts')).toHaveTextContent('@second_ig connected.'));

    expect(apiSpies.disconnectAccount).not.toHaveBeenCalled();
  });
});
