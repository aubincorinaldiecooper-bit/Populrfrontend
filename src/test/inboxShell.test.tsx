import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from './render';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import AppSidebar from '../components/app/AppSidebar';
import { CreateAutomationProvider } from '../context/CreateAutomationContext';
import InboxPage from '../pages/InboxPage';
import { useInboxWaiting } from '../components/inbox/conversations';
import type { Conversation } from '../lib/api';
import { appContext } from './appContext.mock';

/* One inbox.
 *
 * There used to be two: the /inbox page, and a drawer that opened over every
 * other page from a top-right launcher — the same conversations, the same
 * people, a second surface. The drawer predates the page being good; when the
 * page became the real messaging product, the drawer became a paler copy of
 * it that could open full-screen on top of the app.
 *
 * The consolidation these tests pin: Inbox is a nav destination like any
 * other, in the one sidebar every page shares, carrying the "someone is
 * waiting" badge the launcher used to hold — and clicking it NAVIGATES.
 * Nothing anywhere opens a second inbox surface over the page you are on.
 */

const fetchConversationsMock = vi.fn();

/** A grouped conversation, the same shape the Inbox page lists. */
function conversation(contactId: string, name: string, waiting: number): Conversation {
  return {
    contactId, handle: name.toLowerCase(), name, avatarUrl: null,
    platform: 'instagram',
    lastMessage: { text: 'hi', direction: 'inbound', channel: 'dm', at: new Date().toISOString() },
    waiting, latestInboxItemId: waiting > 0 ? `i_${contactId}` : null,
  };
}

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchConversations: (...args: unknown[]) => fetchConversationsMock(...args),
  };
});

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({ useApp: () => mockUseApp() }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Aubin', email: 'a@example.com' }, signOut: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseApp.mockReturnValue(appContext({ showToast: vi.fn(), accounts: [] }));
  fetchConversationsMock.mockResolvedValue({
    conversations: [
      conversation('c1', 'Jordan', 1),
      conversation('c2', 'Maya', 1),
      // Someone with nothing waiting is a conversation, not a count.
      conversation('c3', 'Alex', 0),
    ],
  });
});

function renderShell(ui: React.ReactNode, url = '/') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <CreateAutomationProvider>
        {ui}
        <Routes>
          <Route path="/" element={<div>home stub</div>} />
          <Route path="/inbox" element={<div>inbox page stub</div>} />
        </Routes>
      </CreateAutomationProvider>
    </MemoryRouter>,
  );
}

