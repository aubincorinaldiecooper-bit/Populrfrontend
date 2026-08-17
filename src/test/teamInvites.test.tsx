import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import TeamPage from '../pages/TeamPage';
import InviteAcceptPage from '../pages/InviteAcceptPage';
import { ApiError, type TeamInvitation, type TeamMember } from '../lib/api';

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

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchTeam: () => mockFetchTeam(),
    inviteTeammate: (email: string, permissions: unknown) => mockInvite(email, permissions),
    revokeInvitation: (id: string) => mockRevoke(id),
    acceptInvitation: (token: string) => mockAccept(token),
  };
});

function invitation(over: Partial<TeamInvitation> = {}): TeamInvitation {
  return {
    id: 'inv_1',
    email: 'sam@example.com',
    permissions: { editAutomations: false, contactOutreach: false },
    status: 'pending',
    emailDelivery: 'sent',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    ...over,
  };
}

function member(over: Partial<TeamMember> = {}): TeamMember {
  return {
    email: 'jo@example.com',
    permissions: { editAutomations: true, contactOutreach: false },
    joinedAt: new Date().toISOString(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchTeam.mockResolvedValue({ invitations: [], members: [] });
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

describe('/invite/:token — accepting', () => {
  it('redeems the token exactly once and welcomes them in', async () => {
    mockAccept.mockResolvedValue({ status: 'accepted', workspaceId: 'prof_1' });
    renderAccept();
    expect(await screen.findByText('You’re in')).toBeInTheDocument();
    // Single-use token: a second POST would come back "already used" and turn
    // this success into an error.
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAccept).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('is honest that shared-workspace access is not switched on yet', async () => {
    mockAccept.mockResolvedValue({ status: 'accepted', workspaceId: 'prof_1' });
    renderAccept();
    await screen.findByText('You’re in');
    expect(screen.getByText(/your place on the team is already saved/)).toBeInTheDocument();
  });

  it('accepting twice with the same account is calm, not an error', async () => {
    mockAccept.mockResolvedValue({ status: 'already_member', workspaceId: 'prof_1' });
    renderAccept();
    expect(await screen.findByText('You’re already on the team')).toBeInTheDocument();
    expect(screen.queryByText(/Couldn’t accept/)).not.toBeInTheDocument();
  });

  it('the owner clicking their own link is told plainly, not shown an error', async () => {
    mockAccept.mockResolvedValue({ status: 'owner', workspaceId: 'prof_1' });
    renderAccept();
    expect(await screen.findByText('This is your own workspace')).toBeInTheDocument();
  });

  it.each([
    ['invite_expired', 'This invite has expired', /last 7 days/],
    ['invite_revoked', 'This invite was withdrawn', /cancelled it/],
    ['invite_used', 'This invite was already used', /works once/],
    ['invite_not_found', 'This invite link isn’t valid', /copied incompletely/],
  ])('%s gets its own sentence', async (code, title, detail) => {
    mockAccept.mockRejectedValue(new ApiError('nope', 410, code));
    renderAccept();
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText(detail)).toBeInTheDocument();
    // A dead invite can't be retried — offering it would just fail again.
    expect(screen.queryByRole('button', { name: /Try again/ })).not.toBeInTheDocument();
  });

  it('a transient failure can be retried from the page', async () => {
    const user = userEvent.setup();
    mockAccept.mockRejectedValueOnce(new ApiError('The server is busy.', 500));
    mockAccept.mockResolvedValueOnce({ status: 'accepted', workspaceId: 'prof_1' });
    renderAccept();
    expect(await screen.findByText('Couldn’t accept this invite')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByText('You’re in')).toBeInTheDocument();
  });

  it('every outcome offers a way into Populr', async () => {
    mockAccept.mockRejectedValue(new ApiError('nope', 410, 'invite_expired'));
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
