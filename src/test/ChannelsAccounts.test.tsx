import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

const apiMocks = vi.hoisted(() => ({
  getPlatformConnectUrl: vi.fn(async () => 'https://connect.example/fresh-link'),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchCapabilities: async () => [],
    getPlatformConnectUrl: apiMocks.getPlatformConnectUrl,
  };
});

const mockCompleteOAuthReturn = vi.fn();
const mockFailOAuthReturn = vi.fn();
const mockRefreshConnectedAccounts = vi.fn();
const mockBeginPlatformConnect = vi.fn();
const mockDisconnectAccount = vi.fn();
const mockClipboardWrite = vi.fn(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  mockCompleteOAuthReturn.mockResolvedValue(undefined);
  mockRefreshConnectedAccounts.mockResolvedValue(undefined);
  apiMocks.getPlatformConnectUrl.mockResolvedValue('https://connect.example/fresh-link');
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockClipboardWrite },
    configurable: true,
  });
  mockUseApp.mockReturnValue({
    connectedPlatforms: [
      { id: 'instagram', status: 'connected' },
      { id: 'twitter', status: 'connected' },
    ],
    accounts,
    beginPlatformConnect: mockBeginPlatformConnect,
    refreshConnectedAccounts: mockRefreshConnectedAccounts,
    completeOAuthReturn: mockCompleteOAuthReturn,
    failOAuthReturn: mockFailOAuthReturn,
    disconnectAccount: mockDisconnectAccount,
    showToast: vi.fn(),
    openSubscriptionModal: vi.fn(),
  });
});

function renderPage() {
  return render(<MemoryRouter><ChannelsPage /></MemoryRouter>);
}

describe('ChannelsPage — independent per-account lifecycle', () => {
  /* Regression for the multi-account incident: connecting account B made
   * account A appear to need reconnection. Each account row must carry its
   * OWN backend-reported status and action, and no connect action may ever
   * reach the disconnect endpoint. */

  it('a reconnect-required A and a connected B render independent statuses and actions', () => {
    mockUseApp.mockReturnValue({
      ...mockUseApp(),
      accounts: [
        account({ id: 'ig_a', username: 'thelifeofaubin', status: 'reconnect_required', is_connected: true }),
        account({ id: 'ig_b', username: 'secondaccount' }),
      ],
    });
    renderPage();
    // A: its own reauth state and Reconnect action.
    expect(screen.getByText('@thelifeofaubin')).toBeInTheDocument();
    expect(screen.getByText('Reconnect needed')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Reconnect/ })).toHaveLength(1);
    // B: still plainly connected with its own Disconnect — untouched by A.
    expect(screen.getByText('@secondaccount')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Disconnect/ })).toHaveLength(1);
  });

  it('no connect action ever calls the disconnect endpoint', async () => {
    renderPage();
    // Connect another → modal → Continue here.
    fireEvent.click(screen.getAllByRole('button', { name: 'Connect another' })[0]);
    fireEvent.click(screen.getByRole('button', { name: /Continue here/ }));
    // Connect another → copy the private-window link.
    fireEvent.click(screen.getAllByRole('button', { name: 'Connect another' })[0]);
    await waitFor(() => expect(apiMocks.getPlatformConnectUrl).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Copy connection link/ }));
    await waitFor(() => expect(mockClipboardWrite).toHaveBeenCalled());
    // First-time connect on a platform with no accounts (Facebook card).
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(mockBeginPlatformConnect).toHaveBeenCalled();
    expect(mockDisconnectAccount).not.toHaveBeenCalled();
  });
});

