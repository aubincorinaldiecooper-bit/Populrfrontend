import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { render } from './render';
import AutomationCard from '../components/automations/AutomationCard';
import { appContext } from './appContext.mock';
import type { AutomationFlow, WorkspaceAccess } from '../lib/api';

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({ useApp: () => mockUseApp() }));
vi.mock('../context/CreateAutomationContext', () => ({
  useCreateAutomation: () => ({ beginCreateAutomation: vi.fn(), creatingAutomation: false }),
}));
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchFlows: () => Promise.resolve([]),
  };
});

function accessFor(role: 'owner' | 'member' | 'canvas', editAutomations: boolean): WorkspaceAccess {
  return {
    workspace: { id: 'w_1', name: 'Ada Studio' },
    role,
    permissions: { editAutomations, contactOutreach: false },
    canvasAutomation: role === 'canvas' ? { id: '7', name: 'Welcome DM' } : null,
  } as unknown as WorkspaceAccess;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseApp.mockReturnValue(appContext({ workspaceAccess: accessFor('owner', true) }));
});

/* An automation that more than one person can open should say so.
 *
 * Two observations from a real workspace, one cause: after inviting someone
 * and having them accept, nothing anywhere in the app changed. The
 * automations list looked exactly as it had — no sign that a canvas was
 * shared, no sign of who had last worked on it — and the person who joined
 * saw "No automations yet", which reads as their own empty workspace at the
 * precise moment they are standing in somebody else's.
 *
 * What this file pins:
 *   - the card names who last edited it, and falls back to what it always
 *     said rather than inventing an author;
 *   - "shared with N" is about OTHER people, so alone is silent;
 *   - the empty automations list says something true to whoever is reading
 *     it, which is not the same sentence for an owner and a guest.
 */

const GRAPH = { schemaVersion: 1 as const, nodes: [], edges: [] };

function flow(extra: Partial<AutomationFlow> = {}): AutomationFlow {
  return {
    id: '7',
    name: 'Welcome DM',
    status: 'draft',
    accountId: null,
    platform: null,
    graph: GRAPH as AutomationFlow['graph'],
    version: 1,
    legacyAutomationId: null,
    activatedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
    ...extra,
  };
}

function card(extra: Partial<AutomationFlow> = {}) {
  return render(
    <AutomationCard
      flow={flow(extra)}
      audience={null}
      onOpen={vi.fn()}
      onToggleStatus={vi.fn()}
      onRename={vi.fn()}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onShowAudience={vi.fn()}
    />,
  );
}

describe('the card says who touched it last', () => {
  it('names the person when there is one', () => {
    card({
      lastEditedBy: { name: 'Bo Member', email: 'bo@example.com', avatarUrl: null },
      lastEditedAt: '2026-08-18T00:00:00.000Z',
    });
    // "Updated 4 minutes ago" stopped being enough the moment more than one
    // person could do the updating.
    expect(screen.getByText(/Edited by Bo Member/)).toBeInTheDocument();
  });

  it('says what it always said when nobody is named', () => {
    card({ lastEditedBy: null });
    expect(screen.getByText(/^Updated/)).toBeInTheDocument();
    expect(screen.queryByText(/Edited by/)).not.toBeInTheDocument();
  });

  it('falls back to the address for someone who has never signed in', () => {
    card({
      lastEditedBy: { name: null, email: 'cass@example.com', avatarUrl: null },
      lastEditedAt: '2026-08-18T00:00:00.000Z',
    });
    expect(screen.getByText(/Edited by cass@example.com/)).toBeInTheDocument();
  });
});

describe('the card says who else can open it', () => {
  it('marks a shared automation, and counts people', () => {
    card({ sharedWith: 2 });
    expect(screen.getByText('Shared with 2 others')).toBeInTheDocument();
  });

  it('reads as one person when it is one person', () => {
    card({ sharedWith: 1 });
    expect(screen.getByText('Shared with 1 other')).toBeInTheDocument();
  });

  it('says nothing when the automation is yours alone', () => {
    // A badge on every card in a solo workspace is decoration, and it would
    // make the badge meaningless on the day it mattered.
    card({ sharedWith: 0 });
    expect(screen.queryByText(/Shared with/)).not.toBeInTheDocument();
  });

  it('and says nothing when the server did not report it', () => {
    // Absent is "not reported here", never "nobody" — a card that rendered
    // "shared with 0" from a missing field would be a claim, and a false one.
    card({});
    expect(screen.queryByText(/Shared with/)).not.toBeInTheDocument();
  });
});

/* The empty list, as each side of an invitation reads it.
 *
 * Through the page, not the EmptyState: which sentence appears is the whole
 * behaviour, and a test that rendered the component with a hardcoded title
 * would be asserting its own string.
 */
async function emptyListFor(access: WorkspaceAccess | null) {
  mockUseApp.mockReturnValue(appContext({ workspaceAccess: access }));
  const { default: AutomationsPage } = await import('../pages/AutomationsPage');
  render(<MemoryRouter><AutomationsPage /></MemoryRouter>);
}

describe('an empty automations list', () => {
  it('invites an owner to build', async () => {
    await emptyListFor(accessFor('owner', true));
    expect(await screen.findByText('No automations yet')).toBeInTheDocument();
    // Two of them — the page header's and the empty state's — which is the
    // page as it already was; what matters here is that the offer exists.
    expect(screen.getAllByRole('button', { name: 'New automation' }).length).toBeGreaterThan(0);
  });

  it('tells a guest the truth instead', async () => {
    // A canvas invitee has just accepted an invitation and landed here.
    // "No automations yet" reads as their own empty workspace, which is the
    // wrong conclusion at the exact moment they are standing in someone
    // else's waiting to be given something.
    await emptyListFor(accessFor('canvas', false));
    expect(await screen.findByText('Nothing has been shared with you yet')).toBeInTheDocument();
    expect(screen.queryByText('No automations yet')).not.toBeInTheDocument();
    // And no button offering something the API would refuse.
    expect(screen.queryByRole('button', { name: 'New automation' })).not.toBeInTheDocument();
  });

  it('and a member who was given editing still gets the builder\'s sentence', async () => {
    // They CAN create here — being a guest is not the same as being a
    // spectator, and telling them to wait would be wrong in the other
    // direction.
    await emptyListFor(accessFor('member', true));
    expect(await screen.findByText('No automations yet')).toBeInTheDocument();
  });
});
