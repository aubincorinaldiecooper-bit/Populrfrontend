import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from './render';
import { MemoryRouter, Route, Routes } from 'react-router';
import Layout from '../components/Layout';
import { HeaderLocal, HeaderActions } from '../components/app/headerSlots';
import { navItems } from '../lib/nav';

/* The content changes. The product shell does not.
 *
 * Populr used to bend this rule in one place: the automation builder swapped
 * the 280px sidebar for a 60px icon rail and rendered a header of its own.
 * Two navigations and two headers meant two implementations, and they
 * drifted — palette, icon metrics, badge treatment, focus ring — until the
 * product visibly changed shape when a creator opened an automation.
 *
 * These tests pin the rule at the shell itself: every authenticated route
 * gets the same sidebar and the same header, the builder included, and a
 * page that needs controls in the header puts them into the shell's slots
 * rather than growing a bar of its own.
 *
 * The sidebar collapses to a rail, and that is a width rather than a mode —
 * so it is held to the same rule: offered on EVERY route, from the same
 * control, and what a creator chooses on one page is what they get on the
 * next. A collapse that existed only in the builder is what produced the
 * second component in the first place.
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

/** Every kind of place the app has, the builder deliberately among them. */
const ROUTES = [
  { path: '/', name: 'Home' },
  { path: '/automations', name: 'the Automations list' },
  { path: '/automations/flow_1', name: 'the builder' },
  { path: '/inbox', name: 'Inbox' },
  { path: '/contacts', name: 'Contacts' },
  { path: '/channels', name: 'Channels' },
  { path: '/team', name: 'Team' },
  { path: '/settings', name: 'Settings' },
];

function mountAt(path: string, page: React.ReactNode = <div>page stub</div>) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          {ROUTES.map(r => (
            <Route key={r.path} path={r.path === '/automations/flow_1' ? '/automations/:flowId' : r.path} element={page} />
          ))}
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** The full sidebar, recognised by what only it carries. */
function expectFullSidebar() {
  // The brand block and the Create CTA — the things the old rail dropped.
  expect(screen.getAllByText('Populr').length).toBeGreaterThan(0);
  expect(screen.getAllByRole('button', { name: 'Create' }).length).toBeGreaterThan(0);
  // Every primary destination, by name — an icon-only rail can't pass this.
  for (const item of navItems) {
    expect(screen.getAllByRole('link', { name: item.label }).length).toBeGreaterThan(0);
  }
}

describe('one shell on every route', () => {
  for (const route of ROUTES) {
    it(`${route.name} gets the same sidebar and the same header`, () => {
      const { container } = mountAt(route.path);

      expectFullSidebar();
      // No separate icon-rail COMPONENT — the builder's old 60px navigation
      // is gone for good. The rail that exists now is this same sidebar at
      // its other width.
      expect(screen.queryByRole('navigation', { name: 'Populr' })).not.toBeInTheDocument();
      // And the collapse control is on every route, never just some of them.
      expect(screen.getByRole('button', { name: 'Collapse navigation' })).toBeInTheDocument();

      // Exactly one header, whatever the page. Two stacked bars was the
      // builder's old phone experience.
      expect(container.querySelectorAll('header').length).toBe(1);
      // Carrying the global cluster in its corner — same corner everywhere.
      const header = container.querySelector('header')!;
      expect(within(header as HTMLElement).getByRole('button', { name: /^Notifications/ }))
        .toBeInTheDocument();
    });
  }

  it("a page's header content renders inside the shell's header, not a second bar", () => {
    const { container } = mountAt(
      '/automations/flow_1',
      <div>
        <HeaderLocal>
          <span>Welcome DM breadcrumb</span>
        </HeaderLocal>
        <HeaderActions>
          <button type="button">Activate</button>
        </HeaderActions>
        canvas stub
      </div>,
    );

    const header = container.querySelector('header')!;
    // The page's words and controls landed IN the shell's one header…
    expect(within(header as HTMLElement).getByText('Welcome DM breadcrumb')).toBeInTheDocument();
    expect(within(header as HTMLElement).getByRole('button', { name: 'Activate' }))
      .toBeInTheDocument();
    // …which is still the only header there is.
    expect(container.querySelectorAll('header').length).toBe(1);
  });

  it('the slots survive without the shell, so a page still works standalone', () => {
    // Most of the test suite mounts pages without Layout; a control must not
    // vanish because the header it usually sits in was not there.
    render(
      <MemoryRouter>
        <HeaderActions>
          <button type="button">Activate</button>
        </HeaderActions>
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Activate' })).toBeInTheDocument();
  });
});
