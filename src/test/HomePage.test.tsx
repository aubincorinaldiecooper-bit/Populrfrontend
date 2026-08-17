import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import HomePage from '../pages/HomePage';
import Sidebar from '../components/Sidebar';
import { CreateAutomationProvider } from '../context/CreateAutomationContext';
import type { DashboardData, ConnectedAccount } from '../lib/api';

/* Home, refocused: one primary action (Create an automation), one attention
 * banner, marketer tiles, and per-automation performance from the account
 * each automation actually runs on. What this suite pins, per the brief:
 *
 *   - the attention count appears once, and its banner opens Inbox already
 *     filtered to conversations needing a human;
 *   - Create an automation opens the creation experience directly — with
 *     several connected accounts it first asks "Run this automation from…",
 *     and the sidebar's Create is the SAME action;
 *   - Warm leads is gone from Home;
 *   - metrics a channel can't measure are omitted, never faked as 0%;
 *   - two automations on two different Instagram accounts each show their
 *     own @handle;
 *   - recent activity reads as human sentences, not engine internals.
 */

const IG_AUBIN = {
  id: 'acc-aubin', platform: 'instagram', username: 'aubin', display_name: 'Aubin',
  avatar_url: null, is_connected: true, status: 'connected', connected_at: null,
} as unknown as ConnectedAccount;
const IG_POPULR = {
  id: 'acc-populr', platform: 'instagram', username: 'populr', display_name: 'Populr',
  avatar_url: null, is_connected: true, status: 'connected', connected_at: null,
} as unknown as ConnectedAccount;

const appState = { accounts: [IG_AUBIN] as ConnectedAccount[], showToast: vi.fn() };

vi.mock('../context/AppContext', () => ({
  useApp: () => appState,
}));

vi.mock('../components/inbox/useInboxUnread', () => ({
  useInboxUnread: () => 0,
}));

// The sidebar's account menu needs the auth session; this suite is about
// the Create action, so the menu stands aside.
vi.mock('../components/AccountMenu', () => ({
  default: () => null,
}));

function dashboard(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    globallyPaused: false,
    connectedAccounts: [{
      id: 'acc-aubin', platform: 'instagram', username: 'aubin',
      displayName: 'Aubin', avatarUrl: null, readiness: 'ready', caveat: null,
    }],
    totals: { contacts: 42, warmLeads: 7, hotLeads: 2, needsReply: 0, activeAutomations: 3 },
    engagement: {
      dmsSent: 40, dmsDelivered: 30, dmsRead: 20, mediaDmsSent: 0,
      contactsDmd: 20, contactsReplied: 7,
      linkSends: 0, linkClicks: 0, uniqueLinkClicks: 0,
    },
    performance: { audienceGrowth30d: 128, readRate: { read: 20, sent: 40 } },
    automationPerformance: [],
    recentActivity: [],
    ...overrides,
  };
}

const mockFetchDashboard = vi.fn();
const mockCreateFlow = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchDashboard: () => mockFetchDashboard(),
    createFlow: (input: unknown) => mockCreateFlow(input),
  };
});

function InboxProbe() {
  const location = useLocation();
  return <p>INBOX PAGE {location.search}</p>;
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <CreateAutomationProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/inbox" element={<InboxProbe />} />
          <Route path="/automations/:flowId" element={<p>BUILDER PAGE</p>} />
          <Route path="/automations" element={<p>AUTOMATIONS LIST</p>} />
        </Routes>
      </CreateAutomationProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  appState.accounts = [IG_AUBIN];
  mockCreateFlow.mockResolvedValue({ id: 'flow_9', name: 'New automation' });
});

