import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import ConnectionsPage from '../pages/ConnectionsPage';
import type { ConnectedAccount } from '../lib/api';
import type { OnboardingPlatform } from '../data';

/* Regression coverage for the Connections page action-button logic: a
 * `connected` account must show "Disconnect", never "Reconnect" (which is
 * reserved for `reconnect_required`) — see ConnectionsPage.tsx's status ->
 * action mapping. useApp() is mocked directly (AppContext itself isn't
 * exported, only the hook) so this exercises the real page component
 * against a controlled, known account list rather than the full app's
 * real network/auth wiring. */

const realAccount: ConnectedAccount = {
  id: 'acc_real_instagram_123',
  platform: 'instagram',
  username: 'creator_handle',
  display_name: 'Creator Handle',
  avatar_url: null,
  is_connected: true,
  status: 'connected',
  connected_at: new Date().toISOString(),
};

const connectedPlatform: OnboardingPlatform = {
  id: 'instagram',
  name: 'Instagram',
  icon: 'instagram',
  status: 'connected',
  handle: '@creator_handle',
};

const mockUseApp = vi.fn();

vi.mock('../context/AppContext', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchCapabilities: vi.fn().mockResolvedValue([]),
  };
});

function renderConnectionsPage() {
  return render(
    <MemoryRouter>
      <ConnectionsPage />
    </MemoryRouter>
  );
}

describe('ConnectionsPage — status-to-action mapping', () => {
  it('shows "Disconnect" for a connected account, never "Reconnect"', async () => {
    mockUseApp.mockReturnValue({
      connectedPlatforms: [connectedPlatform],
      accounts: [realAccount],
      beginPlatformConnect: vi.fn(),
      completeOAuthReturn: vi.fn().mockResolvedValue(undefined),
      failOAuthReturn: vi.fn(),
      openSubscriptionModal: vi.fn(),
      refreshConnectedAccounts: vi.fn(),
      disconnectAccount: vi.fn().mockResolvedValue(undefined),
      showToast: vi.fn(),
    });

    renderConnectionsPage();

    expect(await screen.findByText('Disconnect')).toBeInTheDocument();
    expect(screen.queryByText('Reconnect')).not.toBeInTheDocument();
  });

  it('shows "Reconnect" (not "Disconnect") for a reconnect_required account', async () => {
    mockUseApp.mockReturnValue({
      connectedPlatforms: [{ ...connectedPlatform, status: 'reconnect_required' as const }],
      accounts: [{ ...realAccount, status: 'reconnect_required' as const }],
      beginPlatformConnect: vi.fn(),
      completeOAuthReturn: vi.fn().mockResolvedValue(undefined),
      failOAuthReturn: vi.fn(),
      openSubscriptionModal: vi.fn(),
      refreshConnectedAccounts: vi.fn(),
      disconnectAccount: vi.fn().mockResolvedValue(undefined),
      showToast: vi.fn(),
    });

    renderConnectionsPage();

    expect(await screen.findByText('Reconnect')).toBeInTheDocument();
    expect(screen.queryByText('Disconnect')).not.toBeInTheDocument();
  });

  it('shows "Connect" for idle platforms and "Try again" for an errored one', async () => {
    // Every one of the page's 5 hardcoded platforms needs an explicit entry
    // here, or an omitted one silently defaults to 'idle' too and produces
    // more "Connect" buttons than expected — not a product bug, just this
    // test being precise about what's actually on screen.
    mockUseApp.mockReturnValue({
      connectedPlatforms: [
        { id: 'instagram', name: 'Instagram', icon: 'instagram', status: 'idle' as const },
        { id: 'tiktok', name: 'TikTok', icon: 'tiktok', status: 'idle' as const },
        { id: 'linkedin', name: 'LinkedIn', icon: 'linkedin', status: 'error' as const, errorMessage: 'Connection failed' },
        { id: 'twitter', name: 'Twitter', icon: 'twitter', status: 'idle' as const },
        { id: 'reddit', name: 'Reddit', icon: 'reddit', status: 'idle' as const },
      ],
      accounts: [],
      beginPlatformConnect: vi.fn(),
      completeOAuthReturn: vi.fn().mockResolvedValue(undefined),
      failOAuthReturn: vi.fn(),
      openSubscriptionModal: vi.fn(),
      refreshConnectedAccounts: vi.fn(),
      disconnectAccount: vi.fn().mockResolvedValue(undefined),
      showToast: vi.fn(),
    });

    renderConnectionsPage();

    expect((await screen.findAllByText('Connect')).length).toBe(4);
    expect(screen.getByText('Try again')).toBeInTheDocument();
    expect(screen.queryByText('Disconnect')).not.toBeInTheDocument();
    expect(screen.queryByText('Reconnect')).not.toBeInTheDocument();
  });
});

/* Regression coverage for the Astryx pass: the hand-rolled disconnect
 * confirm modal was swapped for Astryx's AlertDialog. This proves the
 * swap didn't just typecheck — clicking "Disconnect" actually opens a
 * dialog with the right copy, and confirming the destructive action
 * calls disconnectAccount with the real account id (never the platform
 * name), matching ConnectionsPage.tsx's handleDisconnect contract. */
describe('ConnectionsPage — disconnect confirmation dialog', () => {
  it('opens on "Disconnect", confirms with the account id, and closes', async () => {
    const disconnectAccount = vi.fn().mockResolvedValue(undefined);
    const refreshConnectedAccounts = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    mockUseApp.mockReturnValue({
      connectedPlatforms: [connectedPlatform],
      accounts: [realAccount],
      beginPlatformConnect: vi.fn(),
      completeOAuthReturn: vi.fn().mockResolvedValue(undefined),
      failOAuthReturn: vi.fn(),
      openSubscriptionModal: vi.fn(),
      refreshConnectedAccounts,
      disconnectAccount,
      showToast,
    });

    const user = userEvent.setup();
    renderConnectionsPage();

    // Closed by default — AlertDialog stays mounted for its native <dialog>
    // element to own open/close, so its content exists in the DOM either
    // way; only the accessibility role is conditional on being open.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await user.click(await screen.findByText('Disconnect'));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Disconnect Instagram?')).toBeInTheDocument();

    await user.click(screen.getByText('Disconnect account'));

    expect(disconnectAccount).toHaveBeenCalledWith(realAccount.id);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
});