describe('ChannelsPage — beta channel surface', () => {
  /* The beta offers exactly Instagram, Facebook, and X. TikTok, LinkedIn,
   * and Reddit are hidden — not deleted — and the internal id `twitter`
   * must surface to users only as "X". */

  it('offers exactly Instagram, Facebook, and X', () => {
    renderPage();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('Facebook')).toBeInTheDocument();
    expect(screen.getByText('X')).toBeInTheDocument();
    expect(screen.queryByText('TikTok')).not.toBeInTheDocument();
    expect(screen.queryByText('LinkedIn')).not.toBeInTheDocument();
    expect(screen.queryByText('Reddit')).not.toBeInTheDocument();
  });

  it('never shows the word "Twitter" — the twitter id renders as X', () => {
    renderPage();
    expect(screen.queryByText(/Twitter/)).not.toBeInTheDocument();
    // The internal-id account still renders, under the X card.
    expect(screen.getByText('@birdacct')).toBeInTheDocument();
  });

  it('two X accounts render as separate rows with their own Disconnect', () => {
    mockUseApp.mockReturnValue({
      ...mockUseApp(),
      accounts: [
        account({ id: 'x_1', platform: 'twitter', username: 'more.feed' }),
        account({ id: 'x_2', platform: 'twitter', username: 'justforlaughs' }),
      ],
    });
    renderPage();
    expect(screen.getByText('@more.feed')).toBeInTheDocument();
    expect(screen.getByText('@justforlaughs')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Disconnect/ })).toHaveLength(2);
  });

  it('an existing account on a hidden platform stays manageable but gets no new-connect actions', () => {
    mockUseApp.mockReturnValue({
      ...mockUseApp(),
      accounts: [account({ id: 'tt_1', platform: 'tiktok', username: 'oldtok' })],
    });
    renderPage();
    // The account is not stranded: its row renders with Disconnect...
    expect(screen.getByText('TikTok')).toBeInTheDocument();
    expect(screen.getByText('@oldtok')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Disconnect/ })).toBeInTheDocument();
    // ...but the beta offers no new TikTok connections.
    expect(screen.queryByRole('button', { name: 'Connect another' })).not.toBeInTheDocument();
  });
});

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
    // The passive refresh must stay out of the verifier's way: resolving
    // last with the pre-sync list would overwrite the verified account.
    expect(mockRefreshConnectedAccounts).not.toHaveBeenCalled();
  });

  it('the one-shot marker survives until verification settles', async () => {
    let settle!: () => void;
    mockCompleteOAuthReturn.mockReturnValue(new Promise<void>(r => { settle = r; }));
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    render(
      <MemoryRouter initialEntries={['/channels?connected=instagram']}>
        <ChannelsPage />
      </MemoryRouter>,
    );

    // Mid-poll the URL is untouched — a reload here re-enters verification
    // instead of downgrading to the single passive refresh.
    expect(replaceSpy).not.toHaveBeenCalled();
    settle();
    await vi.waitFor(() => expect(replaceSpy).toHaveBeenCalled());
    replaceSpy.mockRestore();
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

  it('account_result=new hands the specific account id to the verifier', () => {
    render(
      <MemoryRouter initialEntries={['/channels?connected=instagram&sync=success&account_result=new&account=ig_9']}>
        <ChannelsPage />
      </MemoryRouter>,
    );
    expect(mockCompleteOAuthReturn).toHaveBeenCalledWith('instagram', { accountId: 'ig_9', restored: false });
    expect(mockRefreshConnectedAccounts).not.toHaveBeenCalled();
  });

  it('account_result=restored is verified as the specific account, flagged restored', () => {
    render(
      <MemoryRouter initialEntries={['/channels?connected=instagram&sync=success&account_result=restored&account=ig_2']}>
        <ChannelsPage />
      </MemoryRouter>,
    );
    expect(mockCompleteOAuthReturn).toHaveBeenCalledWith('instagram', { accountId: 'ig_2', restored: true });
  });

  it('account_result=existing shows the already-connected explainer, never a success verification', async () => {
    render(
      <MemoryRouter initialEntries={['/channels?connected=instagram&sync=success&account_result=existing']}>
        <ChannelsPage />
      </MemoryRouter>,
    );
    // The provider reused the current login: no verifier, no success state —
    // the duplicate modal with the private-window path instead. It opens
    // once the passive refresh settles, over current rows.
    expect(mockCompleteOAuthReturn).not.toHaveBeenCalled();
    expect(await screen.findByText(/This Instagram account is already connected/)).toBeInTheDocument();
    expect(screen.getByText(/Instagram reused your current login/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy a fresh connection link/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
    // With no verifier running, the passive refresh must still re-read state.
    expect(mockRefreshConnectedAccounts).toHaveBeenCalled();
  });
});

describe('ChannelsPage — Connect another modal', () => {
  it('"Connect another" opens the confirmation modal instead of redirecting straight away', () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Connect another' })[0]);
    expect(mockBeginPlatformConnect).not.toHaveBeenCalled();
    expect(screen.getByText(/You already have an Instagram account connected/)).toBeInTheDocument();
    expect(screen.getByText(/authorize the additional account you want to add/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue here/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy connection link/ })).toBeInTheDocument();
  });

  it('Instagram gets the private-window guidance; other platforms do not', () => {
    const { unmount } = renderPage();
    // rows order: instagram (offered) first, twitter (extra) second — the
    // two platforms with accounts and therefore "Connect another" buttons.
    fireEvent.click(screen.getAllByRole('button', { name: 'Connect another' })[0]);
    expect(screen.getByText(/private window/)).toBeInTheDocument();
    unmount();

    renderPage();
    // Second "Connect another" is the X card (facebook has no accounts, so
    // it offers plain Connect instead).
    fireEvent.click(screen.getAllByRole('button', { name: 'Connect another' })[1]);
    expect(screen.getByText(/You already have an X account connected/)).toBeInTheDocument();
    expect(screen.queryByText(/private window/)).not.toBeInTheDocument();
    // Scoped to the dialog — the page behind it legitimately says "Instagram".
    expect(within(screen.getByRole('dialog')).queryByText(/Instagram/)).not.toBeInTheDocument();
  });

  it('"Continue here" starts the normal same-tab connect and closes the modal', () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Connect another' })[0]);
    fireEvent.click(screen.getByRole('button', { name: /Continue here/ }));
    expect(mockBeginPlatformConnect).toHaveBeenCalledWith('instagram');
    // The platform card owns the connecting/error/subscription states from
    // here — a still-open modal would sit stuck if startup fails, since
    // beginPlatformConnect reports failures on the card and never throws.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('the private-window link is minted fresh for the workspace and returns to /connect/complete', async () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Connect another' })[0]);
    await waitFor(() => expect(apiMocks.getPlatformConnectUrl).toHaveBeenCalledWith(
      'instagram',
      expect.stringContaining('/connect/complete'),
    ));
  });

  it('copying the link enters the waiting state and copies the freshly minted URL', async () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Connect another' })[0]);
    await waitFor(() => expect(apiMocks.getPlatformConnectUrl).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Copy connection link/ }));
    await waitFor(() => expect(mockClipboardWrite).toHaveBeenCalledWith('https://connect.example/fresh-link'));
    await waitFor(() => expect(screen.getByText(/Watching for the new account/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Check now/ })).toBeInTheDocument();
    // Links are single-use server-side: a replacement is minted right after
    // the copy so the next copy is also fresh. (At least two mints — the
    // click can race the initial prefetch's state commit and mint once more.)
    await waitFor(() => expect(apiMocks.getPlatformConnectUrl.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});
