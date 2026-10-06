import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import IntegrationsPage from '../pages/IntegrationsPage';
import { render } from './render';
import { appContext } from './appContext.mock';
import type { Integration, CatalogToolkit } from '../lib/api';

/* Integrations — the third-party apps surface (Composio).
 *
 * The page answers "what have I wired up"; the catalog is over a thousand
 * toolkits and is searched from a modal instead of listed. So the things
 * worth pinning are: the page shows connections rather than a directory,
 * the picker searches and can connect, and neither surface ever shows a
 * state the server didn't confirm.
 *
 * The two ways this can lie to a creator: a failed disconnect that clears
 * the row anyway, and a malformed connect response that navigates them
 * somewhere that isn't a sign-in screen. Both are asserted. */

const mockFetchIntegrations = vi.fn();
const mockConnectUrl = vi.fn();
const mockDisconnect = vi.fn();
const mockSearchCatalog = vi.fn();
const mockShowToast = vi.fn();

vi.mock('../context/AppContext', () => ({
  useApp: () => appContext({ showToast: mockShowToast }),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchIntegrations: () => mockFetchIntegrations(),
    getIntegrationConnectUrl: (slug: string, to: string) => mockConnectUrl(slug, to),
    disconnectIntegration: (id: string) => mockDisconnect(id),
    searchIntegrationCatalog: (q: string, signal?: AbortSignal) => mockSearchCatalog(q, signal),
    syncIntegrations: vi.fn(),
  };
});

function integration(over: Partial<Integration> = {}): Integration {
  return {
    slug: 'shopify',
    name: 'Shopify',
    blurb: 'Look up orders.',
    logoUrl: null,
    status: 'connected',
    connectionId: 'ca_1',
    connectedAt: null,
    ...over,
  };
}

function toolkit(over: Partial<CatalogToolkit> = {}): CatalogToolkit {
  return {
    slug: 'calendly',
    name: 'Calendly',
    blurb: 'Send your booking link.',
    logoUrl: null,
    categories: ['scheduling'],
    connected: false,
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/integrations']}>
      <IntegrationsPage />
    </MemoryRouter>,
  );
}

async function openPicker() {
  const buttons = await screen.findAllByRole('button', { name: /Add a tool/i });
  await userEvent.click(buttons[0]);
}

