import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './render';
import ShareAutomation from '../components/automation-builder/ShareAutomation';
import { appContext } from './appContext.mock';
import type { Collaborator, TeamInvitation, WorkspaceAccess } from '../lib/api';

/* Sharing one automation.
 *
 * What this replaced collected an email and nothing else: the grant it sent
 * always meant edit, because view-only was not representable anywhere in the
 * stack; it showed nothing about who was already on the automation; and it
 * offered no link, so an email that bounced left no recovery but a second
 * invitation.
 *
 * What these tests pin:
 *   - the choice is real and it travels — picking "Can view" sends canEdit
 *     false, and the default is the edit that every canvas invite used to
 *     mean silently;
 *   - the link comes back and is ON SCREEN, not only on the clipboard: a
 *     browser may refuse the clipboard, and a link nobody can see is not a
 *     fallback;
 *   - a canvas seat can be changed or withdrawn from here, and a workspace
 *     member cannot — their reach is workspace-wide, and quietly narrowing it
 *     from one automation's share sheet would change every automation;
 *   - sharing is the owner's, like every other way of granting access.
 */

const mockInvite = vi.fn();
const mockCollaborators = vi.fn();
const mockUpdateTeammate = vi.fn();
const mockRemoveTeammate = vi.fn();
const mockClipboardWrite = vi.fn(async () => {});

let mockAccess: WorkspaceAccess | null = null;

vi.mock('../context/AppContext', () => ({
  useApp: () => appContext({ workspaceAccess: mockAccess }),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    inviteTeammate: (...args: unknown[]) => mockInvite(...args),
    fetchCollaborators: (...args: unknown[]) => mockCollaborators(...args),
    updateTeammate: (...args: unknown[]) => mockUpdateTeammate(...args),
    removeTeammate: (...args: unknown[]) => mockRemoveTeammate(...args),
  };
});

const OWNER: WorkspaceAccess = {
  id: 'w1', name: 'Summer Drop', role: 'owner',
  permissions: { editAutomations: true, contactOutreach: true },
  canvasAutomation: null,
};

const MEMBER: WorkspaceAccess = {
  id: 'w1', name: 'Summer Drop', role: 'member',
  permissions: { editAutomations: false, contactOutreach: false },
  canvasAutomation: null,
};

function invitation(over: Partial<TeamInvitation> = {}): TeamInvitation & { inviteUrl?: string } {
  return {
    id: 'inv_1',
    email: 'casey@example.com',
    permissions: { editAutomations: false, contactOutreach: false },
    status: 'pending',
    emailDelivery: 'sent',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    automation: { id: '7', name: 'Culture comments' },
    ...over,
  };
}

function collaborator(over: Partial<Collaborator> = {}): Collaborator {
  return {
    person: { name: 'Bo', email: 'bo@example.com', avatarUrl: null },
    role: 'canvas',
    you: false,
    here: false,
    at: null,
    canEdit: true,
    handle: 'seat_1',
    ...over,
  };
}

function shareSheet() {
  return render(<ShareAutomation flowId="7" flowName="Culture comments" />);
}

/**
 * user-event installs its own navigator.clipboard on setup, so a stub written
 * in beforeEach is gone by the time a test clicks anything. Ours goes on
 * after, which is the only ordering where the component's writeText is the
 * one being observed.
 */
function setupUser(clipboard: { writeText: typeof mockClipboardWrite } = { writeText: mockClipboardWrite }) {
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  return user;
}

/** The block of text under a person's name — what their seat can do. */
function seatOf(name: string): HTMLElement {
  return screen.getByText(name).closest('div') as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAccess = OWNER;
  mockCollaborators.mockResolvedValue([]);
  mockInvite.mockResolvedValue(invitation());
  mockUpdateTeammate.mockResolvedValue(undefined);
  mockRemoveTeammate.mockResolvedValue(undefined);
});

describe('who may share', () => {
  it('is the owner’s, and nobody else’s', () => {
    mockAccess = MEMBER;
    const { container } = shareSheet();
    expect(container).toBeEmptyDOMElement();
  });

  it('says exactly what is being handed over', async () => {
    const user = userEvent.setup();
    shareSheet();
    await user.click(screen.getByRole('button', { name: /Share/ }));
    expect(screen.getByText(/nothing else in your workspace/)).toBeInTheDocument();
    // Activation is not part of the grant, and the sheet says so rather than
    // leaving the owner to wonder what a guest can set live.
    expect(screen.getByText(/Turning it on\s+stays with you/)).toBeInTheDocument();
  });
});

