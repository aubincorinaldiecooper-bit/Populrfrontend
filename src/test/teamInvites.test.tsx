import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import TeamPage from '../pages/TeamPage';
import InviteAcceptPage from '../pages/InviteAcceptPage';
import { ApiError, type InvitePreview, type TeamInvitation, type TeamMember } from '../lib/api';
import { appContext } from './appContext.mock';
import type { WorkspaceAccess } from '../lib/api';

/* Inviting a teammate, and being one.
 *
 * Two surfaces, one flow. On the Team page (its own destination in the nav)
 * an owner invites by email and chooses what the person can do beyond
 * viewing; the invite email carries a link to /invite/<token>, which is
 * where the recipient lands.
 *
 * What these tests pin:
 *   - View is stated as always-included, never offered as a toggle a creator
 *     could switch off — it is the floor, not a setting;
 *   - a failed send keeps the typed address on screen, because the fix is to
 *     try again, not to retype;
 *   - an invitation Populr couldn't email is shown as such rather than
 *     silently sitting "pending" while nobody arrives;
 *   - the team list names people by the address they were invited at — never
 *     an account id;
 *   - the acceptance page redeems the token EXACTLY once, and gives expired,
 *     withdrawn, already-used and owner-clicked-their-own-link their own
 *     sentences rather than one generic failure.
 */

const mockFetchTeam = vi.fn();
const mockInvite = vi.fn();
const mockRevoke = vi.fn();
const mockAccept = vi.fn();
const mockPreview = vi.fn();

// The workspace access the chrome reads (owner by default; tests flip it to
// walk in a member's or canvas invitee's shoes).
let mockAccess: WorkspaceAccess | null = null;

const mockRefreshAccess = vi.fn();
const mockSwitchWorkspace = vi.fn().mockResolvedValue(undefined);

// The acceptance page names the account it is binding the invite to, and
// offers a way out if it is the wrong one — so it reads the session.
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Sam', email: 'sam@example.com' },
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => appContext({
    showToast: vi.fn(),
    workspaceAccess: mockAccess,
    refreshWorkspaceAccess: mockRefreshAccess,
    switchToWorkspace: mockSwitchWorkspace,
  }),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchTeam: () => mockFetchTeam(),
    inviteTeammate: (...args: unknown[]) => mockInvite(...args),
    revokeInvitation: (id: string) => mockRevoke(id),
    acceptInvitation: (token: string) => mockAccept(token),
    fetchInvitePreview: (token: string) => mockPreview(token),
  };
});

function preview(over: Partial<InvitePreview> = {}): InvitePreview {
  return {
    status: 'pending',
    invitedBy: { name: 'Robin', email: 'robin@example.com', avatarUrl: null },
    workspaceName: 'Summer Drop',
    automation: null,
    canEdit: null,
    permissions: { editAutomations: false, contactOutreach: false },
    note: null,
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    invitedEmail: 'sam@example.com',
    yours: false,
    ...over,
  };
}

function invitation(over: Partial<TeamInvitation> = {}): TeamInvitation {
  return {
    id: 'inv_1',
    email: 'sam@example.com',
    permissions: { editAutomations: false, contactOutreach: false },
    status: 'pending',
    emailDelivery: 'sent',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    automation: null,
    ...over,
  };
}

function member(over: Partial<TeamMember> = {}): TeamMember {
  return {
    email: 'jo@example.com',
    permissions: { editAutomations: true, contactOutreach: false },
    joinedAt: new Date().toISOString(),
    automation: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAccess = null;
  mockFetchTeam.mockResolvedValue({ invitations: [], members: [] });
  mockPreview.mockResolvedValue(preview());
});

