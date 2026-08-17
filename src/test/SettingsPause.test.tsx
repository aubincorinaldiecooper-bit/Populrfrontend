import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import SettingsPage from '../pages/SettingsPage';

/* The workspace automation pause switch.
 *
 * This control stops automation for the signed-in creator's own workspace.
 * It used to be backed by a single global row, so one creator flipping it
 * halted automation for everyone — the backend is now per-workspace
 * (populrbackend tests/workspaceSettings.test.ts) and this is the UI over it.
 *
 * What matters here: the switch never shows a state the server didn't
 * confirm, a failed write doesn't leave a lie on screen, and the
 * operator-only platform emergency stop never appears in the creator's
 * Settings. */

const mockFetchWorkspaceSettings = vi.fn();
const mockSetWorkspacePause = vi.fn();
const mockShowToast = vi.fn();

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ showToast: mockShowToast }),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Aubin', email: 'aubin@example.com', image: null },
    signOut: vi.fn(),
  }),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchWorkspaceSettings: () => mockFetchWorkspaceSettings(),
    setWorkspacePause: (paused: boolean) => mockSetWorkspacePause(paused),
    // The Team section lives on the same page; give it a quiet empty team so
    // its own load-error Retry never collides with the pause section's.
    fetchTeam: () => Promise.resolve({ invitations: [], members: [] }),
  };
});

function renderPage() {
  return render(<MemoryRouter><SettingsPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SettingsPage — workspace automation pause', () => {
  it('reflects the fetched state rather than assuming a default', async () => {
    mockFetchWorkspaceSettings.mockResolvedValue({ workspacePause: true, smartRepliesConfigured: true });
    renderPage();

    // Arrives paused, so the affordance is to resume — not to pause again.
    await waitFor(() => expect(screen.getByText('Resume automations')).toBeInTheDocument());
    expect(screen.getByText(/Paused — nothing is being sent automatically/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resume automations/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('pauses through the API and adopts the value the server echoes back', async () => {
    mockFetchWorkspaceSettings.mockResolvedValue({ workspacePause: false, smartRepliesConfigured: true });
    mockSetWorkspacePause.mockResolvedValue(true);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Pause automations')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Pause automations/ }));

    expect(mockSetWorkspacePause).toHaveBeenCalledWith(true);
    await waitFor(() => expect(screen.getByText('Resume automations')).toBeInTheDocument());
    expect(mockShowToast).toHaveBeenCalledWith('Automations paused for this workspace', 'success');
  });

  it('keeps the previous state when the write fails, instead of showing an optimistic lie', async () => {
    mockFetchWorkspaceSettings.mockResolvedValue({ workspacePause: false, smartRepliesConfigured: true });
    mockSetWorkspacePause.mockRejectedValue(new Error('Network unreachable'));
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Pause automations')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Pause automations/ }));

    // Still offering to pause, because pausing did not happen.
    await waitFor(() => expect(screen.getByText('Network unreachable')).toBeInTheDocument());
    expect(screen.getByText('Pause automations')).toBeInTheDocument();
    expect(screen.queryByText('Resume automations')).not.toBeInTheDocument();
  });

  it('surfaces a load failure with a retry rather than a wrong status', async () => {
    mockFetchWorkspaceSettings.mockRejectedValueOnce(new Error('Could not load your automation status.'));
    renderPage();

    await waitFor(() => expect(screen.getByText('Could not load your automation status.')).toBeInTheDocument());
    // Critically, no running/paused claim is made while the truth is unknown.
    expect(screen.queryByText(/Running —/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Paused —/)).not.toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('never exposes the operator-only platform emergency stop', async () => {
    mockFetchWorkspaceSettings.mockResolvedValue({ workspacePause: false, smartRepliesConfigured: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Pause automations')).toBeInTheDocument());
    expect(screen.queryByText(/emergency/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/platform-wide/i)).not.toBeInTheDocument();
    // The copy commits to the scope being this workspace only.
    expect(screen.getByText(/This affects only your workspace/)).toBeInTheDocument();
  });
});
