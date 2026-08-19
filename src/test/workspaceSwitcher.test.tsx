import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { render } from './render';
import { appContext } from './appContext.mock';
import AccountMenu from '../components/AccountMenu';
import type { WorkspaceAccess, WorkspaceOption } from '../lib/api';

/* Moving between workspaces.
 *
 * Populr used to infer which workspace you were in — whoever owned one with
 * content stayed in it, and anything they had accepted became unreachable.
 * Not hidden: unreachable, because there was no surface that could point at
 * a workspace you were not currently inferred into. This is that surface.
 *
 * It lives in the account area because "which workspace" is an identity
 * question and sits next to "which account", and because that block is the
 * one thing in the shell present at both sidebar widths and in the phone
 * drawer.
 *
 * What this file pins:
 *   - the choice is offered only when there IS one;
 *   - a canvas grant is named by its automation, because that is the whole
 *     of what was shared;
 *   - switching asks the server, then goes Home — the page you were on
 *     belongs to the workspace you just left;
 *   - a refused switch says so and leaves you where you were.
 */

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({ useApp: () => mockUseApp() }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Aubin', email: 'aubin@example.com' }, signOut: vi.fn() }),
}));

const OWN: WorkspaceOption = {
  id: 'w_own', name: 'Aubin Studio', role: 'owner',
  permissions: { editAutomations: true, contactOutreach: true },
  automation: null, since: '2026-01-01T00:00:00.000Z',
};
const JOINED: WorkspaceOption = {
  id: 'w_host', name: 'Host Studio', role: 'member',
  permissions: { editAutomations: true, contactOutreach: false },
  automation: null, since: '2026-02-01T00:00:00.000Z',
};
const SHARED_CANVAS: WorkspaceOption = {
  id: 'w_host', name: 'Host Studio', role: 'canvas',
  permissions: { editAutomations: false, contactOutreach: false },
  automation: { id: '77', name: 'Welcome DM' }, since: '2026-03-01T00:00:00.000Z',
};

const ownAccess: WorkspaceAccess = {
  id: 'w_own', name: 'Aubin Studio', role: 'owner',
  permissions: { editAutomations: true, contactOutreach: true },
  canvasAutomation: null,
};

let switchToWorkspace: ReturnType<typeof vi.fn>;
let showToast: ReturnType<typeof vi.fn>;

function setup(workspaces: WorkspaceOption[], access: WorkspaceAccess = ownAccess) {
  mockUseApp.mockReturnValue(
    appContext({ workspaces, workspaceAccess: access, switchToWorkspace, showToast }),
  );
  return render(
    <MemoryRouter initialEntries={['/contacts']}>
      <Routes>
        <Route path="/contacts" element={<AccountMenu />} />
        <Route path="/" element={<p>HOME</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: 'Account menu' }));
  // No name filter: the menu opens through a portal and the suites that
  // came before query it exactly this way.
  return screen.findByRole('menu');
}

beforeEach(() => {
  vi.clearAllMocks();
  switchToWorkspace = vi.fn().mockResolvedValue(undefined);
  showToast = vi.fn();
});

describe('the switcher appears only when there is a choice', () => {
  it('one workspace, no switcher — a menu with a single option is not a choice', async () => {
    const user = userEvent.setup();
    setup([OWN]);
    const menu = await openMenu(user);

    expect(within(menu).queryByText('Workspace')).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /Aubin Studio/ })).not.toBeInTheDocument();
    // The account actions are untouched by any of this.
    expect(within(menu).getByRole('menuitem', { name: /Settings/ })).toBeInTheDocument();
  });

  it('two, and both are listed with the current one marked', async () => {
    const user = userEvent.setup();
    setup([OWN, JOINED]);
    const menu = await openMenu(user);

    expect(within(menu).getByText('Workspace')).toBeInTheDocument();
    const own = within(menu).getByRole('menuitem', { name: /Aubin Studio/ });
    const joined = within(menu).getByRole('menuitem', { name: /Host Studio/ });
    // Where you are, and what it is to you — a workspace you joined is not
    // the same thing as one you own, and the menu says which is which.
    expect(own).toHaveTextContent('Yours');
    expect(joined).toHaveTextContent('Joined');
  });

  it('a shared automation is named by the automation, not the workspace', async () => {
    const user = userEvent.setup();
    setup([OWN, SHARED_CANVAS]);
    const menu = await openMenu(user);

    // The whole of what they were given is one automation. Offering it under
    // the workspace's name would promise a workspace they cannot reach.
    expect(within(menu).getByRole('menuitem', { name: /Welcome DM/ })).toHaveTextContent('Shared');
    expect(within(menu).queryByRole('menuitem', { name: /^Host Studio/ })).not.toBeInTheDocument();
  });

  it('the same workspace held two ways is two entries', async () => {
    const user = userEvent.setup();
    setup([OWN, JOINED, SHARED_CANVAS]);
    const menu = await openMenu(user);

    // Membership and a canvas grant share a workspace id and are different
    // amounts of access; collapsing them would misdescribe one of the two.
    expect(within(menu).getByRole('menuitem', { name: /Host Studio/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Welcome DM/ })).toBeInTheDocument();
  });
});

describe('switching', () => {
  it('asks the server for the workspace, and for the capacity', async () => {
    const user = userEvent.setup();
    setup([OWN, SHARED_CANVAS]);
    const menu = await openMenu(user);

    await user.click(within(menu).getByRole('menuitem', { name: /Welcome DM/ }));

    // The automation id travels with it: without it the server would seat
    // them as a member of a workspace they are not a member of.
    expect(switchToWorkspace).toHaveBeenCalledWith('w_host', '77');
  });

  it('lands Home, because the page you were on belongs to the workspace you left', async () => {
    const user = userEvent.setup();
    setup([OWN, JOINED]);
    const menu = await openMenu(user);

    await user.click(within(menu).getByRole('menuitem', { name: /Host Studio/ }));

    expect(await screen.findByText('HOME')).toBeInTheDocument();
  });

  it('clicking the one you are already in does nothing at all', async () => {
    const user = userEvent.setup();
    setup([OWN, JOINED]);
    const menu = await openMenu(user);

    await user.click(within(menu).getByRole('menuitem', { name: /Aubin Studio/ }));

    expect(switchToWorkspace).not.toHaveBeenCalled();
    expect(screen.queryByText('HOME')).not.toBeInTheDocument();
  });

  it('a refused switch says so and leaves them where they were', async () => {
    const user = userEvent.setup();
    // The server refuses a workspace they no longer hold — a switcher opened
    // before someone else revoked them. Half-moving them would be worse than
    // not moving them.
    switchToWorkspace.mockRejectedValue(new Error("You don't have access to that workspace."));
    setup([OWN, JOINED]);
    const menu = await openMenu(user);

    await user.click(within(menu).getByRole('menuitem', { name: /Host Studio/ }));

    expect(showToast).toHaveBeenCalledWith("You don't have access to that workspace.", 'error');
    expect(screen.queryByText('HOME')).not.toBeInTheDocument();
  });
});

describe('at rail width', () => {
  it('the switcher is in the collapsed account menu too', async () => {
    const user = userEvent.setup();
    mockUseApp.mockReturnValue(
      appContext({ workspaces: [OWN, JOINED], workspaceAccess: ownAccess, switchToWorkspace, showToast }),
    );
    render(
      <MemoryRouter>
        <AccountMenu compact />
      </MemoryRouter>,
    );

    // Collapsing the navigation must not cost a creator the ability to leave
    // the workspace they are in — the rail is a width, not fewer powers.
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Host Studio/ })).toBeInTheDocument();
  });
});