describe('the Team page', () => {
  it('starts empty and honest, with one way in', async () => {
    render(<TeamPage />);
    await waitFor(() => expect(screen.getByText(/You're the only one here/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Invite teammate/ })).toBeInTheDocument();
  });

  it('View is always included — it is not a toggle', async () => {
    const user = userEvent.setup();
    render(<TeamPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Invite teammate/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Invite teammate/ }));

    expect(screen.getByText('View workspace')).toBeInTheDocument();
    expect(screen.getByText(/Always included/)).toBeInTheDocument();
    // Exactly two things are grantable; View is not among them.
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(2);
    expect(switches.map(s => s.textContent)).toEqual([
      expect.stringContaining('Edit automations'),
      expect.stringContaining('Contact outreach'),
    ]);
  });

  it('sends an invite with exactly the permissions chosen', async () => {
    const user = userEvent.setup();
    mockInvite.mockResolvedValue(invitation({
      email: 'sam@example.com',
      permissions: { editAutomations: true, contactOutreach: false },
    }));
    render(<TeamPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Invite teammate/ })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Invite teammate/ }));
    await user.type(screen.getByLabelText('Their email'), 'sam@example.com');
    await user.click(screen.getByRole('switch', { name: /Edit automations/ }));
    await user.click(screen.getByRole('button', { name: /Send invite/ }));

    await waitFor(() => expect(mockInvite).toHaveBeenCalledWith('sam@example.com', {
      editAutomations: true,
      contactOutreach: false,
    }));
    expect(await screen.findByText(/Invite sent to/)).toHaveTextContent('sam@example.com');
    // And it joins the pending list without a refetch.
    expect(screen.getByText('Invited, not joined yet')).toBeInTheDocument();
  });

  it('an invite that was saved but not emailed is never announced as sent', async () => {
    const user = userEvent.setup();
    // The API created the invitation but the email never left.
    mockInvite.mockResolvedValue(invitation({
      email: 'sam@example.com',
      emailDelivery: 'failed',
    }));
    render(<TeamPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Invite teammate/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Invite teammate/ }));
    await user.type(screen.getByLabelText('Their email'), 'sam@example.com');
    await user.click(screen.getByRole('button', { name: /Send invite/ }));

    // The truthful banner: saved, not delivered — and no green "Invite sent".
    expect(await screen.findByText(/email couldn't be sent/)).toBeInTheDocument();
    expect(screen.queryByText(/Invite sent to/)).not.toBeInTheDocument();
    // The pending row carries its delivery marker, consistent with the banner.
    expect(screen.getByText(/Couldn't be emailed — try inviting again/)).toBeInTheDocument();
  });

  it('a junk address never reaches the server', async () => {
    const user = userEvent.setup();
    render(<TeamPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Invite teammate/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Invite teammate/ }));
    await user.type(screen.getByLabelText('Their email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /Send invite/ }));

    expect(await screen.findByText(/doesn't look like an email address/)).toBeInTheDocument();
    expect(mockInvite).not.toHaveBeenCalled();
  });

  it('a failed send keeps the address on screen to retry', async () => {
    const user = userEvent.setup();
    mockInvite.mockRejectedValue(new Error("The invitation couldn't be emailed just now."));
    render(<TeamPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Invite teammate/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Invite teammate/ }));
    await user.type(screen.getByLabelText('Their email'), 'sam@example.com');
    await user.click(screen.getByRole('button', { name: /Send invite/ }));

    expect(await screen.findByText(/couldn't be emailed just now/)).toBeInTheDocument();
    expect(screen.getByLabelText('Their email')).toHaveValue('sam@example.com');
  });

  it('shows who is in the workspace by name, never by account id', async () => {
    mockFetchTeam.mockResolvedValue({
      invitations: [],
      members: [member({ email: 'jo@example.com', permissions: { editAutomations: true, contactOutreach: true } })],
    });
    render(<TeamPage />);
    await waitFor(() => expect(screen.getByText('jo@example.com')).toBeInTheDocument());
    expect(screen.getByText('View · Edit automations · Contact outreach')).toBeInTheDocument();
  });

  it('an invitation Populr could not email says so', async () => {
    mockFetchTeam.mockResolvedValue({
      invitations: [invitation({ email: 'unlucky@example.com', emailDelivery: 'failed' })],
      members: [],
    });
    render(<TeamPage />);
    await waitFor(() => expect(screen.getByText('unlucky@example.com')).toBeInTheDocument());
    expect(screen.getByText(/Couldn't be emailed/)).toBeInTheDocument();
  });

  it('withdraws a pending invite and stops listing it as waiting', async () => {
    const user = userEvent.setup();
    mockFetchTeam.mockResolvedValue({ invitations: [invitation({ id: 'inv_7' })], members: [] });
    mockRevoke.mockResolvedValue(undefined);
    render(<TeamPage />);
    await waitFor(() => expect(screen.getByText('sam@example.com')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Withdraw the invite to sam@example.com/ }));
    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith('inv_7'));
    await waitFor(() => expect(screen.queryByText('Invited, not joined yet')).not.toBeInTheDocument());
    expect(screen.getByText(/1 earlier invite has expired or been withdrawn/)).toBeInTheDocument();
  });

  it('a failed load offers retry rather than an empty team', async () => {
    const user = userEvent.setup();
    mockFetchTeam.mockRejectedValueOnce(new Error('The server is busy.'));
    mockFetchTeam.mockResolvedValueOnce({ invitations: [], members: [member()] });
    render(<TeamPage />);
    await waitFor(() => expect(screen.getByText('The server is busy.')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Retry/ }));
    await waitFor(() => expect(screen.getByText('jo@example.com')).toBeInTheDocument());
  });
});

function renderAccept(token = 'a'.repeat(64)) {
  return render(
    <MemoryRouter initialEntries={[`/invite/${token}`]}>
      <Routes>
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route path="/" element={<p>POPULR HOME</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Read the invite, then take the offer. */
async function acceptIt(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Accept and/ }));
}

describe('/invite/:token — what is being offered', () => {
  it('reads the invitation without spending it', async () => {
    renderAccept();
    expect(await screen.findByRole('button', { name: /Accept and join/ })).toBeInTheDocument();
    // Landing on the link is not a decision. Accepting binds permanently to
    // whichever account is signed in, and this page used to make that choice
    // on the recipient's behalf before they had read a word.
    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockPreview).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('names who is asking, into what, and what they’ll be able to do', async () => {
    mockPreview.mockResolvedValue(preview({
      automation: { id: '7', name: 'Culture comments' },
      canEdit: false,
      note: 'Have a look at the second message',
    }));
    renderAccept();

    expect(await screen.findByText(/Robin invited you/)).toHaveTextContent('Culture comments');
    expect(screen.getByText('You can look, not change')).toBeInTheDocument();
    expect(screen.getByText(/Editing and turning it on stay with them/)).toBeInTheDocument();
    // The note the sender wrote, in their words.
    expect(screen.getByText(/Have a look at the second message/)).toBeInTheDocument();
  });

  it('does not promise commenting, which has not shipped', async () => {
    mockPreview.mockResolvedValue(preview({
      automation: { id: '7', name: 'Culture comments' },
      canEdit: false,
    }));
    renderAccept();
    await screen.findByText('You can look, not change');
    // The offer describes what the grant does TODAY. Naming a surface that
    // doesn't exist yet is the same class of lie as promising editing to
    // somebody who was sent a look.
    //
    // Matched against the promise, not the word: the automation in this
    // fixture is called "Culture comments", and a bare /comment/i passes or
    // fails on what somebody named their automation.
    expect(screen.queryByText(/can comment on it/)).not.toBeInTheDocument();
    expect(screen.getByText(/see how this automation works, start to finish/)).toBeInTheDocument();
  });

  it('an edit invite says so, and it is the default a canvas invite always meant', async () => {
    mockPreview.mockResolvedValue(preview({
      automation: { id: '7', name: 'Culture comments' },
      canEdit: true,
    }));
    renderAccept();
    expect(await screen.findByText('You can build and change it')).toBeInTheDocument();
  });

  it('says when the link was sent to a different address than the one signed in', async () => {
    // The session is sam@example.com (see the AuthContext mock).
    mockPreview.mockResolvedValue(preview({ invitedEmail: 'casey@example.com' }));
    renderAccept();
    expect(await screen.findByText(/Accepting joins this account/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Use a different account/ })).toBeInTheDocument();
  });

  it('a matching address is stated plainly, without a warning', async () => {
    renderAccept();
    await screen.findByRole('button', { name: /Accept and join/ });
    expect(screen.getByText(/Signed in as/)).toBeInTheDocument();
    expect(screen.queryByText(/Accepting joins this account/)).not.toBeInTheDocument();
  });
});

describe('/invite/:token — accepting', () => {
  it('redeems the token exactly once and welcomes them in', async () => {
    const user = userEvent.setup();
    mockAccept.mockResolvedValue({ status: 'accepted', workspaceId: 'prof_1' });
    renderAccept();
    await acceptIt(user);

    expect(await screen.findByText('You’re in')).toBeInTheDocument();
    // Single-use token: a second POST would come back "already used" and turn
    // this success into an error.
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAccept).toHaveBeenCalledWith('a'.repeat(64));
  });

  // The old "shared access is being switched on next" disclaimer is retired
  // on purpose: membership now resolves real access. The truthful copy is
  // pinned in the canvas-acceptance describe below.

  it('the welcome says what the grant says, not what the happy path assumed', async () => {
    const user = userEvent.setup();
    mockPreview.mockResolvedValue(preview({
      automation: { id: '7', name: 'Culture comments' },
      canEdit: false,
    }));
    mockAccept.mockResolvedValue({
      status: 'accepted',
      workspaceId: 'w1',
      automation: { id: '7', name: 'Culture comments' },
    });
    renderAccept();
    await acceptIt(user);

    // The first sentence a view-only guest reads, immediately before every
    // write they try is refused. It used to say "open and edit".
    expect(await screen.findByText(/see how it works/)).toBeInTheDocument();
    expect(screen.getByText(/Changing it stays with the owner/)).toBeInTheDocument();
    expect(screen.queryByText(/open and edit/)).not.toBeInTheDocument();
  });

  it('an editing invite still says editing', async () => {
    const user = userEvent.setup();
    mockPreview.mockResolvedValue(preview({
      automation: { id: '7', name: 'Culture comments' },
      canEdit: true,
    }));
    mockAccept.mockResolvedValue({
      status: 'accepted',
      workspaceId: 'w1',
      automation: { id: '7', name: 'Culture comments' },
    });
    renderAccept();
    await acceptIt(user);
    expect(await screen.findByText(/open and edit/)).toBeInTheDocument();
  });

  it('accepting twice with the same account is calm, not an error', async () => {
    const user = userEvent.setup();
    mockAccept.mockResolvedValue({ status: 'already_member', workspaceId: 'prof_1' });
    renderAccept();
    await acceptIt(user);
    expect(await screen.findByText('You’re already on the team')).toBeInTheDocument();
    expect(screen.queryByText(/Couldn’t accept/)).not.toBeInTheDocument();
  });

  it('the owner following their own link is told plainly, and never offered Accept', async () => {
    mockPreview.mockResolvedValue(preview({ yours: true }));
    renderAccept();
    expect(await screen.findByText('This is your own workspace')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accept and/ })).not.toBeInTheDocument();
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it.each([
    ['expired' as const, 'This invite has expired', /last 7 days/],
    ['revoked' as const, 'This invite was withdrawn', /cancelled it/],
    ['accepted' as const, 'This invite was already used', /works once/],
  ])('a %s invite gets its own sentence, before anyone presses anything', async (status, title, detail) => {
    mockPreview.mockResolvedValue(preview({ status }));
    renderAccept();
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText(detail)).toBeInTheDocument();
    // A dead invite can't be retried — offering it would just fail again.
    expect(screen.queryByRole('button', { name: /Try again/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accept and/ })).not.toBeInTheDocument();
  });

  it('a link that isn’t an invitation at all says so', async () => {
    mockPreview.mockRejectedValue(new ApiError('nope', 404, 'invite_not_found'));
    renderAccept();
    expect(await screen.findByText('This invite link isn’t valid')).toBeInTheDocument();
    expect(screen.getByText(/copied incompletely/)).toBeInTheDocument();
  });

  it('an invite claimed between reading and accepting still gets its sentence', async () => {
    const user = userEvent.setup();
    mockAccept.mockRejectedValue(new ApiError('nope', 410, 'invite_used'));
    renderAccept();
    await acceptIt(user);
    expect(await screen.findByText('This invite was already used')).toBeInTheDocument();
  });

  it('a transient failure can be retried from the page', async () => {
    const user = userEvent.setup();
    mockAccept.mockRejectedValueOnce(new ApiError('The server is busy.', 500));
    mockAccept.mockResolvedValueOnce({ status: 'accepted', workspaceId: 'prof_1' });
    renderAccept();
    await acceptIt(user);
    expect(await screen.findByText('Couldn’t accept this invite')).toBeInTheDocument();

    // Retry returns to the offer rather than firing a second accept blind:
    // the invitation is unspent either way, and the offer is the state a
    // person can act on.
    await user.click(screen.getByRole('button', { name: /Try again/ }));
    await acceptIt(user);
    expect(await screen.findByText('You’re in')).toBeInTheDocument();
  });

  it('every outcome offers a way into Populr', async () => {
    mockPreview.mockResolvedValue(preview({ status: 'expired' }));
    renderAccept();
    await screen.findByText('This invite has expired');
    const home = screen.getByRole('link', { name: /Go to Populr/ });
    expect(home).toHaveAttribute('href', '/');
  });
});

