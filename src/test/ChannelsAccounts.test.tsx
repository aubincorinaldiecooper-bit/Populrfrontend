import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ChannelsPage from '../pages/ChannelsPage';
import type { ConnectedAccount } from '../lib/api';

/* Channels must list real accounts, not one-per-platform.
 *
 * The restored page collapsed each platform to a single account
 * (`accounts.find(a => a.platform === ...)`): a second Instagram account was
 * invisible and unmanageable, and Disconnect — keyed by platform — could hit
 * whichever account came back first. It also framed the page around the
 * pre-pivot Opportunities inbox ("review for meaningful engagement",
 * "Go to Opportunities"), which the automations-centric product had already
 * moved away from. */

function account(overrides: Partial<ConnectedAccount>): ConnectedAccount {
  return {
    id: 'acc', platform: 'instagram', username: 'someone', display_name: null,
    avatar_url: null, is_connected: true, status: 'connected', connected_at: null,
    ...overrides,
  };
}

const accounts: ConnectedAccount[] = [
  account({ id: 'ig_1', username: 'main_ig' }),
  account({ id: 'ig_2', username: 'second_ig' }),
  account({ id: 'tw_1', platform: 'twitter', username: 'birdacct' }),
];

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchCapabilities: async () => [],
  };
});

const mockCompleteOAuthReturn = vi.fn();
const mockFailOAuthReturn = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockUseApp.mockReturnValue({
    connectedPlatforms: [
      { id: 'instagram', status: 'connected' },
      { id: 'twitter', status: 'connected' },
    ],
    accounts,
    beginPlatformConnect: vi.fn(),
    refreshConnectedAccounts: vi.fn(),
    completeOAuthReturn: mockCompleteOAuthReturn,
    failOAuthReturn: mockFailOAuthReturn,
    disconnectAccount: vi.fn(),
    showToast: vi.fn(),
    openSubscriptionModal: vi.fn(),
  });
});

function renderPage() {
  return render(<MemoryRouter><ChannelsPage /></MemoryRouter>);
}

describe('ChannelsPage — real accounts, automations framing', () => {
  it('renders every account, including a second one on the same platform', () => {
    renderPage();
    expect(screen.getByText('@main_ig')).toBeInTheDocument();
    expect(screen.getByText('@second_ig')).toBeInTheDocument();
    expect(screen.getByText('@birdacct')).toBeInTheDocument();
  });

  it('counts accounts, not platforms', () => {
    renderPage();
    expect(screen.getByText('3 accounts connected')).toBeInTheDocument();
  });

  it('offers a per-account Disconnect for each connected account', () => {
    renderPage();
    // Three connected accounts → three Disconnect buttons.
    expect(screen.getAllByRole('button', { name: /Disconnect/ })).toHaveLength(3);
  });

  it('frames the page around automations, not the retired Opportunities flow', () => {
    renderPage();
    expect(screen.getByText(/accounts your automations run on/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create an automation/ })).toBeInTheDocument();
    expect(screen.queryByText(/meaningful engagement/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Go to Opportunities/i)).not.toBeInTheDocument();
  });

  it('a platform with accounts offers "Connect another" rather than nothing', () => {
    renderPage();
    expect(screen.getAllByRole('button', { name: 'Connect another' }).length).toBeGreaterThanOrEqual(2);
  });
});

describe('ChannelsPage — OAuth return trip', () => {
  /* Every OAuth callback lands here (directly, or via the /connect
   * redirect). A single passive refresh can race Zernio's eventual
   * consistency and strand the new account as "not connected" with the
   * one-shot marker already stripped — the ?connected= marker must run the
   * full verification (explicit sync + bounded polling), exactly as the
   * retired onboarding path did. */

  it('?connected=<platform> runs the polling verification, not just a refresh', () => {
    render(
      <MemoryRouter initialEntries={['/channels?connected=instagram']}>
        <ChannelsPage />
      </MemoryRouter>,
    );
    expect(mockCompleteOAuthReturn).toHaveBeenCalledWith('instagram');
  });

  it('a plain visit never triggers the OAuth verification', () => {
    renderPage();
    expect(mockCompleteOAuthReturn).not.toHaveBeenCalled();
  });

  it('?connect_error reflects the failure onto the platform card, not just a toast', () => {
    render(
      <MemoryRouter initialEntries={['/channels?connect_error=account_sync_failed&platform=instagram']}>
        <ChannelsPage />
      </MemoryRouter>,
    );
    expect(mockFailOAuthReturn).toHaveBeenCalledWith('instagram');
    expect(mockCompleteOAuthReturn).not.toHaveBeenCalled();
  });
});
