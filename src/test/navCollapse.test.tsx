import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { render } from './render';
import Layout from '../components/Layout';
import { SIDEBAR_WIDTH, SIDEBAR_RAIL_WIDTH } from '../components/ui/sidebar';
import { navItems } from '../lib/nav';

/* Collapsing the navigation, as a property of the one shell.
 *
 * Populr had this before and lost it, because of where it was built: the
 * automation builder swapped the sidebar for a 60px rail COMPONENT of its
 * own. Two components meant two implementations, they drifted, and the
 * collapse went out with the rail when the shell was unified.
 *
 * It comes back as a width. The same AppSidebar renders at 280 or 72, the
 * control is in the same place on every route, and the choice belongs to the
 * creator rather than to the page they happen to be on. That last part is
 * what these tests are really about — a shell that re-decides its own shape
 * per route is the thing that was wrong, and it would be just as wrong at
 * 72px as it was at 60.
 */

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Creator', email: 'c@example.com' }, signOut: vi.fn() }),
}));
vi.mock('../context/AppContext', () => ({
  useApp: () => ({ showToast: vi.fn(), accounts: [], workspaceAccess: null }),
}));
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, isBackendConfigured: () => false };
});

const ROUTES = ['/', '/automations', '/automations/:flowId', '/inbox', '/contacts', '/settings'];

function mountAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          {ROUTES.map(r => (
            <Route key={r} path={r} element={<div>page stub</div>} />
          ))}
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** The fixed desktop column — the only surface the preference applies to. */
function column(container: HTMLElement): HTMLElement {
  return container.querySelector('aside')!;
}

describe('the navigation collapses to a rail', () => {
  it('is the same column at a second width, not a second column', async () => {
    const user = userEvent.setup();
    const { container } = mountAt('/');
    const aside = column(container);

    // Full: the wordmark, and every destination written out in words.
    expect(aside.style.width).toBe(`${SIDEBAR_WIDTH}px`);
    expect(within(aside).getByText('Populr')).toBeInTheDocument();
    for (const item of navItems) {
      expect(within(aside).getByRole('link', { name: item.label })).toHaveTextContent(item.label);
    }

    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));

    // Rail: the SAME <aside>, narrower. Not a different element — a second
    // element here would be the rail component coming back in disguise.
    expect(column(container)).toBe(aside);
    expect(aside.style.width).toBe(`${SIDEBAR_RAIL_WIDTH}px`);
    // The word can't fit, so the mark stands in for it.
    expect(within(aside).queryByText('Populr')).not.toBeInTheDocument();
    expect(within(aside).getByText('P')).toBeInTheDocument();
  });

  it('loses no destination on the way down', async () => {
    const user = userEvent.setup();
    const { container } = mountAt('/');
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    const aside = column(container);

    // Every primary destination is still there and still reachable BY NAME —
    // but the name is now the accessible one rather than words in the pill,
    // which is the actual difference between the two widths. Written labels
    // surviving into a 72px column is how a rail ends up looking broken.
    for (const item of navItems) {
      const link = within(aside).getByRole('link', { name: item.label });
      expect(link.textContent).not.toContain(item.label);
    }
    // Create survives the rail — collapsing is something a creator does
    // anywhere now, not a builder mode where creating was beside the point —
    // and it loses its word for the same reason the links do.
    const create = within(aside).getByRole('button', { name: 'Create' });
    expect(create.textContent).not.toContain('Create');
  });

  it('the control is one control: it says what the next click does', async () => {
    const user = userEvent.setup();
    mountAt('/');

    const collapse = screen.getByRole('button', { name: 'Collapse navigation' });
    expect(collapse).toHaveAttribute('aria-pressed', 'false');
    await user.click(collapse);

    // Same button, renamed for what it now does — not a second control that
    // appears somewhere else at the other width.
    const expand = screen.getByRole('button', { name: 'Expand navigation' });
    expect(expand).toBe(collapse);
    expect(expand).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Collapse navigation' })).not.toBeInTheDocument();
  });
});

describe('the choice belongs to the creator, not the route', () => {
  it('travels with them from Home into the builder', async () => {
    const user = userEvent.setup();
    const { container, unmount } = mountAt('/');
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(column(container).style.width).toBe(`${SIDEBAR_RAIL_WIDTH}px`);
    unmount();

    // The builder is where the old rail lived, and the one route that used
    // to decide this for itself. It gets the creator's answer like anywhere.
    const builder = mountAt('/automations/flow_1');
    expect(column(builder.container).style.width).toBe(`${SIDEBAR_RAIL_WIDTH}px`);
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeInTheDocument();
  });

  it('outlives the visit', async () => {
    const user = userEvent.setup();
    const first = mountAt('/inbox');
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    first.unmount();

    // A fresh load of the app — the state in memory is gone, and the shell
    // still comes up the shape they left it. Read in a lazy initialiser, so
    // it comes up that way on the FIRST paint rather than snapping a frame
    // later; this asserts the remembering, and the code comment owns the
    // timing.
    const second = mountAt('/inbox');
    expect(column(second.container).style.width).toBe(`${SIDEBAR_RAIL_WIDTH}px`);
  });

  it('and expanding again is remembered just as hard', async () => {
    const user = userEvent.setup();
    const first = mountAt('/');
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    await user.click(screen.getByRole('button', { name: 'Expand navigation' }));
    first.unmount();

    const second = mountAt('/');
    expect(column(second.container).style.width).toBe(`${SIDEBAR_WIDTH}px`);
  });
});

describe('the page column and the navigation agree on one number', () => {
  it('the content starts where the column ends, at either width', async () => {
    const user = userEvent.setup();
    const { container } = mountAt('/');
    const page = container.querySelector('main')!;

    expect(page.style.getPropertyValue('--sidebar-w')).toBe(`${SIDEBAR_WIDTH}px`);
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(page.style.getPropertyValue('--sidebar-w')).toBe(`${SIDEBAR_RAIL_WIDTH}px`);
    // Same number the column is actually wearing — a gap or an overlap here
    // is the whole cost of these being two separate constants.
    expect(page.style.getPropertyValue('--sidebar-w')).toBe(column(container).style.width);
  });
});

describe('the phone drawer is never a rail', () => {
  it('opens full even when the desktop column is collapsed', async () => {
    const user = userEvent.setup();
    mountAt('/');
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const drawer = await screen.findByRole('dialog', { name: 'Main menu' });

    // A drawer the creator deliberately opened has no reason to hide the
    // labels they opened it to read. The preference is the COLUMN's; this
    // surface has its own answer.
    expect(within(drawer).getByText('Populr')).toBeInTheDocument();
    for (const item of navItems) {
      // Not just an accessible name — the words are on screen.
      expect(within(drawer).getByText(item.label)).toBeInTheDocument();
    }
  });
});
