import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { render } from './render';
import { appContext } from './appContext.mock';
import AccountMenu from '../components/AccountMenu';
import Layout from '../components/Layout';
import { looksInternal, workspaceName } from '../lib/workspaceName';
import type { WorkspaceAccess, WorkspaceOption } from '../lib/api';

/* What a workspace is called.
 *
 * A creator opened the account menu and was offered
 * "populr-user-2L7bMuiolfoUIIr8ogOHicOVosmhmXgd" as somewhere to go, above a
 * "Leave" item naming somebody's email address. Neither is a name. Both are
 * `profiles.name`, which has never been a display name — it holds an internal
 * label on every workspace created since profiles stopped storing the
 * creator's email, and the email itself on everything older.
 *
 * The server now sends a real name. This file is the second line: the same
 * rule applied where the text is painted, because the reason nobody caught
 * this for months is that each surface simply rendered the string it was
 * handed, and a rule that lives only at the source holds only until the next
 * surface is written.
 *
 * What this pins:
 *   - the shapes that are not names, and — just as much — the ones that are;
 *   - the switcher, the sidebar and Leave, none of which may show either;
 *   - Leave stays available regardless of what the workspace is called.
 */

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({ useApp: () => mockUseApp() }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u_aubin', name: 'Aubin', email: 'aubin@example.com' },
    signOut: vi.fn(),
  }),
}));
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, isBackendConfigured: () => false };
});

/** The two values actually in production, and the reported one first. */
const INTERNAL_ID = 'populr-user-2L7bMuiolfoUIIr8ogOHicOVosmhmXgd';
const EMAIL_NAME = 'aubincorinaldiecooper@gmail.com';

describe('what is and is not a workspace name', () => {
  it('rejects the label the backend writes for a new workspace', () => {
    expect(looksInternal(INTERNAL_ID)).toBe(true);
    expect(looksInternal('krew-user-abc123')).toBe(true);
  });

  it('rejects an email address, which is somebody else PII besides', () => {
    expect(looksInternal(EMAIL_NAME)).toBe(true);
  });

  it('rejects an unfamiliar id by its scattered digits', () => {
    // Not tied to a known prefix: the whole lesson here is that the first
    // shape went unnoticed, so the next one should not need a code change.
    expect(looksInternal('Z7xKq2mBvN8pLr4TjW9cD')).toBe(true);
  });

  it('rejects nothing at all', () => {
    expect(looksInternal('')).toBe(true);
    expect(looksInternal('   ')).toBe(true);
    expect(looksInternal(null)).toBe(true);
  });

  it('leaves real names completely alone', () => {
    // A guard that ate these would trade one wrong label for another.
    expect(looksInternal('Krew Default Workspace')).toBe(false);
    expect(looksInternal('Acme')).toBe(false);
    expect(looksInternal('Studio 54')).toBe(false);
    expect(looksInternal('Populr2026')).toBe(false);
  });

  it('does not mistake a long unbroken brand for an id', () => {
    // The first version of this guard was "long, no spaces, mixed case, has a
    // digit", which ate every one of these. Review caught it. A name does not
    // stop being a name at twenty characters, and erasing somebody's own
    // words is the same bug the guard exists to prevent.
    expect(looksInternal('Formula1RacingAcademy')).toBe(false);
    expect(looksInternal('Populr2026Enterprise')).toBe(false);
    expect(looksInternal('Route66Bar7Grill')).toBe(false);
  });

  it('falls back differently for your own workspace than for somebody else’s', () => {
    expect(workspaceName(INTERNAL_ID, { yours: true })).toBe('Your workspace');
    expect(workspaceName(INTERNAL_ID)).toBe('A shared workspace');
    expect(workspaceName('Acme Studio', { yours: true })).toBe('Acme Studio');
  });
});

/* ── the switcher ───────────────────────────────────────────────────────── */

const ownAccess: WorkspaceAccess = {
  id: 'w_own', name: INTERNAL_ID, role: 'owner',
  permissions: { editAutomations: true, contactOutreach: true },
  canvasAutomation: null,
};

const guestAccess: WorkspaceAccess = {
  id: 'w_host', name: EMAIL_NAME, role: 'canvas',
  permissions: { editAutomations: false, contactOutreach: false },
  canvasAutomation: { id: '77', name: 'New automation' },
};

const OWN: WorkspaceOption = {
  id: 'w_own', name: INTERNAL_ID, role: 'owner',
  permissions: { editAutomations: true, contactOutreach: true },
  automation: null, since: '2026-01-01T00:00:00.000Z',
};
const SHARED_CANVAS: WorkspaceOption = {
  id: 'w_host', name: EMAIL_NAME, role: 'canvas',
  permissions: { editAutomations: false, contactOutreach: false },
  automation: { id: '77', name: 'New automation' }, since: '2026-03-01T00:00:00.000Z',
};

function mountMenu(access: WorkspaceAccess) {
  mockUseApp.mockReturnValue(
    appContext({ workspaces: [OWN, SHARED_CANVAS], workspaceAccess: access }),
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

describe('the account menu', () => {
  it('offers your own workspace by a name, not by an id', async () => {
    const user = userEvent.setup();
    mountMenu(ownAccess);
    await user.click(screen.getByRole('button', { name: 'Account menu' }));

    expect(await screen.findByText('Your workspace')).toBeInTheDocument();
    expect(screen.queryByText(INTERNAL_ID)).not.toBeInTheDocument();
  });

  it('never prints an internal id anywhere in the open menu', async () => {
    const user = userEvent.setup();
    mountMenu(guestAccess);
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await screen.findByText('Settings');

    // The blunt version of the assertion, because the reported bug was not
    // one element: it was every element that had been handed this string.
    expect(document.body.textContent ?? '').not.toContain('populr-user-');
    expect(document.body.textContent ?? '').not.toContain(EMAIL_NAME);
  });

  it('names a shared canvas by its automation, as it always did', async () => {
    const user = userEvent.setup();
    mountMenu(guestAccess);
    await user.click(screen.getByRole('button', { name: 'Account menu' }));

    // Unchanged behaviour, pinned here because the fix touches the same line:
    // a canvas grant is one automation, and that is what was shared.
    expect(await screen.findByText('New automation')).toBeInTheDocument();
  });

  it('still offers the way out, and does not put an address in it', async () => {
    const user = userEvent.setup();
    mountMenu(guestAccess);
    await user.click(screen.getByRole('button', { name: 'Account menu' }));

    // Leave used to be gated on the workspace having a non-empty name.
    // Whether somebody can give back access has nothing to do with what the
    // workspace is called, and hiding the exit over a label would be the
    // worst version of this bug.
    const leave = await screen.findByText(/^Leave /);
    expect(leave.textContent).toBe('Leave A shared workspace');
  });
});

/* ── the sidebar ────────────────────────────────────────────────────────── */

describe('the sidebar’s "You’re in" block', () => {
  it('tells a guest where they are without naming a mailbox', async () => {
    mockUseApp.mockReturnValue(appContext({ workspaceAccess: guestAccess }));
    render(
      <MemoryRouter initialEntries={['/contacts']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/contacts" element={<div>page stub</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("You're in")).toBeInTheDocument();
    expect(screen.getByText('A shared workspace')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toContain(EMAIL_NAME);
  });
});