describe('the invite link survives sign-in', () => {
  it('an unauthenticated visit remembers the invite path before the login bounce', async () => {
    // The route gate's contract (App.tsx → lib/returnTo): the exact path is
    // stashed, so /auth/complete can return the recipient to their invite
    // after they sign up. Verified through the real helper, not a stand-in.
    const { rememberReturnTo, consumeReturnTo } = await vi.importActual<typeof import('../lib/returnTo')>('../lib/returnTo');
    rememberReturnTo(`/invite/${'b'.repeat(64)}`);
    expect(consumeReturnTo()).toBe(`/invite/${'b'.repeat(64)}`);
  });
});

describe('canvas-scoped invites', () => {
  const memberAccess: WorkspaceAccess = {
    id: 'w1', name: 'Summer Drop', role: 'member',
    permissions: { editAutomations: false, contactOutreach: false },
    canvasAutomation: null,
  };

  it('a canvas member is listed with the one automation they work on', async () => {
    mockFetchTeam.mockResolvedValue({
      invitations: [invitation({ id: 'i9', email: 'casey@example.com', automation: { id: '7', name: 'Culture comments' } })],
      members: [member({ email: 'alex@example.com', automation: { id: '7', name: 'Culture comments' } })],
    });
    render(<TeamPage />);
    await waitFor(() => expect(screen.getByText('alex@example.com')).toBeInTheDocument());
    // Both the joined member and the still-pending invite say WHICH canvas.
    expect(screen.getAllByText(/Works on/)).toHaveLength(2);
    expect(screen.getAllByText('“Culture comments”')).toHaveLength(2);
  });

  // The builder's own share sheet — what it sends, who may open it, and the
  // link it hands back — is pinned in shareAutomation.test.tsx.

  it('a member sees the roster read-only: no inviting, no withdrawing', async () => {
    mockAccess = memberAccess;
    mockFetchTeam.mockResolvedValue({
      invitations: [invitation({ email: 'pending@example.com' })],
      members: [member()],
    });
    render(<TeamPage />);
    await waitFor(() => expect(screen.getByText('jo@example.com')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Invite teammate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Withdraw/ })).not.toBeInTheDocument();
  });
});

