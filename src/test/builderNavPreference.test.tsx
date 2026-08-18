import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from './render';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import Layout from '../components/Layout';

/* Who decides how wide the navigation is.
 *
 * The rail earns its place: inside an automation the canvas IS the product,
 * and the full sidebar spends a quarter of a laptop on a Create button you
 * cannot use from there. But deciding it purely from the route made it
 * something the app did TO you — move between two screens and the furniture
 * rearranges, with no way to say you'd rather it didn't.
 *
 * So the route chooses the default and the creator overrides it, once, for
 * good. That is the difference between a journey and a mode.
 */

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Creator', email: 'c@example.com' }, signOut: vi.fn() }),
}));
vi.mock('../context/AppContext', () => ({ useApp: () => ({ showToast: vi.fn(), accounts: [] }) }));

function mountAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/automations" element={<div>list</div>} />
          <Route path="/automations/:flowId" element={<div>builder</div>} />
          <Route path="/contacts" element={<div>contacts</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** The full desktop sidebar is the one carrying the Create button. */
const fullNav = () => screen.queryByRole('button', { name: /collapse navigation/i });
const rail = () => screen.queryByRole('navigation', { name: 'Populr' });

beforeEach(() => { window.localStorage.clear(); });

describe('the route proposes', () => {
  it('collapses inside an automation, where the canvas is the product', async () => {
    mountAt('/automations/flow_1');
    await waitFor(() => expect(rail()).toBeInTheDocument());
  });

  it('but leaves every other screen fully revealed', async () => {
    mountAt('/contacts');
    await waitFor(() => expect(fullNav()).not.toBeInTheDocument());
    expect(rail()).not.toBeInTheDocument();
  });

  it('and the list of automations is not the editor', async () => {
    mountAt('/automations');
    await waitFor(() => expect(rail()).not.toBeInTheDocument());
  });
});

describe('the creator decides', () => {
  it('expands the rail on request', async () => {
    const user = userEvent.setup();
    mountAt('/automations/flow_1');
    await waitFor(() => expect(rail()).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /expand navigation/i }));

    await waitFor(() => expect(rail()).not.toBeInTheDocument());
    expect(fullNav()).toBeInTheDocument();
  });

  it('and the choice outlives the visit', async () => {
    const user = userEvent.setup();
    const first = mountAt('/automations/flow_1');
    await waitFor(() => expect(rail()).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /expand navigation/i }));
    await waitFor(() => expect(rail()).not.toBeInTheDocument());
    first.unmount();

    // Coming back to the same screen must not re-collapse it. A preference
    // that resets on reload is the same surprise, just less often.
    mountAt('/automations/flow_1');
    await waitFor(() => expect(fullNav()).toBeInTheDocument());
    expect(rail()).not.toBeInTheDocument();
  });

  it('and can be given back', async () => {
    const user = userEvent.setup();
    mountAt('/automations/flow_1');
    await waitFor(() => expect(rail()).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /expand navigation/i }));
    await waitFor(() => expect(fullNav()).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /collapse navigation/i }));
    await waitFor(() => expect(rail()).toBeInTheDocument());
  });

  it('collapsing is offered only where it buys something', async () => {
    // On Contacts a narrower nav gains the page nothing, so the control would
    // be a lever whose only effect is to make the app worse.
    mountAt('/contacts');
    await waitFor(() => expect(screen.getByText('contacts')).toBeInTheDocument());
    expect(fullNav()).not.toBeInTheDocument();
  });

  it('survives storage being unavailable', async () => {
    const real = window.localStorage.getItem;
    // Safari private mode throws rather than returning null.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    try {
      mountAt('/automations/flow_1');
      await waitFor(() => expect(rail()).toBeInTheDocument());
    } finally {
      vi.mocked(Storage.prototype.getItem).mockRestore();
      expect(typeof real).toBe('function');
    }
  });
});
