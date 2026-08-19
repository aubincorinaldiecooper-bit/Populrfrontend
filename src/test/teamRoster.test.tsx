import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { render } from './render';
import TeamPage from '../pages/TeamPage';
import { appContext } from './appContext.mock';
import type { TeamPerson, WorkspaceAccess } from '../lib/api';

/* The team, as people.
 *
 * Populr could invite someone and could let them in, and then described them
 * for the rest of time as the address the invitation was sent to. Not the
 * address they sign in with — invitations get forwarded — and never a name or
 * a face. The owner wasn't on the list at all, on the reasoning that you are
 * not a collaborator in your own workspace, which is true and makes for a
 * team page that doesn't show the team. And there was no way to remove
 * anyone, at all, ever.
 *
 * What this file pins:
 *   - names come from who signed in, not from where an invite was posted;
 *   - the owner is on the roster, and is not removable, because there is
 *     nothing to withdraw;
 *   - removing is the owner's, it asks first, and it says what it costs;
 *   - a server that hasn't been redeployed still renders a team rather than
 *     an empty page.
 */

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({ useApp: () => mockUseApp() }));

const fetchTeam = vi.fn();
const removeTeammate = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchTeam: (...args: unknown[]) => fetchTeam(...args),
    removeTeammate: (...args: unknown[]) => removeTeammate(...args),
    inviteTeammate: vi.fn(),
    revokeInvitation: vi.fn(),
  };
});

const ownerAccess: WorkspaceAccess = {
  workspace: { id: 'w_1', name: 'Ada Studio' },
  role: 'owner',
  permissions: { editAutomations: true, contactOutreach: true },
  canvasAutomation: null,
} as unknown as WorkspaceAccess;

const memberAccess: WorkspaceAccess = {
  workspace: { id: 'w_1', name: 'Ada Studio' },
  role: 'member',
  permissions: { editAutomations: true, contactOutreach: false },
  canvasAutomation: null,
} as unknown as WorkspaceAccess;

const OWNER: TeamPerson = {
  handle: null,
  person: { name: 'Ada Owner', email: 'ada@example.com', avatarUrl: null },
  role: 'owner',
  permissions: { editAutomations: true, contactOutreach: true },
  joinedAt: '2026-01-01T00:00:00.000Z',
  automation: null,
  you: true,
};

const MEMBER: TeamPerson = {
  handle: 'handle-bo',
  // Invited at invited-at@example.com; signs in as bo@example.com. The
  // distinction is the whole point of naming people rather than invitations.
  person: { name: 'Bo Member', email: 'bo@example.com', avatarUrl: null },
  role: 'member',
  permissions: { editAutomations: true, contactOutreach: false },
  joinedAt: '2026-02-01T00:00:00.000Z',
  automation: null,
  you: false,
};

const CANVAS: TeamPerson = {
  handle: 'handle-cass',
  person: { name: null, email: 'cass@example.com', avatarUrl: null },
  role: 'canvas',
  permissions: { editAutomations: false, contactOutreach: false },
  joinedAt: '2026-03-01T00:00:00.000Z',
  automation: { id: '7', name: 'Welcome DM' },
  you: false,
};

function team(people: TeamPerson[] | undefined) {
  return {
    invitations: [],
    // The older array, keyed by the invited address — what a server that
    // predates the roster sends, and what this page must not prefer.
    members: people
      ? people
          .filter(p => p.role !== 'owner')
          .map(p => ({
            email: 'invited-at@example.com',
            permissions: p.permissions,
            joinedAt: p.joinedAt,
            automation: p.automation,
          }))
      : [{
          email: 'invited-at@example.com',
          permissions: { editAutomations: true, contactOutreach: false },
          joinedAt: '2026-02-01T00:00:00.000Z',
          automation: null,
        }],
    ...(people ? { people } : {}),
  };
}

function mount() {
  return render(<MemoryRouter><TeamPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseApp.mockReturnValue(appContext({ workspaceAccess: ownerAccess }));
  fetchTeam.mockResolvedValue(team([OWNER, MEMBER, CANVAS]));
  removeTeammate.mockResolvedValue(undefined);
});

