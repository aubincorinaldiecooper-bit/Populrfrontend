import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
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
let authedUser: { id: string; name: string; email: string } =
  { id: 'u_aubin', name: 'Aubin', email: 'aubin@example.com' };
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: authedUser, signOut: vi.fn() }),
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

describe('the wire', () => {
  it('sends the ids as fields the server can read', async () => {
    // The bug this exists for: apiFetch stringifies the body itself, so a
    // pre-stringified one arrived as JSON wrapped in JSON — a request with
    // no workspaceId on it at all, refused every time. A mocked
    // switchToWorkspace can never see that, so this asserts against the
    // actual fetch.
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ workspace: { id: 'w_host', name: 'Host Studio', role: 'member', permissions: { editAutomations: true, contactOutreach: false }, automation: null, since: '2026-02-01T00:00:00.000Z' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const api = await import('../lib/api');
      await api.switchWorkspace('w_host', '77');

      // By URL, not by index: apiFetch fetches an auth token first, so the
      // first call is not the one under test.
      const call = (fetchMock.mock.calls as unknown as [string, RequestInit][])
        .find(([url]) => String(url).includes('/api/me/workspace'));
      expect(call, 'the switch request was never made').toBeTruthy();
      const sent = JSON.parse(String(call![1].body)) as Record<string, unknown>;
      expect(sent.workspaceId).toBe('w_host');
      expect(sent.automationId).toBe('77');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('the server-state boundary', () => {
  it('a switch ends the session the old workspace’s answers belonged to', async () => {
    // clear() empties the store but tells a MOUNTED observer nothing — the
    // bell and the Inbox badge live in the shell and survive the navigation
    // Home, so they would keep rendering the workspace they were fetched in
    // until something happened to refetch. endServerStateSession is the
    // boundary sign-out already uses: it resets live queries, drops the
    // rest, and advances the epoch so a mutation still in flight cannot roll
    // the old workspace's data back in.
    //
    // The epoch is the observable half, and the half clear() cannot fake.
    const { serverStateEpoch } = await import('../lib/queryClient');
    const { AppProvider, useApp } = await vi.importActual<typeof import('../context/AppContext')>(
      '../context/AppContext',
    );
    const api = await import('../lib/api');
    vi.spyOn(api, 'switchWorkspace').mockResolvedValue(JOINED);
    vi.spyOn(api, 'isBackendConfigured').mockReturnValue(true);
    vi.spyOn(api, 'fetchWorkspaceAccess').mockResolvedValue(ownAccess);
    vi.spyOn(api, 'fetchWorkspaces').mockResolvedValue({
      workspaces: [OWN, JOINED],
      current: { id: 'w_own', automationId: null },
    });
    vi.spyOn(api, 'fetchConnectedAccounts').mockResolvedValue([]);

    let move: ((id: string, automationId?: string | null) => Promise<void>) | null = null;
    function Probe() {
      move = useApp().switchToWorkspace;
      return null;
    }
    render(
      <MemoryRouter>
        <AppProvider><Probe /></AppProvider>
      </MemoryRouter>,
    );

    const before = serverStateEpoch();
    await act(async () => { await move!('w_host', null); });
    expect(serverStateEpoch()).toBeGreaterThan(before);
  });

  it('leaving crosses the same boundary a switch does', async () => {
    // The finding this pins: leaving changed which workspace you are in but
    // only re-resolved access, so React Query observers and the connected
    // accounts kept answering for the workspace just walked out of —
    // potentially rendering someone else's numbers under your own name.
    // Leaving is a workspace change; it owes what a workspace change owes.
    const { serverStateEpoch } = await import('../lib/queryClient');
    const { AppProvider, useApp } = await vi.importActual<typeof import('../context/AppContext')>(
      '../context/AppContext',
    );
    const api = await import('../lib/api');
    vi.spyOn(api, 'isBackendConfigured').mockReturnValue(true);
    vi.spyOn(api, 'leaveWorkspace').mockResolvedValue(undefined);
    vi.spyOn(api, 'fetchWorkspaceAccess').mockResolvedValue(ownAccess);
    vi.spyOn(api, 'fetchWorkspaces').mockResolvedValue({
      workspaces: [OWN],
      current: { id: 'w_own', automationId: null },
    });
    const accounts = vi.spyOn(api, 'fetchConnectedAccounts').mockResolvedValue([]);

    let leave: (() => Promise<void>) | null = null;
    function Probe() {
      leave = useApp().leaveCurrentWorkspace;
      return null;
    }
    render(
      <MemoryRouter>
        <AppProvider><Probe /></AppProvider>
      </MemoryRouter>,
    );

    const before = serverStateEpoch();
    const readsBefore = accounts.mock.calls.length;
    await act(async () => { await leave!(); });

    expect(serverStateEpoch()).toBeGreaterThan(before);
    // And the account list is re-read: connected accounts are per-workspace,
    // so the ones on screen belonged to the workspace they just gave back.
    expect(accounts.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it('applies the workspace the server returned, even when the follow-up read fails', async () => {
    // refreshWorkspaceAccess swallows its own failures by design — a
    // transient /api/me error should not blank the shell. That is right for
    // a refresh and wrong for a MOVE: the switch already succeeded, so
    // discarding its result and waiting to be told again leaves
    // workspaceAccess describing the workspace they just left. The shell
    // decides what to render from exactly that, so a canvas invitee would be
    // handed an owner's menu.
    const { AppProvider, useApp } = await vi.importActual<typeof import('../context/AppContext')>(
      '../context/AppContext',
    );
    const api = await import('../lib/api');
    vi.spyOn(api, 'isBackendConfigured').mockReturnValue(true);
    vi.spyOn(api, 'fetchConnectedAccounts').mockResolvedValue([]);
    vi.spyOn(api, 'fetchWorkspaces').mockResolvedValue({
      workspaces: [OWN, SHARED_CANVAS],
      current: { id: 'w_own', automationId: null },
    });
    const access = vi.spyOn(api, 'fetchWorkspaceAccess').mockResolvedValue(ownAccess);
    vi.spyOn(api, 'switchWorkspace').mockResolvedValue(SHARED_CANVAS);

    let move: ((id: string, automationId?: string | null) => Promise<void>) | null = null;
    // Annotated because TS narrows the initialiser to null and the writes
    // happen inside a component it cannot see called.
    let current = null as WorkspaceAccess | null;
    function Probe() {
      const app = useApp();
      move = app.switchToWorkspace;
      current = app.workspaceAccess;
      return null;
    }
    render(
      <MemoryRouter><AppProvider><Probe /></AppProvider></MemoryRouter>,
    );
    await waitFor(() => expect(current?.id).toBe('w_own'));

    // The move lands; the reconciling read behind it does not.
    access.mockRejectedValue(new Error('offline'));
    await act(async () => { await move!('w_host', '77'); });

    expect(current?.id).toBe('w_host');
    expect(current?.role).toBe('canvas');
    expect(current?.canvasAutomation?.id).toBe('77');
  });
});

describe('a different account inherits nothing', () => {
  it('the workspace list is emptied when the signed-in identity changes', async () => {
    // AuthContext can swap sessions in place, so AppProvider is not
    // remounted — and the refresh keeps the last known list when its own
    // fetch fails, which is right for a flaky network and badly wrong across
    // an identity change: the new account would be shown the previous one's
    // workspaces, and the names of automations shared with THEM.
    const { AppProvider, useApp } = await vi.importActual<typeof import('../context/AppContext')>(
      '../context/AppContext',
    );
    const api = await import('../lib/api');
    vi.spyOn(api, 'isBackendConfigured').mockReturnValue(true);
    vi.spyOn(api, 'fetchConnectedAccounts').mockResolvedValue([]);
    vi.spyOn(api, 'fetchWorkspaceAccess').mockResolvedValue(ownAccess);
    const list = vi.spyOn(api, 'fetchWorkspaces').mockResolvedValue({
      workspaces: [OWN, JOINED],
      current: { id: 'w_own', automationId: null },
    });

    let seen: WorkspaceOption[] = [];
    function Probe() {
      seen = useApp().workspaces;
      return null;
    }
    authedUser = { id: 'u_aubin', name: 'Aubin', email: 'aubin@example.com' };
    const { rerender } = render(
      <MemoryRouter><AppProvider><Probe /></AppProvider></MemoryRouter>,
    );
    await waitFor(() => expect(seen).toHaveLength(2));

    // A different person signs in, and their own list cannot be fetched.
    list.mockRejectedValue(new Error('offline'));
    authedUser = { id: 'u_someone_else', name: 'Sam', email: 'sam@example.com' };
    await act(async () => {
      rerender(<MemoryRouter><AppProvider><Probe /></AppProvider></MemoryRouter>);
    });

    await waitFor(() => expect(seen).toHaveLength(0));
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

/* Giving back access you were granted.
 *
 * The only exit used to be asking the owner to remove you, which means
 * someone who has stopped working with a creator carries their workspace
 * around indefinitely. What this pins:
 *   - it is offered to a guest and never to an owner, who has nothing to
 *     leave and whom the server refuses anyway;
 *   - it asks first, naming what will be lost;
 *   - afterwards access is re-resolved and they land Home, because the page
 *     they were on belongs to the workspace they just left.
 */
describe('leaving a workspace you were invited into', () => {
  const joinedAccess: WorkspaceAccess = {
    id: 'w_host', name: 'Host Studio', role: 'member',
    permissions: { editAutomations: true, contactOutreach: false },
    canvasAutomation: null,
  };
  const canvasAccess: WorkspaceAccess = {
    id: 'w_host', name: 'Host Studio', role: 'canvas',
    permissions: { editAutomations: false, contactOutreach: false },
    canvasAutomation: { id: '77', name: 'Welcome DM' },
  };

  async function leaveSetup(access: WorkspaceAccess) {
    const leave = vi.fn().mockResolvedValue(undefined);
    mockUseApp.mockReturnValue(appContext({
      workspaces: [OWN, JOINED], workspaceAccess: access,
      switchToWorkspace, showToast, leaveCurrentWorkspace: leave,
    }));
    render(
      <MemoryRouter initialEntries={['/contacts']}>
        <Routes>
          <Route path="/contacts" element={<AccountMenu />} />
          <Route path="/" element={<p>HOME</p>} />
        </Routes>
      </MemoryRouter>,
    );
    return { leave };
  }

  it('is not offered to an owner — there is nothing to leave', async () => {
    const user = userEvent.setup();
    setup([OWN, JOINED]);
    const menu = await openMenu(user);
    expect(within(menu).queryByRole('menuitem', { name: /^Leave/ })).not.toBeInTheDocument();
  });

  it('names the workspace it would give back, and asks before doing it', async () => {
    const user = userEvent.setup();
    const { leave } = await leaveSetup(joinedAccess);
    const menu = await openMenu(user);

    await user.click(within(menu).getByRole('menuitem', { name: 'Leave Host Studio' }));
    expect(await screen.findByText('Leave Host Studio?')).toBeInTheDocument();
    // Asked, not done: nothing has been given back yet.
    expect(leave).not.toHaveBeenCalled();
  });

  it('a canvas seat is told which automation it loses', async () => {
    const user = userEvent.setup();
    await leaveSetup(canvasAccess);
    const menu = await openMenu(user);

    await user.click(within(menu).getByRole('menuitem', { name: 'Leave Host Studio' }));
    expect(await screen.findByText(/“Welcome DM”/)).toBeInTheDocument();
  });

  it('leaves through the workspace boundary, and lands Home', async () => {
    const user = userEvent.setup();
    const { leave } = await leaveSetup(joinedAccess);
    const menu = await openMenu(user);

    await user.click(within(menu).getByRole('menuitem', { name: 'Leave Host Studio' }));
    await user.click(await screen.findByRole('button', { name: 'Leave' }));

    // Through the context's own crossing — not by calling the endpoint here
    // and re-resolving access alone. Leaving is a workspace change, and the
    // rest of what a workspace change owes (ending the server-state session
    // so the bell and the Inbox badge stop rendering the workspace just
    // left, re-reading the accounts) lives with switching. That is pinned in
    // its own test below, against the real provider.
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('HOME')).toBeInTheDocument();
  });

  it('a refused leave says so and leaves them where they were', async () => {
    const user = userEvent.setup();
    const leave = vi.fn().mockRejectedValue(new Error('The server is busy.'));
    mockUseApp.mockReturnValue(appContext({
      workspaces: [OWN, JOINED], workspaceAccess: joinedAccess,
      switchToWorkspace, showToast, leaveCurrentWorkspace: leave,
    }));
    render(
      <MemoryRouter initialEntries={['/contacts']}>
        <Routes>
          <Route path="/contacts" element={<AccountMenu />} />
          <Route path="/" element={<p>HOME</p>} />
        </Routes>
      </MemoryRouter>,
    );

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Leave Host Studio' }));
    await user.click(await screen.findByRole('button', { name: 'Leave' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('The server is busy.', 'error'));
    expect(screen.queryByText('HOME')).not.toBeInTheDocument();
  });
});
