import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import TeamPage from '../pages/TeamPage';
import { appContext } from './appContext.mock';
import type { TeamInvitation, TeamPerson, WorkspaceAccess } from '../lib/api';

/* Correcting a mistake on the Team page.
 *
 * Two dead ends, both of which a real owner hits within a week of having a
 * team. Someone was given the wrong access, and the only way to fix it was
 * to remove them and invite them again — which withdraws their link, drops
 * their place in the workspace, and asks them to accept a second time
 * because a box was ticked wrong. And an invitation that never arrived could
 * only be withdrawn, never sent again.
 *
 * Both endpoints existed the whole time. Nothing called them.
 *
 * What this pins:
 *   - a permission can be changed in place, and the request says only what
 *     changed;
 *   - a canvas seat is one switch and a workspace membership is two, because
 *     those are different grants and the server takes different fields;
 *   - a refused save puts the switch back — a toggle that stays moved after
 *     a refusal is a lie about who can do what;
 *   - an invitation can be sent again, and when the email fails AGAIN the
 *     owner is given the link rather than a dead end;
 *   - none of it is offered to somebody who isn't the owner.
 */

const mockFetchTeam = vi.fn();
const mockUpdate = vi.fn();
const mockResend = vi.fn();

let mockAccess: WorkspaceAccess | null = null;

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Sam', email: 'sam@example.com' }, signOut: vi.fn() }),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => appContext({ showToast: vi.fn(), workspaceAccess: mockAccess }),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchTeam: () => mockFetchTeam(),
    updateTeammate: (...args: unknown[]) => mockUpdate(...args),
    resendInvitation: (id: string) => mockResend(id),
  };
});

const OWNER_ACCESS: WorkspaceAccess = {
  id: 'w_1', name: 'Summer Drop', role: 'owner',
  permissions: { editAutomations: true, contactOutreach: true },
  canvasAutomation: null,
};

function person(over: Partial<TeamPerson> = {}): TeamPerson {
  return {
    handle: 'h_jo',
    person: { name: 'Jo', email: 'jo@example.com', avatarUrl: null },
    role: 'member',
    permissions: { editAutomations: false, contactOutreach: false },
    joinedAt: new Date().toISOString(),
    automation: null,
    you: false,
    ...over,
  };
}

function invitation(over: Partial<TeamInvitation> = {}): TeamInvitation {
  return {
    id: 'inv_1',
    email: 'kit@example.com',
    permissions: { editAutomations: false, contactOutreach: false },
    status: 'pending',
    emailDelivery: 'sent',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    automation: null,
    ...over,
  };
}

function mount(team: { people?: TeamPerson[]; invitations?: TeamInvitation[] }) {
  mockFetchTeam.mockResolvedValue({
    invitations: team.invitations ?? [],
    members: [],
    people: team.people ?? [],
  });
  return render(<MemoryRouter><TeamPage /></MemoryRouter>);
}

/** The row for one teammate, so an assertion can't accidentally match another. */
async function rowFor(name: string): Promise<HTMLElement> {
  const heading = await screen.findByText(name);
  return heading.closest('div.py-2\\.5') as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAccess = OWNER_ACCESS;
  mockUpdate.mockResolvedValue(undefined);
});