describe('the north-star action', () => {
  it('Create an automation goes straight into the builder — never the list first', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard());
    const user = userEvent.setup();
    renderHome();
    await waitFor(() => expect(screen.getByText('Live automations')).toBeInTheDocument());

    await user.click(screen.getAllByRole('button', { name: /Create an automation/ })[0]);
    await waitFor(() => expect(screen.getByText('BUILDER PAGE')).toBeInTheDocument());
    // One connected account: it is chosen for the creator, bound at creation.
    expect(mockCreateFlow).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-aubin' }));
    expect(screen.queryByText('AUTOMATIONS LIST')).not.toBeInTheDocument();
  });

  it('several connected accounts: it first asks which account to run from', async () => {
    appState.accounts = [IG_POPULR, IG_AUBIN];
    mockFetchDashboard.mockResolvedValue(dashboard());
    const user = userEvent.setup();
    renderHome();
    await waitFor(() => expect(screen.getByText('Live automations')).toBeInTheDocument());

    await user.click(screen.getAllByRole('button', { name: /Create an automation/ })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Create an automation' });
    expect(within(dialog).getByText('Run this automation from')).toBeInTheDocument();
    expect(within(dialog).getByText('@populr')).toBeInTheDocument();

    await user.click(within(dialog).getByText('@aubin'));
    await waitFor(() => expect(screen.getByText('BUILDER PAGE')).toBeInTheDocument());
    expect(mockCreateFlow).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-aubin' }));
  });

  it("the sidebar's Create is the same action, not a parallel flow", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <CreateAutomationProvider>
          <Routes>
            <Route path="/" element={<Sidebar />} />
            <Route path="/automations/:flowId" element={<p>BUILDER PAGE</p>} />
          </Routes>
        </CreateAutomationProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getAllByRole('button', { name: /Create/ })[0]);
    await waitFor(() => expect(screen.getByText('BUILDER PAGE')).toBeInTheDocument());
    expect(mockCreateFlow).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-aubin' }));
  });
});

describe('attention', () => {
  it('the count appears once, and its banner opens Inbox filtered to needs-you', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard({
      totals: { contacts: 42, warmLeads: 7, hotLeads: 2, needsReply: 40, activeAutomations: 3 },
    }));
    const user = userEvent.setup();
    renderHome();

    await waitFor(() => expect(screen.getByText('40 conversations need you')).toBeInTheDocument());
    expect(screen.getByText('Questions your automations handed over to you.')).toBeInTheDocument();
    // The duplicate metric card is gone: the attention count exists exactly
    // once, and no tile re-states it under another name.
    expect(screen.queryByText('Need your reply')).not.toBeInTheDocument();
    expect(screen.getAllByText(/conversations need you/)).toHaveLength(1);

    await user.click(screen.getByText('40 conversations need you'));
    expect(screen.getByText(/INBOX PAGE/)).toHaveTextContent('?f=needs-you');
  });
});

