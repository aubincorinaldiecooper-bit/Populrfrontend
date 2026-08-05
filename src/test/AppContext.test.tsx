import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchConnectedAccounts: () => Promise.resolve(mockAccounts),
  };
});

function Harness() {
  const { connectedPlatforms, refreshConnectedAccounts } = useApp();
  const instagram = connectedPlatforms.find(p => p.id === 'instagram');
  return (
    <div>
      <button onClick={() => { void refreshConnectedAccounts(); }}>refresh</button>
      <span data-testid="status">{instagram?.status ?? 'missing'}</span>
    </div>
  );
}

beforeEach(() => {
  resetAuthClientMock();
  authClientMock.getSession.mockResolvedValue({
    data: {
      session: { id: 'sess_1', userId: 'user_1', expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
      user: { id: 'user_1', email: 'creator@example.test', name: 'Creator' },
    },
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
