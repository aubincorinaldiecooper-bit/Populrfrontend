import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { render } from './render';
import CommandMenu from '../components/app/CommandMenu';
import type { AutomationFlow } from '../lib/api';

const mockFetchFlows = vi.fn();
const mockFetchContacts = vi.fn();
const mockBeginCreateAutomation = vi.fn();

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ workspaceAccess: null }),
}));

vi.mock('../context/CreateAutomationContext', () => ({
  useCreateAutomation: () => ({ beginCreateAutomation: mockBeginCreateAutomation }),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchFlows: () => mockFetchFlows(),
    fetchContacts: (filter: unknown) => mockFetchContacts(filter),
  };
});

function flow(id: string, name: string): AutomationFlow {
  return {
    id,
    name,
    status: 'live',
    accountId: null,
    platform: 'instagram',
    graph: { schemaVersion: 1, nodes: [], edges: [] },
    version: 1,
    legacyAutomationId: null,
    activatedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function FlowRoute() {
  const { flowId } = useParams();
  return <p>FLOW {flowId}</p>;
}

describe('CommandMenu', () => {
  it('opens with Ctrl+K, filters automations, and navigates on Enter', async () => {
    mockFetchFlows.mockResolvedValue([
      flow('f1', 'Free guide DM'),
      flow('f2', 'Booking reminders'),
    ]);
    mockFetchContacts.mockResolvedValue({ contacts: [], total: 0 });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <CommandMenu />
        <Routes>
          <Route path="/automations/:flowId" element={<FlowRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.keyboard('{Control>}k{/Control}');
    await screen.findByRole('dialog', { name: 'Search Populr' });
    const input = screen.getByRole('combobox', { name: 'Search' });
    await user.type(input, 'free');

    expect(await screen.findByRole('option', { name: /Free guide DM/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Booking reminders/ })).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('FLOW f1')).toBeInTheDocument();
  });
});
