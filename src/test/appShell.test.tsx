import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import AppSidebar from '../components/app/AppSidebar';
import AppHeader from '../components/app/AppHeader';
import PageHeader from '../components/PageHeader';
import { SidebarProvider } from '../components/ui/sidebar';
import { CreateAutomationProvider } from '../context/CreateAutomationContext';
import { resetInboxUnreadForTests } from '../components/inbox/useInboxUnread';
import type { Conversation } from '../lib/api';

/* The shell.
 *
 * One sidebar rendered once and shown two ways (fixed column, phone
 * drawer), one header carrying the global controls, and navigation that
 * reshapes itself to what the signed-in person may actually do. These tests
 * pin the structure PR after PR of page work will stand on: the drawer is a
 * real modal (Base UI owns focus and Escape now — the hand-rolled trap is
 * gone), a canvas invitee's menu has no doors that 403, and the header's
 * Inbox glance deep-links into the one true Inbox rather than growing a
 * second one.
 */

const fetchConversationsMock = vi.fn();

function conversation(contactId: string, name: string, waiting: number): Conversation {
  return {
    contactId, handle: name.toLowerCase(), name, avatarUrl: null,
    platform: 'instagram',
    lastMessage: { text: `hey from ${name}`, direction: 'inbound', channel: 'dm', at: new Date().toISOString() },
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
  resetInboxUnreadForTests();
  mockUseApp.mockReturnValue({ showToast: vi.fn(), accounts: [], workspaceAccess: null });
  fetchConversationsMock.mockResolvedValue({
    conversations: [conversation('c1', 'Jordan', 2), conversation('c2', 'Alex', 0)],
  });
});

function renderShell(ui: React.ReactNode, url = '/') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <CreateAutomationProvider>
        <SidebarProvider>{ui}</SidebarProvider>
        <Routes>
          <Route path="/" element={<div>home stub</div>} />
          <Route path="/inbox" element={<div>inbox page stub</div>} />
          <Route path="/settings" element={<div>settings stub</div>} />
          <Route path="/automations/:flowId" element={<div>builder stub</div>} />
        </Routes>
      </CreateAutomationProvider>
    </MemoryRouter>,
  );
}

describe('the phone drawer', () => {
  it('opens from the header trigger as a real modal, and navigating closes it', async () => {
    const user = userEvent.setup();
    renderShell(
      <>
        <AppHeader />
        <AppSidebar />
      </>,
    );

    expect(screen.queryByRole('dialog', { name: 'Main menu' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const drawer = await screen.findByRole('dialog', { name: 'Main menu' });

    await user.click(within(drawer).getByRole('link', { name: /Contacts/ }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Main menu' })).not.toBeInTheDocument(),
    );
  });

  it('closes on Escape — the modal behavior the hand-rolled drawer had to fake', async () => {
    const user = userEvent.setup();
    renderShell(
      <>
        <AppHeader />
        <AppSidebar />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await screen.findByRole('dialog', { name: 'Main menu' });
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Main menu' })).not.toBeInTheDocument(),
    );
  });
});

describe('what the nav offers depends on who is signed in', () => {
  it('a canvas invitee sees their automation and Settings — no doors that 403', async () => {
    mockUseApp.mockReturnValue({
      showToast: vi.fn(),
      accounts: [],
      workspaceAccess: {
        id: 'w1', name: 'Summer Drop', role: 'canvas',
        permissions: { editAutomations: true, contactOutreach: false },
        canvasAutomation: { id: 'flow_7', name: 'Culture comments' },
      },
    });
    renderShell(<AppSidebar />);

    const links = screen.getAllByRole('link');
    const labels = links.map(l => l.textContent);
    expect(labels.some(t => t?.includes('Culture comments'))).toBe(true);
    expect(labels.some(t => t?.includes('Settings'))).toBe(true);
    expect(screen.queryByRole('link', { name: /Contacts/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Team/ })).not.toBeInTheDocument();
    // Creating is an owner/editor capability; a canvas invitee cannot.
    expect(screen.queryByRole('button', { name: /Create/ })).not.toBeInTheDocument();
  });

  it('an owner sees the full map and the Create CTA', async () => {
    renderShell(<AppSidebar />);
    for (const label of ['Home', 'Automations', 'Inbox', 'Contacts', 'Channels', 'Team', 'Settings']) {
      expect(screen.getAllByRole('link', { name: new RegExp(label) }).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByRole('button', { name: /Create/ }).length).toBeGreaterThan(0);
  });
});

describe("the header's Inbox glance", () => {
  it('lists who is waiting and deep-links each row to the real conversation', async () => {
    const user = userEvent.setup();
    renderShell(<AppHeader />);

    // The badge count arrives from the shared store (2 → 1 conversation
    // waiting: Jordan; Alex is quiet).
    await user.click(screen.getAllByRole('button', { name: /^Inbox/ })[0]);

    const row = await screen.findByRole('link', { name: /Jordan/ });
    expect(row).toHaveAttribute('href', '/inbox?c=c1');
    // Quiet conversations are not "waiting" — the glance shows need, not volume.
    expect(screen.queryByRole('link', { name: /Alex/ })).not.toBeInTheDocument();

    const footer = screen.getAllByRole('link', { name: 'View inbox' })[0];
    expect(footer).toHaveAttribute('href', '/inbox');
  });

  it('says so plainly when nobody is waiting', async () => {
    fetchConversationsMock.mockResolvedValue({ conversations: [conversation('c2', 'Alex', 0)] });
    const user = userEvent.setup();
    renderShell(<AppHeader />);

    await user.click(screen.getAllByRole('button', { name: /^Inbox/ })[0]);
    expect(await screen.findByText('No one is waiting on you right now.')).toBeInTheDocument();
  });
});

describe("the header's bell", () => {
  it('opens and tells the truth it has: nothing is feeding it yet', async () => {
    const user = userEvent.setup();
    renderShell(<AppHeader />);

    await user.click(screen.getAllByRole('button', { name: 'Notifications' })[0]);
    expect(await screen.findByText(/all caught up/)).toBeInTheDocument();
  });
});

describe('PageHeader without Astryx', () => {
  it('renders title, subtitle and actions in the same block it always has', () => {
    render(
      <PageHeader
        title="Automations"
        subtitle="Set a conversation in motion."
        action={<button type="button">New</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Automations' })).toBeInTheDocument();
    expect(screen.getByText('Set a conversation in motion.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
  });
});
