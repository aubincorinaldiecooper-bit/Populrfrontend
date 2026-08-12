import { describe, it, expect } from 'vitest';
import { ApiError } from '../lib/api';
import { connectFailure } from '../lib/connectErrors';

/* Every non-402 connect failure used to render one sentence — "Couldn't
 * create a connection link just now — copying will retry" — whether the
 * backend had said 502 profile_unavailable, 400 disallowed_return_url, or
 * nothing at all because the network was down.
 *
 * That cost a real incident an entire backend log dump to diagnose: a Zernio
 * profile-name conflict had wedged "Connect another" permanently, and the UI
 * kept telling the creator to retry the one thing that could never work.
 *
 * Two rules hold here. The backend's own text is never rendered — only its
 * stable error CODE is read — and a code we don't recognize degrades to the
 * generic sentence rather than leaking a provider message into the UI. */

describe('connectFailure', () => {
  it('tells a creator to retry a provider hiccup', () => {
    const failure = connectFailure(
      new ApiError('Populr couldn\'t prepare a place', 502, 'profile_unavailable'),
      'Instagram',
    );
    expect(failure.kind).toBe('transient');
    expect(failure.message).toContain('Instagram');
    expect(failure.message).toMatch(/try again/i);
  });

  it('does NOT invite a retry when retrying cannot work', () => {
    for (const code of ['misconfigured', 'disallowed_return_url']) {
      const failure = connectFailure(new ApiError('nope', code === 'misconfigured' ? 500 : 400, code), 'Instagram');
      expect(failure.kind, code).toBe('permanent');
      expect(failure.message, code).toMatch(/support/i);
      expect(failure.message, code).not.toMatch(/try again/i);
    }
  });

  it('says so plainly when the platform simply is not supported', () => {
    const failure = connectFailure(new ApiError('nope', 400, 'unsupported_platform'), 'Threads');
    expect(failure.kind).toBe('permanent');
    expect(failure.message).toContain('Threads');
  });

  it('never renders the backend\'s own words, whatever it sent', () => {
    const leaky = new ApiError(
      'Zernio POST /profiles failed: billingAccountId=bill_secret',
      502,
      'profile_unavailable',
    );
    const { message } = connectFailure(leaky, 'Instagram');
    expect(message).not.toContain('Zernio');
    expect(message).not.toContain('bill_secret');
    expect(message).not.toContain('/profiles');
  });

  it('degrades to the generic sentence for an unknown code or a dead network', () => {
    const unknownCode = connectFailure(new ApiError('?', 503, 'something_new'), 'Instagram');
    expect(unknownCode.kind).toBe('transient');
    expect(unknownCode.message).toMatch(/try again/i);

    // Not an ApiError at all — a fetch that never reached the server.
    const offline = connectFailure(new TypeError('Failed to fetch'), 'Instagram');
    expect(offline.kind).toBe('transient');
    expect(offline.message).toMatch(/try again/i);
  });
});