describe('/invite/:token — canvas acceptance', () => {
  it('names the automation and opens it, not the workspace', async () => {
    const user = userEvent.setup();
    mockPreview.mockResolvedValue(preview({ automation: { id: '7', name: 'Culture comments' } }));
    mockAccept.mockResolvedValue({
      status: 'accepted',
      workspaceId: 'w1',
      automation: { id: '7', name: 'Culture comments' },
    });
    renderAccept();
    await acceptIt(user);

    expect(await screen.findByText('You’re in')).toBeInTheDocument();
    expect(screen.getByText('“Culture comments”')).toBeInTheDocument();
    const open = screen.getByRole('link', { name: 'Open the automation' });
    expect(open).toHaveAttribute('href', '/automations/7');
    // The generic Go to Populr is replaced by the specific door.
    expect(screen.queryByRole('link', { name: 'Go to Populr' })).not.toBeInTheDocument();
  });

  it('a workspace acceptance says the workspace is theirs to see now', async () => {
    const user = userEvent.setup();
    mockAccept.mockResolvedValue({ status: 'accepted', workspaceId: 'w1', automation: null });
    renderAccept();
    await acceptIt(user);

    expect(await screen.findByText('You’re in')).toBeInTheDocument();
    // It MOVES them, rather than re-reading and hoping. Re-resolving alone
    // re-runs the server's fallback inference, and for anyone who already
    // has an automation or a connected account of their own that answers
    // "your own workspace" — so they joined a team and landed back where
    // they started. Accepting is the clearest statement of which workspace
    // someone means; this makes it the one they are in.
    expect(mockSwitchWorkspace).toHaveBeenCalledWith('w1', null);
    expect(screen.getByText(/it’s what Populr opens for you now/)).toBeInTheDocument();
    // The pre-access-era disclaimer is gone: membership now resolves access.
    expect(screen.queryByText(/being switched on next/)).not.toBeInTheDocument();
  });
});