describe('performance, honestly', () => {
  it('shows marketer tiles and never Warm leads', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard());
    renderHome();
    await waitFor(() => expect(screen.getByText('Live automations')).toBeInTheDocument());
    expect(screen.getByText('Reply rate')).toBeInTheDocument();
    expect(screen.getByText('Audience growth')).toBeInTheDocument();
    expect(screen.getByText('+128')).toBeInTheDocument();
    expect(screen.getByText('Read rate')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument(); // 7 of 20 replied
    expect(screen.queryByText('Warm leads')).not.toBeInTheDocument();
    expect(screen.queryByText('Contacts')).not.toBeInTheDocument();
  });

  it('an unmeasurable read rate is omitted — never rendered as 0%', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard({
      performance: { audienceGrowth30d: 5, readRate: null },
    }));
    renderHome();
    await waitFor(() => expect(screen.getByText('Live automations')).toBeInTheDocument());
    expect(screen.queryByText('Read rate')).not.toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('two automations on different Instagram accounts each wear their own handle', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard({
      automationPerformance: [
        {
          id: 'f1', name: 'Booking inquiries', status: 'live', platform: 'instagram',
          account: { handle: '@aubin', displayName: 'Aubin' },
          audience: 1240, audienceGrowth30d: 83,
          replied: { contacts: 34, messaged: 100 }, read: { read: 71, sent: 100 },
        },
        {
          id: 'f2', name: 'Culture comments', status: 'live', platform: 'instagram',
          account: { handle: '@populr', displayName: 'Populr' },
          audience: 483, audienceGrowth30d: 31,
          replied: { contacts: 41, messaged: 100 }, read: null,
        },
      ],
    }));
    renderHome();
    await waitFor(() => expect(screen.getByText('Automation performance')).toBeInTheDocument());

    const rowA = screen.getByText('Booking inquiries').closest('a')!;
    expect(within(rowA).getByText(/Instagram · @aubin/)).toBeInTheDocument();
    expect(within(rowA).getByText('Live')).toBeInTheDocument();
    expect(within(rowA).getByText('1,240')).toBeInTheDocument();
    expect(within(rowA).getByText(/34% replied/)).toBeInTheDocument();
    expect(within(rowA).getByText(/71% read/)).toBeInTheDocument();
    expect(within(rowA).getByText('+83 this month')).toBeInTheDocument();

    const rowB = screen.getByText('Culture comments').closest('a')!;
    expect(within(rowB).getByText(/Instagram · @populr/)).toBeInTheDocument();
    // Read receipts unavailable for this automation: the metric is absent,
    // not zero.
    expect(within(rowB).getByText(/41% replied/)).toBeInTheDocument();
    expect(within(rowB).queryByText(/read/)).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: /View all automations/ })).toHaveAttribute('href', '/automations');
  });

  it('the tile grid stacks on small screens instead of forcing four columns', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard());
    const { container } = renderHome();
    await waitFor(() => expect(screen.getByText('Live automations')).toBeInTheDocument());
    expect(container.querySelector('.grid.grid-cols-2.lg\\:grid-cols-4')).not.toBeNull();
  });
});

describe('recent, quietly', () => {
  it('renders human sentences with the account only where it helps', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard({
      recentActivity: [
        { kind: 'went_live', automationName: 'Booking inquiries', accountHandle: '@aubin', at: new Date().toISOString() },
        { kind: 'audience_joined', automationName: 'Culture comments', count: 12, at: new Date().toISOString() },
        { kind: 'member_joined', email: 'sam@example.com', at: new Date().toISOString() },
        { kind: 'conversation_started', contactHandle: '@superfan', contactName: null, at: new Date().toISOString() },
        { kind: 'messages_sent', automationName: 'Booking inquiries', count: 84, at: new Date().toISOString() },
      ],
    }));
    renderHome();
    await waitFor(() => expect(screen.getByText('Recent')).toBeInTheDocument());
    expect(screen.getByText('Booking inquiries went live on @aubin')).toBeInTheDocument();
    expect(screen.getByText('12 people entered Culture comments this week')).toBeInTheDocument();
    expect(screen.getByText('sam@example.com joined your workspace')).toBeInTheDocument();
    expect(screen.getByText('@superfan started a conversation')).toBeInTheDocument();
    expect(screen.getByText('Booking inquiries sent 84 messages today')).toBeInTheDocument();
  });
});

describe('normal Home behavior stays intact', () => {
  it('paused workspace shows the banner pointing at Settings', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard({ globallyPaused: true }));
    renderHome();
    await waitFor(() => expect(screen.getByText(/automations are paused/)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Go to Settings/ })).toHaveAttribute('href', '/settings');
  });

  it('first run leads with getting started, not zeros', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard({
      totals: { contacts: 0, warmLeads: 0, hotLeads: 0, needsReply: 0, activeAutomations: 0 },
      connectedAccounts: [],
    }));
    renderHome();
    await waitFor(() => expect(screen.getByText('Set up your first automation')).toBeInTheDocument());
    expect(screen.queryByText('Live automations')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /do it now/ })).toHaveAttribute('href', '/channels');
  });

  it('a failed load offers retry', async () => {
    mockFetchDashboard.mockRejectedValueOnce(new Error('The server is busy.'));
    mockFetchDashboard.mockResolvedValueOnce(dashboard());
    const user = userEvent.setup();
    renderHome();
    await waitFor(() => expect(screen.getByText(/Couldn't load your dashboard/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Retry/ }));
    await waitFor(() => expect(screen.getByText('Live automations')).toBeInTheDocument());
  });
});