describe('the permission choice', () => {
  it('offers two, and only two, things a seat can be', async () => {
    const user = userEvent.setup();
    shareSheet();
    await user.click(screen.getByRole('button', { name: /Share/ }));

    const choices = screen.getAllByRole('radio');
    expect(choices.map(c => c.textContent)).toEqual([
      expect.stringContaining('Can edit'),
      expect.stringContaining('Can view'),
    ]);
  });

  it('sends view-only when view-only is chosen', async () => {
    const user = userEvent.setup();
    shareSheet();
    await user.click(screen.getByRole('button', { name: /Share/ }));
    await user.type(screen.getByLabelText('Their email'), 'casey@example.com');
    await user.click(screen.getByRole('radio', { name: /Can view/ }));
    await user.click(screen.getByRole('button', { name: /Send invite/ }));

    await waitFor(() => expect(mockInvite).toHaveBeenCalledWith(
      'casey@example.com',
      { editAutomations: false, contactOutreach: false },
      '7',
      { canEdit: false, message: undefined },
    ));
  });

  it('defaults to edit — the thing a canvas invite always silently meant', async () => {
    const user = userEvent.setup();
    shareSheet();
    await user.click(screen.getByRole('button', { name: /Share/ }));
    // The default is on screen as the chosen option rather than buried in a
    // parameter the owner would have to know about.
    expect(screen.getByRole('radio', { name: /Can edit/ })).toHaveAttribute('aria-checked', 'true');

    await user.type(screen.getByLabelText('Their email'), 'casey@example.com');
    await user.click(screen.getByRole('button', { name: /Send invite/ }));

    await waitFor(() => expect(mockInvite).toHaveBeenCalledWith(
      'casey@example.com',
      expect.anything(),
      '7',
      expect.objectContaining({ canEdit: true }),
    ));
  });

  it('carries the note, when there is one', async () => {
    const user = userEvent.setup();
    shareSheet();
    await user.click(screen.getByRole('button', { name: /Share/ }));
    await user.type(screen.getByLabelText('Their email'), 'casey@example.com');
    await user.type(screen.getByLabelText(/A note/), 'Look at the second message');
    await user.click(screen.getByRole('button', { name: /Send invite/ }));

    await waitFor(() => expect(mockInvite).toHaveBeenCalledWith(
      'casey@example.com',
      expect.anything(),
      '7',
      expect.objectContaining({ message: 'Look at the second message' }),
    ));
  });

  it('a junk address never reaches the server', async () => {
    const user = userEvent.setup();
    shareSheet();
    await user.click(screen.getByRole('button', { name: /Share/ }));
    await user.type(screen.getByLabelText('Their email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /Send invite/ }));

    expect(await screen.findByText(/doesn't look like an email address/)).toBeInTheDocument();
    expect(mockInvite).not.toHaveBeenCalled();
  });

  it('a failed send says so and keeps the sheet open to try again', async () => {
    const user = userEvent.setup();
    mockInvite.mockRejectedValue(new Error('We couldn’t send that invite.'));
    shareSheet();
    await user.click(screen.getByRole('button', { name: /Share/ }));
    await user.type(screen.getByLabelText('Their email'), 'casey@example.com');
    await user.click(screen.getByRole('button', { name: /Send invite/ }));

    expect(await screen.findByText('We couldn’t send that invite.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send invite/ })).toBeInTheDocument();
  });
});

describe('the link', () => {
  it('is on screen as well as on the clipboard', async () => {
    const user = setupUser();
    mockInvite.mockResolvedValue(invitation({ inviteUrl: 'https://populr.test/invite/abc123' } as Partial<TeamInvitation>));
    shareSheet();
    await user.click(screen.getByRole('button', { name: /Share/ }));
    await user.type(screen.getByLabelText('Their email'), 'casey@example.com');
    await user.click(screen.getByRole('button', { name: /Send invite/ }));

    expect(await screen.findByText(/Invite sent to/)).toHaveTextContent('casey@example.com');
    // Visible, not merely copyable: a browser can refuse the clipboard, and
    // then a link that only ever went there is a link that never existed.
    expect(screen.getByText('https://populr.test/invite/abc123')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Copy link/ }));
    expect(mockClipboardWrite).toHaveBeenCalledWith('https://populr.test/invite/abc123');
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });

  it('a refused clipboard points at the link rather than failing', async () => {
    const user = setupUser({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    mockInvite.mockResolvedValue(invitation({ inviteUrl: 'https://populr.test/invite/abc123' } as Partial<TeamInvitation>));
    shareSheet();
    await user.click(screen.getByRole('button', { name: /Share/ }));
    await user.type(screen.getByLabelText('Their email'), 'casey@example.com');
    await user.click(screen.getByRole('button', { name: /Send invite/ }));
    await user.click(await screen.findByRole('button', { name: /Copy link/ }));

    expect(await screen.findByText(/Copy the link below instead/)).toBeInTheDocument();
    expect(screen.getByText('https://populr.test/invite/abc123')).toBeInTheDocument();
  });

  it('a second invite starts clean rather than showing the last one’s link', async () => {
    const user = userEvent.setup();
    mockInvite.mockResolvedValue(invitation({ inviteUrl: 'https://populr.test/invite/abc123' } as Partial<TeamInvitation>));
    shareSheet();
    await user.click(screen.getByRole('button', { name: /Share/ }));
    await user.type(screen.getByLabelText('Their email'), 'casey@example.com');
    await user.click(screen.getByRole('button', { name: /Send invite/ }));
    await screen.findByText(/Invite sent to/);

    await user.click(screen.getByRole('button', { name: /Invite someone else/ }));
    expect(screen.queryByText('https://populr.test/invite/abc123')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Their email')).toHaveValue('');
  });
});

describe('who’s on it', () => {
  it('names everyone and what their seat can do', async () => {
    const user = userEvent.setup();
    mockCollaborators.mockResolvedValue([
      collaborator({ person: { name: 'Bo', email: 'bo@example.com', avatarUrl: null }, canEdit: true }),
      collaborator({ person: { name: 'Cass', email: 'cass@example.com', avatarUrl: null }, canEdit: false, handle: 'seat_2' }),
    ]);
    shareSheet();
    await user.click(screen.getByRole('button', { name: /Share/ }));

    expect(await screen.findByText('Bo')).toBeInTheDocument();
    // Each row states its own seat — the invite form above uses the same two
    // words, so the assertion has to be about the person, not the page.
    expect(seatOf('Bo')).toHaveTextContent('Can edit');
    expect(seatOf('Cass')).toHaveTextContent('Can view');
  });

  it('changes a canvas seat in place, without withdrawing it first', async () => {
    const user = userEvent.setup();
    mockCollaborators.mockResolvedValue([collaborator({ canEdit: true, handle: 'seat_1' })]);
    shareSheet();
    await user.click(screen.getByRole('button', { name: /Share/ }));

    await user.click(await screen.findByRole('button', { name: 'Make view-only' }));
    await waitFor(() => expect(mockUpdateTeammate).toHaveBeenCalledWith('seat_1', { canEdit: false }));
    // Not by removing and re-inviting, which would revoke their link.
    expect(mockRemoveTeammate).not.toHaveBeenCalled();
  });

  it('withdraws a canvas seat by name', async () => {
    const user = userEvent.setup();
    mockCollaborators.mockResolvedValue([collaborator({ handle: 'seat_1' })]);
    shareSheet();
    await user.click(screen.getByRole('button', { name: /Share/ }));

    await user.click(await screen.findByRole('button', { name: 'Remove Bo from this automation' }));
    await waitFor(() => expect(mockRemoveTeammate).toHaveBeenCalledWith('seat_1'));
  });

  it('a workspace member is listed but not changed from here', async () => {
    const user = userEvent.setup();
    // No handle: the backend withholds one for a workspace-wide grant, and
    // the absence is the whole signal. Narrowing that grant from one
    // automation's sheet would silently narrow it on every automation.
    mockCollaborators.mockResolvedValue([
      collaborator({ person: { name: 'Alex', email: 'alex@example.com', avatarUrl: null }, role: 'member', handle: null }),
    ]);
    shareSheet();
    await user.click(screen.getByRole('button', { name: /Share/ }));

    expect(await screen.findByText('Alex')).toBeInTheDocument();
    expect(screen.getByText(/from their workspace access/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Make view-only/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove Alex/ })).not.toBeInTheDocument();
  });

  it('the owner is listed as the owner, with nothing to revoke', async () => {
    const user = userEvent.setup();
    mockCollaborators.mockResolvedValue([
      collaborator({ person: { name: 'Sam', email: 'sam@example.com', avatarUrl: null }, role: 'owner', you: true, handle: null }),
    ]);
    shareSheet();
    await user.click(screen.getByRole('button', { name: /Share/ }));

    expect(await screen.findByText('Owner')).toBeInTheDocument();
    expect(screen.getByText(/· you/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove Sam/ })).not.toBeInTheDocument();
  });
});
