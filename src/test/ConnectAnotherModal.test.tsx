import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../lib/api';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ConnectAnotherModal from '../components/ConnectAnotherModal';

/* The modal must mint exactly one connection link on mount, no matter how
 * often its parent re-renders. The link is single-use server-side; the old
 * code listed the parent's inline `onClose` in mintLink's deps, so the 4s
 * waiting-poll and 3s toast auto-dismiss each re-created mintLink and the
 * prefetch effect minted a brand-new link + Zernio round-trip on every tick. */

const mockGetPlatformConnectUrl = vi.fn();

// Stable identities across renders — the REAL AppContext hands out
// useCallback-stable functions, so the modal's mintLink must not churn on
// them. A fresh vi.fn() per render (the naive mock) would itself defeat the
// guard under test.
const appValue = vi.hoisted(() => ({
  accounts: [{ id: 'ig_1', platform: 'instagram', status: 'connected', is_connected: true }],
  refreshConnectedAccounts: vi.fn().mockResolvedValue(undefined),
  beginPlatformConnect: vi.fn(),
  showToast: vi.fn(),
  openSubscriptionModal: vi.fn(),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, getPlatformConnectUrl: (...a: unknown[]) => mockGetPlatformConnectUrl(...a) };
});

vi.mock('../context/AppContext', () => ({ useApp: () => appValue }));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPlatformConnectUrl.mockResolvedValue('https://oauth.example/one-time');
});

describe('ConnectAnotherModal', () => {
  it('mints the connection link once on mount, not on every parent re-render', async () => {
    // A parent whose identity for `onClose` changes on each render — the exact
    // instability that used to re-fire the mint.
    function Parent({ tick }: { tick: number }) {
      return (
        <ConnectAnotherModal
          platform="instagram"
          platformName="Instagram"
          initialMode="confirm"
          onClose={() => { void tick; }}
        />
      );
    }
    const { rerender } = render(<Parent tick={0} />);
    await waitFor(() => expect(mockGetPlatformConnectUrl).toHaveBeenCalledTimes(1));

    // Several parent re-renders (as the poll/toast timers would cause) …
    rerender(<Parent tick={1} />);
    rerender(<Parent tick={2} />);
    rerender(<Parent tick={3} />);
    await Promise.resolve();

    // …must not mint additional links.
    expect(mockGetPlatformConnectUrl).toHaveBeenCalledTimes(1);
    // The private-window link returns to the public /connect/complete page.
    expect(mockGetPlatformConnectUrl).toHaveBeenCalledWith('instagram', expect.stringMatching(/\/connect\/complete$/));
  });

  it('opens straight into the duplicate outcome with the specified copy', () => {
    render(
      <ConnectAnotherModal platform="instagram" platformName="Instagram" initialMode="duplicate" onClose={() => {}} />,
    );
    expect(screen.getByText(/reused your current login/i)).toBeInTheDocument();
  });

  it('says which failure it was, and whether retrying can help', async () => {
    // A wedged connect (the Zernio profile-name conflict) surfaced as
    // "copying will retry" — advice that could never work, and the reason
    // diagnosing it needed backend logs at all.
    mockGetPlatformConnectUrl.mockRejectedValueOnce(
      new ApiError('anything the server said', 500, 'misconfigured'),
    );
    render(
      <ConnectAnotherModal platform="instagram" platformName="Instagram" initialMode="confirm" onClose={() => {}} />,
    );
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/support/i);
    expect(alert.textContent).not.toMatch(/copying will retry/i);
    // Never the backend's own text.
    expect(alert.textContent).not.toContain('anything the server said');
  });

  it('still offers the retry for a failure a retry can fix', async () => {
    mockGetPlatformConnectUrl.mockRejectedValueOnce(
      new ApiError('busy', 502, 'profile_unavailable'),
    );
    render(
      <ConnectAnotherModal platform="instagram" platformName="Instagram" initialMode="confirm" onClose={() => {}} />,
    );
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/copying will retry/i);
    expect(alert.textContent).toContain('Instagram');
  });

  it('clears the failure once a link is minted again', async () => {
    // Recovery goes through the copy button, which re-mints. Deliberately not
    // through a prop change: mintLink is stable on purpose (the "mint once"
    // guard above), so a re-render must NOT quietly mint a new single-use link.
    mockGetPlatformConnectUrl.mockRejectedValueOnce(new ApiError('busy', 502, 'profile_unavailable'));
    render(
      <ConnectAnotherModal platform="instagram" platformName="Instagram" initialMode="confirm" onClose={() => {}} />,
    );
    await screen.findByRole('alert');
    mockGetPlatformConnectUrl.mockResolvedValue('https://oauth.example/recovered');
    fireEvent.click(screen.getByRole('button', { name: /Copy connection link/ }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
