import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import HomePage from '../pages/HomePage';
import type { DashboardData } from '../lib/api';

/* The redesigned Home is purpose-driven: one CTA (create an automation),
 * the needs-reply strip outranking the numbers, analytics the dashboard
 * service was built to answer (which posts produce warm leads), and a
 * first-run hero instead of a wall of zeros. All from one workspace-scoped
 * GET /api/dashboard. */

function dashboard(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    globallyPaused: false,
    connectedAccounts: [{
      id: 'acc1', platform: 'instagram', username: 'creator',
      displayName: 'Creator', avatarUrl: null, readiness: 'ready', caveat: null,
    }],
    totals: { contacts: 42, warmLeads: 7, hotLeads: 2, needsReply: 0, activeAutomations: 3 },
    engagement: {
      dmsSent: 0, dmsDelivered: 0, dmsRead: 0, mediaDmsSent: 0,
      contactsDmd: 0, contactsReplied: 0,
      linkSends: 0, linkClicks: 0, uniqueLinkClicks: 0,
    },
    topPostsByWarmLeads: [],
    topPlatformsByWarmLeads: [],
    topFunnelsByClicks: [],
    recentActivity: [],
    ...overrides,
  };
}

const mockFetchDashboard = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchDashboard: () => mockFetchDashboard(),
  };
});

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/inbox" element={<p>INBOX PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HomePage — purpose-driven dashboard', () => {
  it('always offers the one CTA: create an automation', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard());
    renderHome();
    await waitFor(() => expect(screen.getByText('Active automations')).toBeInTheDocument());
    const cta = screen.getAllByRole('link', { name: /Create an automation/ });
    expect(cta.length).toBeGreaterThan(0);
    expect(cta[0]).toHaveAttribute('href', '/automations/new');
  });

  it('surfaces waiting conversations above the numbers, and the strip opens the Inbox', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard({
      totals: { contacts: 42, warmLeads: 7, hotLeads: 2, needsReply: 3, activeAutomations: 3 },
    }));
    const user = userEvent.setup();
    renderHome();

    await waitFor(() => expect(screen.getByText('3 conversations waiting on you')).toBeInTheDocument());
    await user.click(screen.getByText('3 conversations waiting on you'));
    expect(screen.getByText('INBOX PAGE')).toBeInTheDocument();
  });

  it('no waiting conversations: no strip, numbers stand on their own', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard());
    renderHome();
    await waitFor(() => expect(screen.getByText('Active automations')).toBeInTheDocument());
    expect(screen.queryByText(/waiting on you/)).not.toBeInTheDocument();
  });

  it('paused workspace shows the paused banner pointing at Settings', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard({ globallyPaused: true }));
    renderHome();
    await waitFor(() => expect(screen.getByText(/automations are paused/)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Go to Settings/ })).toHaveAttribute('href', '/settings');
  });

  it('running workspace shows no paused banner', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard());
    renderHome();
    await waitFor(() => expect(screen.getByText('Active automations')).toBeInTheDocument());
    expect(screen.queryByText(/automations are paused/)).not.toBeInTheDocument();
  });

  it('first run (no automations, no contacts) leads with getting started, not zeros', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard({
      totals: { contacts: 0, warmLeads: 0, hotLeads: 0, needsReply: 0, activeAutomations: 0 },
      connectedAccounts: [],
    }));
    renderHome();
    await waitFor(() => expect(screen.getByText('Set up your first automation')).toBeInTheDocument());
    // The stat grid and its zeros stay out of the way on first run.
    expect(screen.queryByText('Active automations')).not.toBeInTheDocument();
    // No account connected yet: the hero mentions the channels path too.
    expect(screen.getByRole('link', { name: /do it now/ })).toHaveAttribute('href', '/channels');
  });

  it('ranks the posts bringing in warm leads', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard({
      topPostsByWarmLeads: [
        {
          id: 'p1', platform: 'instagram', caption: 'The guide everyone asked for',
          url: null, media_url: null, account_username: 'creator',
          warm_leads: 12, contacts: 30,
        },
        {
          id: 'p2', platform: 'instagram', caption: null,
          url: null, media_url: null, account_username: null,
          warm_leads: 4, contacts: 9,
        },
      ],
    }));
    renderHome();

    await waitFor(() => expect(screen.getByText(/bringing you leads/)).toBeInTheDocument());
    expect(screen.getByText('The guide everyone asked for')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    // A caption-less post still renders honestly.
    expect(screen.getByText('Untitled post')).toBeInTheDocument();
  });

  it('shows recent automation activity with relative times', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard({
      recentActivity: [{
        id: 'e1', event_type: 'dm_sent', status: 'success',
        detail: 'Sent the guide to @curious_fan',
        created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        contact_handle: 'curious_fan', contact_name: null,
        automation_name: 'Guide automation', source_platform: 'instagram',
      }],
    }));
    renderHome();

    await waitFor(() => expect(screen.getByText('Recent activity')).toBeInTheDocument());
    expect(screen.getByText('Sent the guide to @curious_fan')).toBeInTheDocument();
    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  it('shows how fans respond as rates over visible denominators', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard({
      engagement: {
        dmsSent: 40, dmsDelivered: 30, dmsRead: 20, mediaDmsSent: 6,
        contactsDmd: 10, contactsReplied: 4,
        linkSends: 25, linkClicks: 9, uniqueLinkClicks: 5,
      },
    }));
    renderHome();

    await waitFor(() => expect(screen.getByText('How fans respond')).toBeInTheDocument());
    // 5 unique taps of 25 sends = 20%; 4 of 10 wrote back = 40%; 20 of 40 read = 50%.
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('of 25 links sent')).toBeInTheDocument();
    expect(screen.getByText("of 10 fans DM'd")).toBeInTheDocument();
    expect(screen.getByText('DMs carried media')).toBeInTheDocument();
  });

  it('nothing sent yet: the engagement section stays hidden, not a wall of 0%', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard());
    renderHome();
    await waitFor(() => expect(screen.getByText('Active automations')).toBeInTheDocument());
    expect(screen.queryByText('How fans respond')).not.toBeInTheDocument();
  });

  it('links sent but no DMs yet: rates with an empty denominator show a dash, never 0%', async () => {
    mockFetchDashboard.mockResolvedValue(dashboard({
      engagement: {
        dmsSent: 0, dmsDelivered: 0, dmsRead: 0, mediaDmsSent: 0,
        contactsDmd: 0, contactsReplied: 0,
        linkSends: 8, linkClicks: 2, uniqueLinkClicks: 2,
      },
    }));
    renderHome();

    await waitFor(() => expect(screen.getByText('How fans respond')).toBeInTheDocument());
    expect(screen.getByText('25%')).toBeInTheDocument();
    // "Wrote back" and "DMs read" have no denominator: dash, not 0%.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('a failed load offers Retry, and Retry actually refetches', async () => {
    mockFetchDashboard
      .mockRejectedValueOnce(new Error('Server unreachable'))
      .mockResolvedValueOnce(dashboard());
    const user = userEvent.setup();
    renderHome();

    await waitFor(() => expect(screen.getByText(/Couldn't load your dashboard/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Retry/ }));

    await waitFor(() => expect(screen.getByText('Active automations')).toBeInTheDocument());
    expect(mockFetchDashboard).toHaveBeenCalledTimes(2);
  });
});
