import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ConnectCompletePage from '../pages/ConnectCompletePage';

/* The public landing page for connection links opened in a private window.
 * That window has no Populr session, so this page must render the callback
 * outcome without auth — and without leaking anything: no account data, no
 * workspace/vendor identifiers, only the one-shot outcome markers. */

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ConnectCompletePage />
    </MemoryRouter>,
  );
}

describe('ConnectCompletePage', () => {
  it('a successful callback tells the user to return to their Populr window', () => {
    renderAt('/connect/complete?connected=instagram&sync=success&account_result=new&account=zern_acct_123');
    expect(screen.getByText('Account connected')).toBeInTheDocument();
    expect(screen.getByText(/Back in your Populr window/)).toBeInTheDocument();
    // Vendor/internal identifiers from the callback markers are never rendered.
    expect(document.body.textContent).not.toContain('zern_acct_123');
  });

  it('account_result=existing is a duplicate outcome, never "Account connected"', () => {
    // The private window's login can authorize the account the workspace
    // already had. Declaring success here would leave the signed-in window
    // waiting for an account that never arrives.
    renderAt('/connect/complete?connected=instagram&sync=success&account_result=existing');
    expect(screen.queryByText('Account connected')).not.toBeInTheDocument();
    expect(screen.getByText(/already connected/)).toBeInTheDocument();
    expect(screen.getByText(/Sign into the other account in this\s+window/)).toBeInTheDocument();
  });

  it('a failed callback says the link is spent and to copy a fresh one', () => {
    renderAt('/connect/complete?connect_error=account_sync_failed&platform=instagram');
    expect(screen.getByText(/didn't finish/)).toBeInTheDocument();
    expect(screen.getByText(/copy a\s+fresh link/)).toBeInTheDocument();
  });

  it('subscription_required is surfaced as its own outcome', () => {
    renderAt('/connect/complete?connect_error=subscription_required&platform=instagram');
    expect(screen.getByText('Subscription needed')).toBeInTheDocument();
    expect(screen.getByText(/subscription is required/)).toBeInTheDocument();
  });

  it('with no markers at all it does not claim success', () => {
    renderAt('/connect/complete');
    expect(screen.queryByText('Account connected')).not.toBeInTheDocument();
  });
});
