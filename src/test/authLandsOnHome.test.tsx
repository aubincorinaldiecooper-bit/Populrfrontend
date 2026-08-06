import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import AuthCompletePage from '../pages/AuthCompletePage';

/* The onboarding gate is gone. It lived in per-device localStorage, so a
 * fully set-up creator opening Populr on their phone — a browser that had
 * never seen the flag — was forced back through "connect your channel"
 * even with channels already connected server-side. Signing in now lands
 * on Home (or wherever the user was headed), whose first-run state
 * handles the genuinely-new-creator case without trapping anyone. */

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockUseAuth = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe('auth completion — no onboarding gate', () => {
  it('a signed-in user lands on Home, never /connect — even on a fresh device', async () => {
    // Fresh device: localStorage is empty, exactly the state that used to
    // trigger the gate.
    mockUseAuth.mockReturnValue({
      session: { id: 's1' },
      user: { id: 'creator_1' },
      loading: false,
      refresh: vi.fn(),
    });
    render(<AuthCompletePage />);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    expect(mockNavigate).not.toHaveBeenCalledWith('/connect', expect.anything());
  });

  it('a remembered destination survives the auth bounce', async () => {
    window.sessionStorage.setItem('populr.returnTo', '/contacts');
    mockUseAuth.mockReturnValue({
      session: { id: 's1' },
      user: { id: 'creator_1' },
      loading: false,
      refresh: vi.fn(),
    });
    render(<AuthCompletePage />);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith('/contacts', { replace: true });
  });

  it('a real callback (markers present) with no session → session_failed', async () => {
    window.history.replaceState(null, '', '/auth/complete?code=abc&state=xyz');
    mockUseAuth.mockReturnValue({ session: null, user: null, loading: false, refresh: vi.fn() });
    render(<AuthCompletePage />);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith('/login?error=session_failed', { replace: true });
  });

  it('a specific callback error maps to the accurate LoginPage copy', async () => {
    window.history.replaceState(null, '', '/auth/complete?error=token_expired&error_description=The%20link%20expired');
    mockUseAuth.mockReturnValue({ session: null, user: null, loading: false, refresh: vi.fn() });
    render(<AuthCompletePage />);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    // "expire" wins over "token" — the user sees "that link has expired".
    expect(mockNavigate).toHaveBeenCalledWith('/login?error=expired_link', { replace: true });
  });

  it('a plain signed-out visit (no callback markers) routes to /login WITHOUT a scary error', async () => {
    // A stale tab / bookmark / back-button-after-signout. The user never
    // attempted a sign-in here, so "sign-in failed" would be a lie.
    window.history.replaceState(null, '', '/auth/complete');
    mockUseAuth.mockReturnValue({ session: null, user: null, loading: false, refresh: vi.fn() });
    render(<AuthCompletePage />);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
    expect(mockNavigate).not.toHaveBeenCalledWith('/login?error=session_failed', expect.anything());
  });
});