describe('changing what a teammate can do', () => {
  it('opens the switches from the row, closed by default', async () => {
    const user = userEvent.setup();
    mount({ people: [person()] });

    // Closed to begin with: the roster is a list of people, not a settings
    // panel, and two rows of switches open at once is how the wrong one
    // gets flipped.
    expect(await screen.findByText('Jo')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /Edit automations/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Change what Jo can do' }));
    expect(screen.getByRole('switch', { name: /Edit automations/ })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Contact outreach/ })).toBeInTheDocument();
  });

  it('sends only the permission that changed', async () => {
    const user = userEvent.setup();
    mount({ people: [person()] });
    await user.click(await screen.findByRole('button', { name: 'Change what Jo can do' }));
    await user.click(screen.getByRole('switch', { name: /Edit automations/ }));

    // Not the whole permission object: the server treats an absent field as
    // "leave it alone", and sending both would overwrite a change somebody
    // else made in the seconds this panel was open.
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('h_jo', { editAutomations: true }));
  });

  it('moves the switch immediately rather than waiting for the server', async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    mockUpdate.mockReturnValue(new Promise<void>(resolve => { release = () => resolve(); }));

    mount({ people: [person()] });
    await user.click(await screen.findByRole('button', { name: 'Change what Jo can do' }));
    await user.click(screen.getByRole('switch', { name: /Contact outreach/ }));

    // Still in flight, already on. A switch that waits for a round trip
    // before moving reads as broken.
    expect(screen.getByRole('switch', { name: /Contact outreach/ })).toHaveAttribute('aria-checked', 'true');
    release();
  });

  it('puts the switch back when the server refuses', async () => {
    const user = userEvent.setup();
    mockUpdate.mockRejectedValue(new Error("They're not on this team any more."));

    mount({ people: [person()] });
    await user.click(await screen.findByRole('button', { name: 'Change what Jo can do' }));
    await user.click(screen.getByRole('switch', { name: /Edit automations/ }));

    // The roster is the answer to "who can do what". Leaving it showing a
    // change that did not happen is worse than never having moved.
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /Edit automations/ })).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByText("They're not on this team any more.")).toBeInTheDocument();
  });

  it('offers one switch for a canvas seat, and calls it what the server calls it', async () => {
    const user = userEvent.setup();
    mount({
      people: [person({
        role: 'canvas',
        automation: { id: '77', name: 'Welcome DM' },
        permissions: { editAutomations: false, contactOutreach: false },
      })],
    });

    await user.click(await screen.findByRole('button', { name: 'Change what Jo can do' }));
    // Contact outreach is not a thing a canvas seat has, so it isn't offered.
    expect(screen.queryByRole('switch', { name: /Contact outreach/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: /Edit this automation/ }));
    // canEdit, not editAutomations: the server takes a different field for a
    // canvas grant and answers 400 for the other one.
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('h_jo', { canEdit: true }));
  });

  it('says which way a canvas seat is currently set', async () => {
    // It became changeable, so the row has to state it. A control whose
    // current value is invisible is a guess with a switch attached.
    mount({
      people: [person({
        role: 'canvas',
        automation: { id: '77', name: 'Welcome DM' },
        permissions: { editAutomations: false, contactOutreach: false },
      })],
    });
    const row = await rowFor('Jo');
    expect(within(row).getByText(/view only/)).toBeInTheDocument();
  });

  it('offers none of it to somebody who is not the owner', async () => {
    mockAccess = { ...OWNER_ACCESS, role: 'member' };
    mount({ people: [person()] });

    expect(await screen.findByText('Jo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change what Jo can do' })).not.toBeInTheDocument();
  });
});

describe('sending an invitation again', () => {
  it('resends and reports it went out', async () => {
    const user = userEvent.setup();
    mockResend.mockResolvedValue({
      invitation: invitation({ emailDelivery: 'sent' }),
      inviteUrl: 'https://app.example.com/invite/abc',
    });

    mount({ invitations: [invitation({ emailDelivery: 'failed' })] });
    await user.click(await screen.findByRole('button', { name: 'Send the invite to kit@example.com again' }));

    await waitFor(() => expect(mockResend).toHaveBeenCalledWith('inv_1'));
    // Says the old link died, because it did — reissuing rotates the token,
    // and an owner who had sent the first link by hand needs to know.
    expect(await screen.findByText(/earlier link stopped working/)).toBeInTheDocument();
  });

  it('hands over the link when the email fails again', async () => {
    const user = userEvent.setup();
    mockResend.mockResolvedValue({
      invitation: invitation({ emailDelivery: 'failed' }),
      inviteUrl: 'https://app.example.com/invite/xyz789',
    });

    mount({ invitations: [invitation({ emailDelivery: 'failed' })] });
    await user.click(await screen.findByRole('button', { name: 'Send the invite to kit@example.com again' }));

    // The dead end this exists to remove. The invitation IS live — the token
    // was rotated before the send was attempted — so the owner needs the
    // link, not an apology.
    expect(await screen.findByText(/send them this link yourself/)).toBeInTheDocument();
    expect(screen.getByText('https://app.example.com/invite/xyz789')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy link/ })).toBeInTheDocument();
  });

  it('stops telling the owner to start over', async () => {
    // The row used to say "try inviting again", which meant withdrawing the
    // person and re-inviting them. It points at Resend now.
    mount({ invitations: [invitation({ emailDelivery: 'failed' })] });
    expect(await screen.findByText(/send it again/)).toBeInTheDocument();
    expect(screen.queryByText(/try inviting again/)).not.toBeInTheDocument();
  });

  it('leaves the roster alone when a resend is refused', async () => {
    const user = userEvent.setup();
    mockResend.mockRejectedValue(new Error("There's no pending invite to send again."));

    mount({ invitations: [invitation()] });
    await user.click(await screen.findByRole('button', { name: 'Send the invite to kit@example.com again' }));

    expect(await screen.findByText("There's no pending invite to send again.")).toBeInTheDocument();
    // Still listed: a failed resend changes nothing, and blanking the row
    // would say the invitation was gone when it is exactly as it was.
    expect(screen.getByText('kit@example.com')).toBeInTheDocument();
  });

  it('is the owner\'s, like withdrawing', async () => {
    mockAccess = { ...OWNER_ACCESS, role: 'member' };
    mount({ invitations: [invitation()] });

    expect(await screen.findByText('kit@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send the invite/ })).not.toBeInTheDocument();
  });
});