describe('the roster names people', () => {
  it('shows who signed in, not where the invitation was posted', async () => {
    mount();
    expect(await screen.findByText('Bo Member')).toBeInTheDocument();
    // The address the invite went to is a fact about the invitation, not
    // about the person, and it must not stand in for them.
    expect(screen.queryByText('invited-at@example.com')).not.toBeInTheDocument();
  });

  it('includes the owner, marked as you', async () => {
    mount();
    expect(await screen.findByText('Ada Owner')).toBeInTheDocument();
    expect(screen.getByText(/Owner · runs this workspace/)).toBeInTheDocument();
    expect(screen.getByText(/· you/)).toBeInTheDocument();
  });

  it('falls back to the address for someone who has never signed in', async () => {
    mount();
    // Cass has no name yet — so the address stands in, and the automation
    // their invite opens is what says who they are on the team.
    expect(await screen.findByText('cass@example.com')).toBeInTheDocument();
    expect(screen.getByText(/Welcome DM/)).toBeInTheDocument();
  });
});

describe('withdrawing someone', () => {
  it('is offered for collaborators and never for the owner', async () => {
    mount();
    await screen.findByText('Ada Owner');
    expect(screen.getByRole('button', { name: 'Remove Bo Member from this workspace' })).toBeInTheDocument();
    // Not "the owner row hides its button" — there is no button, because
    // there is no grant behind the owner to take away.
    expect(screen.queryByRole('button', { name: /Remove Ada Owner/ })).not.toBeInTheDocument();
  });

  it('asks first, and says what it costs', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Bo Member');
    await user.click(screen.getByRole('button', { name: 'Remove Bo Member from this workspace' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Remove Bo Member?')).toBeInTheDocument();
    // The consequence a creator can't see from the button: their link dies
    // with their access, so this is not a pause.
    expect(within(dialog).getByText(/invite link stops working/)).toBeInTheDocument();
    // Nothing has happened yet — the question is a question.
    expect(removeTeammate).not.toHaveBeenCalled();
  });

  it('removes them by their handle, and the row goes', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Bo Member');
    await user.click(screen.getByRole('button', { name: 'Remove Bo Member from this workspace' }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    // By the opaque handle — never by an email or an account id.
    await waitFor(() => expect(removeTeammate).toHaveBeenCalledWith('handle-bo'));
    await waitFor(() => expect(screen.queryByText('Bo Member')).not.toBeInTheDocument());
    // And only them.
    expect(screen.getByText('Ada Owner')).toBeInTheDocument();
    expect(screen.getByText('cass@example.com')).toBeInTheDocument();
  });

  it('is the owner\'s: a member sees the team and no way to change it', async () => {
    mockUseApp.mockReturnValue(appContext({ workspaceAccess: memberAccess }));
    mount();
    await screen.findByText('Bo Member');
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  });

  it('keeps them on the list when the server refuses', async () => {
    const user = userEvent.setup();
    removeTeammate.mockRejectedValue(new Error('Could not remove them just now.'));
    mount();
    await screen.findByText('Bo Member');
    await user.click(screen.getByRole('button', { name: 'Remove Bo Member from this workspace' }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    // A failed removal that emptied the row anyway would tell the owner
    // someone is gone who still has the keys.
    expect(await screen.findByText('Could not remove them just now.')).toBeInTheDocument();
    expect(screen.getByText('Bo Member')).toBeInTheDocument();
  });
});

describe('a server that has not been redeployed', () => {
  it('still shows a team rather than an empty page', async () => {
    fetchTeam.mockResolvedValue(team(undefined));
    mount();
    // The old shape, rendered the old way — by the invited address, since
    // that is genuinely all an older server sends.
    expect(await screen.findByText('invited-at@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/You&apos;re the only one here/)).not.toBeInTheDocument();
  });

  it('and an owner genuinely alone still hears so', async () => {
    fetchTeam.mockResolvedValue({ invitations: [], members: [], people: [OWNER] });
    mount();
    // One row long, and that row is you — which is "the only one here", not
    // a team of one.
    expect(await screen.findByText(/You're the only one here/)).toBeInTheDocument();
  });
});
