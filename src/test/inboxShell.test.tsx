import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import Sidebar from '../components/Sidebar';
import InboxLauncher from '../components/inbox/InboxButton';
import type { InboxItem } from '../lib/api';

/* Inbox stops being a place you go.
 *
 * It was a permanent nav destination sitting between Automations and
 * Contacts, which framed it as somewhere to visit. But nobody sets out to
 * "go to the inbox" — someone messages you while you are in the middle of
 * building something, and the reply is usually one line. So it moved to the
 * top-right controls and opens over whatever you are already doing.
 *
 * What these pin: it is gone from the nav but NOT gone as a route (Home
 * links there, and so do bookmarks), the badge only appears when someone is
 * actually waiting, and a reply sent from the drawer goes through the same
 * endpoint the full page uses — there is one send path, not two.
 */

const fetchInboxMock = vi.fn();
const sendInboxReplyMock = vi.fn();

/** `name` may be null, which is how the handle-only fallback gets exercised. */
function item(
  id: string, handle: string, text: string, name?: string | null, avatarUrl: string | null = null,
): InboxItem {
  return {
    id, contact_id: `c_${id}`, contact_handle: handle, contact_avatar_url: avatarUrl,
    contact_name: name === undefined ? `${handle[0]!.toUpperCase()}${handle.slice(1)}` : name,
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
    sendInboxReply: (...args: unknown[]) => sendInboxReplyMock(...args),
    setInboxNeedsReply: vi.fn(async () => ({})),
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
  sendInboxReplyMock.mockResolvedValue({ channel: 'dm' });
});

describe('the left navigation', () => {
  it('no longer offers Inbox as a destination', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>);

    for (const label of ['Home', 'Automations', 'Contacts', 'Channels', 'Settings']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText('Inbox')).not.toBeInTheDocument();
  });

  it('but nothing links to a route that stopped existing', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    // The /inbox page is still there for a long triage session — it just
    // isn't nav any more. Anything that linked to it keeps working.
    const links = screen.getAllByRole('link').map(a => a.getAttribute('href'));
    expect(links).not.toContain('/inbox');
  });
});

describe('the Inbox control', () => {
  it('says how many people are waiting', async () => {
    render(<MemoryRouter><InboxLauncher /></MemoryRouter>);
    const button = await screen.findByLabelText('Inbox, 2 waiting');
    expect(button).toHaveTextContent('2');
  });

  it('shows no badge when nobody is waiting', async () => {
    fetchInboxMock.mockResolvedValue({ items: [] });
    render(<MemoryRouter><InboxLauncher /></MemoryRouter>);

    const button = await screen.findByLabelText('Inbox, nothing waiting');
    expect(button).not.toHaveTextContent('0');
  });

  it('opens the conversations beside what you were doing', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><InboxLauncher /></MemoryRouter>);

    await user.click(await screen.findByLabelText('Inbox, 2 waiting'));

    const drawer = await screen.findByLabelText('Inbox');
    expect(drawer).toBeInTheDocument();
    // Their name, the way the full Inbox names them — a creator shouldn't have
    // to recognise people differently depending on which surface they're on.
    expect(screen.getByText('Jordan')).toBeInTheDocument();
    expect(screen.getByText('Can you send me the menu?')).toBeInTheDocument();
    expect(screen.getByText('Maya')).toBeInTheDocument();
  });

  it('falls back to the handle for someone whose name we never learned', async () => {
    fetchInboxMock.mockResolvedValue({ items: [item('1', 'jordan', 'hi', null)] });
    const user = userEvent.setup();
    render(<MemoryRouter><InboxLauncher /></MemoryRouter>);

    await user.click(await screen.findByLabelText('Inbox, 1 waiting'));
    expect(await screen.findByText('@jordan')).toBeInTheDocument();
  });

  it('offers the way into the full conversation with that person', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><InboxLauncher /></MemoryRouter>);
    await user.click(await screen.findByLabelText('Inbox, 2 waiting'));

    await user.click(screen.getByText('Jordan'));
    expect(await screen.findByRole('link', { name: /Open conversation/ }))
      .toHaveAttribute('href', '/inbox?c=c_1');
  });

  it('sends a reply through the same endpoint the full page uses', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><InboxLauncher /></MemoryRouter>);
    await user.click(await screen.findByLabelText('Inbox, 2 waiting'));

    // One conversation open at a time — replying is a focused act.
    await user.click(screen.getByText('Jordan'));
    await user.type(await screen.findByLabelText('Reply to Jordan'), 'On its way!');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(sendInboxReplyMock).toHaveBeenCalledWith('1', { text: 'On its way!' }));
  });

  it('keeps learning about conversations that arrive after it mounted', async () => {
    // A creator sits in the builder for an hour. A badge that only ever
    // counted what was waiting at page load would tell them nothing arrived,
    // which is the one thing this control exists to say.
    fetchInboxMock.mockResolvedValueOnce({ items: [item('1', 'jordan', 'hi')] });
    render(<MemoryRouter><InboxLauncher /></MemoryRouter>);
    await screen.findByLabelText('Inbox, 1 waiting');

    fetchInboxMock.mockResolvedValue({
      items: [item('1', 'jordan', 'hi'), item('2', 'maya', 'me too')],
    });
    window.dispatchEvent(new Event('focus'));

    expect(await screen.findByLabelText('Inbox, 2 waiting')).toBeInTheDocument();
  });

  it('opens above the mobile header, so its close button is reachable', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><InboxLauncher /></MemoryRouter>);
    await user.click(await screen.findByLabelText('Inbox, 2 waiting'));

    // On a phone the drawer is full-width from the top of the viewport, so
    // anything layered over it covers its own close button — and there is no
    // exposed click-away to fall back on. Sidebar's mobile header is z-[55].
    const layer = (await screen.findByLabelText('Inbox')).parentElement!;
    expect(layer.className).toContain('z-[60]');
  });

  it('closes without leaving the page', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><InboxLauncher /></MemoryRouter>);
    await user.click(await screen.findByLabelText('Inbox, 2 waiting'));
    await screen.findByLabelText('Inbox');

    await user.click(screen.getByLabelText('Close inbox'));

    await waitFor(() => expect(screen.queryByLabelText('Inbox')).not.toBeInTheDocument());
  });
});

/* The drawer shows people the way the full Inbox does — which means their
 * face when we have one. It reads inbox_items rather than conversations, and
 * that path missed the avatar twice over: the query never selected it and the
 * component never passed it, so the drawer could not have drawn a picture
 * however well the rest of the avatar work landed. */
describe('the Inbox drawer shows faces', () => {
  it('renders a contact photo when the item carries one', async () => {
    fetchInboxMock.mockResolvedValue({
      items: [item('1', 'jordan', 'hi', 'Jordan', 'https://cdn.example.com/jordan.jpg')],
    });
    const user = userEvent.setup();
    render(<MemoryRouter><InboxLauncher /></MemoryRouter>);

    await user.click(await screen.findByLabelText('Inbox, 1 waiting'));
    const img = await screen.findByRole('presentation', { hidden: true });
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/jordan.jpg');
  });

  it('falls back to their initial when there is no photo', async () => {
    fetchInboxMock.mockResolvedValue({ items: [item('1', 'jordan', 'hi', 'Jordan', null)] });
    const user = userEvent.setup();
    render(<MemoryRouter><InboxLauncher /></MemoryRouter>);

    await user.click(await screen.findByLabelText('Inbox, 1 waiting'));
    expect(await screen.findByText('J')).toBeInTheDocument();
    expect(screen.queryByRole('presentation', { hidden: true })).not.toBeInTheDocument();
  });
});