describe('the left navigation', () => {
  it('offers Inbox as a destination, and it navigates — no overlay', async () => {
    const user = userEvent.setup();
    renderShell(<AppSidebar />);

    const inbox = screen.getAllByRole('link', { name: /Inbox/ })[0]!;
    expect(inbox).toHaveAttribute('href', '/inbox');
    await user.click(inbox);

    // A page change, not a second surface over this one.
    expect(await screen.findByText('inbox page stub')).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Inbox' })).not.toBeInTheDocument();
  });

  it('counts people waiting, by the same rule the Inbox page counts them', async () => {
    renderShell(<AppSidebar />);

    // Two conversations waiting (Alex is quiet) → a "2" pill. Same endpoint,
    // same grouping as the page's "N waiting on you" — they cannot disagree.
    await waitFor(() => expect(screen.getAllByText('2').length).toBeGreaterThan(0));
  });

  it('one person with many flagged messages is ONE conversation waiting', async () => {
    // The grouped list already says so: one row, waiting: 3. A badge built on
    // raw inbox rows would have said three people were waiting.
    fetchConversationsMock.mockResolvedValue({
      conversations: [conversation('c1', 'Jordan', 3)],
    });
    renderShell(<AppSidebar />);

    await waitFor(() => expect(screen.getAllByText('1').length).toBeGreaterThan(0));
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('shows no badge when nobody is waiting', async () => {
    fetchConversationsMock.mockResolvedValue({ conversations: [] });
    renderShell(<AppSidebar />);

    await waitFor(() => expect(fetchConversationsMock).toHaveBeenCalled());
    expect(screen.queryByText(/waiting/)).not.toBeInTheDocument();
  });

  it('however many badges render, there is one poll', async () => {
    // The sidebar's badge and any other reader of the count share one
    // cached list — not one request each. (This used to pair the sidebar
    // with the builder's icon rail; the rail is gone — the builder shows
    // the same sidebar as everywhere else — but the property is the same
    // with any second reader.)
    renderShell(<><AppSidebar /><WaitingBadge /></>);

    await screen.findByRole('link', { name: 'Inbox, 2 conversations waiting' });
    await waitFor(() => expect(screen.getByTestId('waiting')).toHaveTextContent('2'));
    expect(fetchConversationsMock).toHaveBeenCalledTimes(1);
  });
});

/** The nav badge, rendered beside the page so the two can be compared. */
function WaitingBadge() {
  const { count } = useInboxWaiting();
  return <span data-testid="waiting">{count}</span>;
}

describe('the badge and the page it links to', () => {
  it('is fed by the page\u2019s own fetch, and never asks for the list twice', async () => {
    // The badge and the page want the same list. They used to fetch it
    // separately and reconcile afterwards — the page telling the badge what
    // it had just learned, through a bridge written by hand. Same key now, so
    // there is nothing left to reconcile: one request, both read its answer.
    render(
      <MemoryRouter initialEntries={['/inbox']}>
        <WaitingBadge />
        <Routes><Route path="/inbox" element={<InboxPage />} /></Routes>
      </MemoryRouter>,
    );

    // The badge's count and the page's rows, off a single trip to the server.
    await waitFor(() => expect(screen.getByTestId('waiting')).toHaveTextContent('2'));
    expect(screen.getByText('Jordan')).toBeInTheDocument();
    expect(fetchConversationsMock).toHaveBeenCalledTimes(1);
  });

  it('a page opened mid-flight joins the request rather than starting a second', async () => {
    // The badge mounts with the app; the page mounts when the creator gets
    // there, which is routinely before the badge's first answer has landed.
    // Two readers, one key, one request already in flight — the page waits on
    // it instead of asking the same question again.
    let answer!: (v: { conversations: Conversation[] }) => void;
    fetchConversationsMock.mockImplementation(() => new Promise(r => { answer = r; }));

    const { rerender } = render(
      <MemoryRouter initialEntries={['/inbox']}>
        <WaitingBadge />
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchConversationsMock).toHaveBeenCalledTimes(1));

    rerender(
      <MemoryRouter initialEntries={['/inbox']}>
        <WaitingBadge />
        <Routes><Route path="/inbox" element={<InboxPage />} /></Routes>
      </MemoryRouter>,
    );
    answer({ conversations: [conversation('c1', 'Jordan', 1), conversation('c2', 'Maya', 1)] });

    await waitFor(() => expect(screen.getByText('Jordan')).toBeInTheDocument());
    expect(screen.getByTestId('waiting')).toHaveTextContent('2');
    expect(fetchConversationsMock).toHaveBeenCalledTimes(1);
  });

  it('a search that finds nobody is a filter, not news that nobody is waiting', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/inbox']}>
        <WaitingBadge />
        <Routes><Route path="/inbox" element={<InboxPage />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('waiting')).toHaveTextContent('2'));

    // The filtered fetch returns nothing at all.
    fetchConversationsMock.mockResolvedValue({ conversations: [] });
    await user.type(screen.getByRole('searchbox'), 'nobody');

    await waitFor(() =>
      expect(fetchConversationsMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'nobody' })),
    );
    // Two people are still waiting; the creator just isn't looking at them.
    expect(screen.getByTestId('waiting')).toHaveTextContent('2');
  });
});
