import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import Sidebar from '../components/Sidebar';
import EditorRail from '../components/EditorRail';
import type { InboxItem } from '../lib/api';

/* One inbox.
 *
 * There used to be two: the /inbox page, and a drawer that opened over every
 * other page from a top-right launcher — the same conversations, the same
 * people, a second surface. The drawer predates the page being good; when the
 * page became the real messaging product, the drawer became a paler copy of
 * it that could open full-screen on top of the app.
 *
 * The consolidation these tests pin: Inbox is a nav destination like any
 * other, in the sidebar and the builder's rail, carrying the "someone is
 * waiting" badge the launcher used to hold — and clicking it NAVIGATES.
 * Nothing anywhere opens a second inbox surface over the page you are on.
 */

const fetchInboxMock = vi.fn();

function item(id: string, handle: string, text: string): InboxItem {
  return {
    id, contact_id: `c_${id}`, contact_handle: handle, contact_avatar_url: null,
    contact_name: `${handle[0]!.toUpperCase()}${handle.slice(1)}`,
    platform: 'instagram', channel: 'dm', message_text: text,
    needs_reply: true, needs_reply_reason: 'no_rule_matched',
    suggested_reply: null, post_caption: null,
    created_at: new Date().toISOString(),
  } as unknown as InboxItem;
}

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchInbox: (...args: unknown[]) => fetchInboxMock(...args),
  };
});

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({ useApp: () => mockUseApp() }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Aubin', email: 'a@example.com' }, signOut: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseApp.mockReturnValue({ showToast: vi.fn() });
  fetchInboxMock.mockResolvedValue({
    items: [
      item('1', 'jordan', 'Can you send me the menu?'),
      item('2', 'maya', 'Thanks!'),
    ],
  });
});

function renderShell(ui: React.ReactNode, url = '/') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      {ui}
      <Routes>
        <Route path="/" element={<div>home stub</div>} />
        <Route path="/inbox" element={<div>inbox page stub</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('the left navigation', () => {
  it('offers Inbox as a destination, and it navigates — no overlay', async () => {
    const user = userEvent.setup();
    renderShell(<Sidebar />);

    const inbox = screen.getAllByRole('link', { name: /Inbox/ })[0]!;
    expect(inbox).toHaveAttribute('href', '/inbox');
    await user.click(inbox);

    // A page change, not a second surface over this one.
    expect(await screen.findByText('inbox page stub')).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Inbox' })).not.toBeInTheDocument();
  });

  it('says how many people are waiting', async () => {
    renderShell(<Sidebar />);

    // Two items waiting → a "2" pill on the nav item.
    await waitFor(() => expect(screen.getAllByText('2').length).toBeGreaterThan(0));
    expect(fetchInboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ needsReply: true }));
  });

  it('shows no badge when nobody is waiting', async () => {
    fetchInboxMock.mockResolvedValue({ items: [] });
    renderShell(<Sidebar />);

    await waitFor(() => expect(fetchInboxMock).toHaveBeenCalled());
    expect(screen.queryByText(/waiting/)).not.toBeInTheDocument();
  });
});

describe("the builder's rail", () => {
  it('carries Inbox with the same waiting count, as a link', async () => {
    renderShell(<EditorRail />);

    const inbox = await screen.findByRole('link', { name: 'Inbox, 2 waiting' });
    expect(inbox).toHaveAttribute('href', '/inbox');
  });

  it('and stays quiet when nobody is', async () => {
    fetchInboxMock.mockResolvedValue({ items: [] });
    renderShell(<EditorRail />);

    await waitFor(() => expect(fetchInboxMock).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: 'Inbox' })).toBeInTheDocument();
  });
});
