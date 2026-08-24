import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import IntegrationsPage from '../pages/IntegrationsPage';
import { appContext } from './appContext.mock';
import type { Integration } from '../lib/api';

/* Integrations — the third-party apps surface (Composio).
 *
 * What matters here is that the page never shows a state the server didn't
 * confirm. Connecting leaves the app entirely and comes back through a
 * backend callback, so the two things that can lie to a creator are a
 * failed disconnect that clears the card anyway, and a malformed connect
 * response that navigates them somewhere that isn't a login screen.
 *
 * The status vocabulary is the other half: 'reconnect_required' has to read
 * differently from 'disconnected', or a lapsed Shopify looks like one that
 * was never set up. */

const mockFetchIntegrations = vi.fn();
const mockConnectUrl = vi.fn();
const mockDisconnect = vi.fn();
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
    syncIntegrations: vi.fn(),
  };
});

function integration(over: Partial<Integration> = {}): Integration {
  return {
    slug: 'shopify',
    name: 'Shopify',
    category: 'commerce',
    blurb: 'Look up orders.',
    logoUrl: null,
    status: 'disconnected',
    connectionId: null,
    connectedAt: null,
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

describe('IntegrationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom refuses a real assignment to window.location; the page only ever
    // sets .href, so that one property is made writable for the assertions.
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...window.location, href: 'http://localhost/integrations', origin: 'http://localhost' },
    });
  });

  it('lists the apps the backend offers', async () => {
    mockFetchIntegrations.mockResolvedValue({
      configured: true,
      integrations: [
        integration({ slug: 'googlecalendar', name: 'Google Calendar', category: 'calendar' }),
        integration(),
        integration({ slug: 'calendly', name: 'Calendly', category: 'scheduling' }),
      ],
    });
    renderPage();
    expect(await screen.findByText('Google Calendar')).toBeInTheDocument();
    expect(screen.getByText('Shopify')).toBeInTheDocument();
    expect(screen.getByText('Calendly')).toBeInTheDocument();
  });

  it('says a lapsed connection needs reconnecting, not that it was never connected', async () => {
    mockFetchIntegrations.mockResolvedValue({
      configured: true,
      integrations: [integration({ status: 'reconnect_required', connectionId: 'ca_1' })],
    });
    renderPage();
    expect(await screen.findByText('Needs reconnecting')).toBeInTheDocument();
    expect(screen.queryByText('Not connected')).not.toBeInTheDocument();
    // And offers the action that fixes it.
    expect(screen.getByRole('button', { name: /Reconnect/i })).toBeInTheDocument();
  });

  it('sends the browser to the URL the backend returns, with an allowlisted return address', async () => {
    mockFetchIntegrations.mockResolvedValue({ configured: true, integrations: [integration()] });
    mockConnectUrl.mockResolvedValue('https://auth.composio.dev/hosted/abc');
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Connect' }));
    await waitFor(() => {
      expect(mockConnectUrl).toHaveBeenCalledWith('shopify', 'http://localhost/integrations');
    });
    await waitFor(() => expect(window.location.href).toBe('https://auth.composio.dev/hosted/abc'));
  });

  it('refuses to navigate when the backend answers without a URL', async () => {
    mockFetchIntegrations.mockResolvedValue({ configured: true, integrations: [integration()] });
    // A 200 with no url. Unchecked, this used to assign `undefined` to
    // location.href and drop the creator on /undefined.
    mockConnectUrl.mockResolvedValue(undefined as unknown as string);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    expect(window.location.href).toBe('http://localhost/integrations');
    expect(mockShowToast.mock.calls[0][1]).toBe('error');
  });

  it('keeps an app connected when the revoke fails', async () => {
    mockFetchIntegrations.mockResolvedValue({
      configured: true,
      integrations: [integration({ status: 'connected', connectionId: 'ca_1' })],
    });
    mockDisconnect.mockRejectedValue(new Error('Couldn’t reach that app just now.'));
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    // The question is asked before anything happens.
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect', hidden: false }));

    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    const [, tone] = mockShowToast.mock.calls[mockShowToast.mock.calls.length - 1];
    expect(tone).toBe('error');
    // Still connected on screen — the backend only marks it disconnected
    // once the provider confirms, so clearing the card here would be a lie.
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('explains itself when the deployment has no Composio key instead of offering dead buttons', async () => {
    mockFetchIntegrations.mockResolvedValue({
      configured: false,
      integrations: [integration()],
    });
    renderPage();
    expect(await screen.findByText(/aren['\u2019]t switched on yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect' })).not.toBeInTheDocument();
  });

  it('shows the failure rather than an empty catalog when the list cannot be loaded', async () => {
    mockFetchIntegrations.mockRejectedValue(new Error('Populr is unreachable.'));
    renderPage();
    expect(await screen.findByText(/Couldn['\u2019]t load integrations/i)).toBeInTheDocument();
    expect(screen.getByText('Populr is unreachable.')).toBeInTheDocument();
  });
});