describe('IntegrationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchCatalog.mockResolvedValue([]);
    // jsdom refuses a real assignment to window.location; the page only ever
    // sets .href, so that one property is made writable for the assertions.
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...window.location, href: 'http://localhost/integrations', origin: 'http://localhost' },
    });
  });

  it('lists what the workspace has connected, not a catalogue of what it could', async () => {
    mockFetchIntegrations.mockResolvedValue({
      configured: true,
      integrations: [integration(), integration({ slug: 'gmail', name: 'Gmail', connectionId: 'ca_2' })],
    });
    renderPage();
    expect(await screen.findByText('Shopify')).toBeInTheDocument();
    expect(screen.getByText('Gmail')).toBeInTheDocument();
    // The old page counted "1 of 8 connected" against a fixed catalogue.
    expect(screen.queryByText(/of \d+ connected/)).not.toBeInTheDocument();
  });

  it('points a workspace with nothing connected at what tools are for', async () => {
    mockFetchIntegrations.mockResolvedValue({ configured: true, integrations: [] });
    renderPage();
    expect(await screen.findByText(/No tools connected yet/i)).toBeInTheDocument();
    expect(screen.getByText(/inside an automation/i)).toBeInTheDocument();
  });

  it('says a lapsed connection needs reconnecting, not that it was never connected', async () => {
    mockFetchIntegrations.mockResolvedValue({
      configured: true,
      integrations: [integration({ status: 'reconnect_required' })],
    });
    renderPage();
    expect(await screen.findByText('Needs reconnecting')).toBeInTheDocument();
    expect(screen.getByText(/Shopify stopped working/)).toBeInTheDocument();
    expect(screen.getByText(/Reconnect it so your automations keep running/)).toBeInTheDocument();
    expect(screen.getByText('1 tool · 1 needs attention')).toBeInTheDocument();
    expect(screen.queryByText('Not connected')).not.toBeInTheDocument();
  });

  it('searches the catalogue from the picker and connects the chosen app', async () => {
    mockFetchIntegrations.mockResolvedValue({ configured: true, integrations: [] });
    mockSearchCatalog.mockResolvedValue([toolkit()]);
    mockConnectUrl.mockResolvedValue('https://auth.composio.dev/hosted/abc');
    renderPage();

    await openPicker();
    expect(screen.getByRole('heading', { name: 'Add a tool' })).toBeInTheDocument();
    expect(screen.getByText('Pick an app and sign in. Your automations can then use it.')).toBeInTheDocument();
    expect(await screen.findByText('Calendly')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => {
      expect(mockConnectUrl).toHaveBeenCalledWith('calendly', 'http://localhost/integrations');
    });
    await waitFor(() => expect(window.location.href).toBe('https://auth.composio.dev/hosted/abc'));
  });

  it('offers no duplicate Connect for an app the workspace already has', async () => {
    mockFetchIntegrations.mockResolvedValue({ configured: true, integrations: [] });
    mockSearchCatalog.mockResolvedValue([toolkit({ connected: true })]);
    renderPage();
    await openPicker();
    expect(await screen.findByText('Calendly')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect' })).not.toBeInTheDocument();
  });

  it('refuses to navigate when the backend answers a connect without a URL', async () => {
    mockFetchIntegrations.mockResolvedValue({ configured: true, integrations: [] });
    mockSearchCatalog.mockResolvedValue([toolkit()]);
    // A 200 with no url. Unchecked, this assigns `undefined` to
    // location.href and drops the creator on /undefined.
    mockConnectUrl.mockResolvedValue(undefined as unknown as string);
    renderPage();

    await openPicker();
    await userEvent.click(await screen.findByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    expect(window.location.href).toBe('http://localhost/integrations');
    expect(mockShowToast.mock.calls[0][1]).toBe('error');
  });

  it('keeps an app connected when the revoke fails', async () => {
    mockFetchIntegrations.mockResolvedValue({ configured: true, integrations: [integration()] });
    mockDisconnect.mockRejectedValue(new Error('Couldn’t reach that app just now.'));
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'More actions for Shopify' }));
    expect(await screen.findByRole('menuitem', { name: 'Reconnect' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Disconnect' }));
    // The question is asked before anything happens; confirm it.
    const confirms = await screen.findAllByRole('button', { name: 'Disconnect' });
    await userEvent.click(confirms[confirms.length - 1]);

    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    const [, tone] = mockShowToast.mock.calls[mockShowToast.mock.calls.length - 1];
    expect(tone).toBe('error');
    // Still connected on screen — the backend only marks it disconnected
    // once the provider confirms, so clearing the row here would be a lie.
    expect(screen.getAllByText('Connected').length).toBeGreaterThan(0);
  });

  it('offers no Disconnect for an app that is already disconnected', async () => {
    mockFetchIntegrations.mockResolvedValue({
      configured: true,
      integrations: [integration({ status: 'disconnected' })],
    });
    renderPage();
    expect(await screen.findByText('Shopify')).toBeInTheDocument();
    // Reconnect is the way back; asking a destructive question about a grant
    // that is already gone would fail at the provider for no reason.
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
  });

  it('explains itself when the deployment has no Composio key instead of offering dead buttons', async () => {
    mockFetchIntegrations.mockResolvedValue({ configured: false, integrations: [] });
    renderPage();
    expect(await screen.findByText(/aren['’]t switched on yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a tool/i })).not.toBeInTheDocument();
  });

  it('shows the failure rather than an empty list when tools cannot be loaded', async () => {
    mockFetchIntegrations.mockRejectedValue(new Error('Populr is unreachable.'));
    renderPage();
    expect(await screen.findByText(/Couldn['’]t load your tools/i)).toBeInTheDocument();
    expect(screen.getByText('Populr is unreachable.')).toBeInTheDocument();
  });

  it('filters catalog results by category and resets to All when the query changes', async () => {
    mockFetchIntegrations.mockResolvedValue({ configured: true, integrations: [] });
    mockSearchCatalog.mockResolvedValue([
      toolkit({ name: 'Calendly', categories: ['scheduling'] }),
      toolkit({ slug: 'shopify', name: 'Shopify', categories: ['ecommerce'] }),
    ]);
    const user = userEvent.setup();
    renderPage();
    await openPicker();
    await screen.findByText('Calendly');
    expect(screen.getByRole('button', { name: 'Scheduling' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ecommerce' }));

    expect(screen.getByText('Shopify')).toBeInTheDocument();
    expect(screen.queryByText('Calendly')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ecommerce' })).toHaveAttribute('aria-pressed', 'true');

    await user.type(screen.getByRole('textbox', { name: 'Search apps' }), 'calendar');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('lists connections in a simple table with the existing actions', async () => {
    mockFetchIntegrations.mockResolvedValue({
      configured: true,
      integrations: [
        integration({ connectedAt: '2025-09-15T12:00:00.000Z' }),
        integration({
          slug: 'notion',
          name: 'Notion',
          status: 'reconnect_required',
          connectionId: 'ca_2',
        }),
      ],
    });
    renderPage();

    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Tool' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Connected' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('Sep 15')).toBeInTheDocument();
    expect(screen.queryByText('What Populr can do')).not.toBeInTheDocument();
    expect(screen.queryByText('Used in')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions for Shopify' })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
  });

  it('summarizes multiple broken tools without naming automations', async () => {
    mockFetchIntegrations.mockResolvedValue({
      configured: true,
      integrations: [
        integration({ status: 'reconnect_required' }),
        integration({ slug: 'notion', name: 'Notion', status: 'reconnect_required', connectionId: 'ca_2' }),
      ],
    });
    renderPage();

    expect(await screen.findAllByText(/2 tools stopped working/)).toHaveLength(2);
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('button', { name: 'Reconnect' })).toHaveLength(2);
    expect(screen.queryByText(/Free guide DM/)).not.toBeInTheDocument();
  });
});
