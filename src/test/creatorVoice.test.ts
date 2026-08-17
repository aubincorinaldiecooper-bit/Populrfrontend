import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GENERIC_ERROR, UNREACHABLE_ERROR, isCreatorSafe } from '../lib/voice';
import { errorMessage } from '../lib/errorCopy';
import { ApiError } from '../lib/api';
// @ts-expect-error — the Tailwind config ships no type declarations; its
// shape is asserted structurally below.
import tailwindConfig from '../../tailwind.config.js';
import pkg from '../../package.json';

/* The line between Populr talking and software talking.
 *
 * Everything a creator reads passed through one of two filters: the backend
 * refuses to serve provider text (utils/creatorVoice there), and the client
 * refuses to render it (lib/voice here). These tests pin the client half —
 * and the one-font system, which is the same promise made visually.
 */

describe('isCreatorSafe', () => {
  it('rejects software talking', () => {
    for (const text of [
      'Zernio POST /messages failed with 500',
      'Failed to process provider request',
      'webhook payload was malformed',
      'endpoint returned 502',
      'API rate limit exceeded',
      'https://api.zernio.dev/messages timed out',
      'Cannot read properties of undefined',
      'error 401',
    ]) {
      expect(isCreatorSafe(text), text).toBe(false);
    }
  });

  it('accepts Populr talking — numbers and platform names included', () => {
    for (const text of [
      'Add your message.',
      "Couldn't finish that. Try again in a moment.",
      'The opening DM is 1042 characters; Instagram allows 500 characters.',
      "X doesn't support automated DMs.",
      'Reconnect this account to keep things running.',
      // The builder's own link problem SAYS "http://" — that's an
      // instruction about typing an address, not software talking, and the
      // bell's link-field phrasing depends on it passing through intact.
      'That link needs to be a full http:// or https:// address.',
    ]) {
      expect(isCreatorSafe(text), text).toBe(true);
    }
  });

  it('rejects empty, missing, and essay-length text', () => {
    expect(isCreatorSafe('')).toBe(false);
    expect(isCreatorSafe(null)).toBe(false);
    expect(isCreatorSafe(undefined)).toBe(false);
    expect(isCreatorSafe('x'.repeat(300))).toBe(false);
  });
});

describe('errorMessage', () => {
  it('maps known codes to approved copy', () => {
    expect(errorMessage(new ApiError('whatever', 502, 'channel_unavailable'))).toBe(GENERIC_ERROR);
    expect(errorMessage(new ApiError('whatever', 402, 'subscription_required'))).toMatch(/subscription/);
  });

  it('passes creator-safe backend sentences through', () => {
    expect(errorMessage(new ApiError('Add your message.', 400))).toBe('Add your message.');
  });

  it('never passes provider text through, whatever constructed the error', () => {
    expect(errorMessage(new Error('Zernio GET /connect failed with 500'))).toBe(GENERIC_ERROR);
  });

  it('turns a dead network into a sentence', () => {
    expect(errorMessage(new TypeError('Failed to fetch'))).toBe(UNREACHABLE_ERROR);
  });
});

describe('the API client refuses to construct software-talking errors', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function callFetchFlows(): Promise<ApiError> {
    const { fetchFlows } = await import('../lib/api');
    try {
      await fetchFlows();
    } catch (err) {
      return err as ApiError;
    }
    throw new Error('expected a throw');
  }

  it('a provider message from an old server becomes the generic sentence', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 502,
      json: async () => ({ error: 'zernio_api_error', message: 'Zernio POST /messages failed with 500' }),
    });
    const err = await callFetchFlows();
    expect(err.message).not.toMatch(/zernio/i);
    expect(err.message).toBe(GENERIC_ERROR);
    // The diagnostic isn't lost — it went to the console for developers.
    expect(console.warn).toHaveBeenCalled();
  });

  it('a body with no message never shows the route path or status', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 500, json: async () => ({}),
    });
    const err = await callFetchFlows();
    expect(err.message).not.toMatch(/api|\/flows|500/i);
  });

  it('a network failure reads like Populr, not like a browser', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await callFetchFlows();
    expect(err.message).toBe(UNREACHABLE_ERROR);
  });

  it('a creator-safe backend message still passes through untouched', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({ error: 'not_ready', message: 'Add your message.' }),
    });
    const err = await callFetchFlows();
    expect(err.message).toBe('Add your message.');
  });
});

describe('one font system', () => {
  const families = (tailwindConfig as { theme: { extend: { fontFamily: Record<string, string[]> } } })
    .theme.extend.fontFamily;

  it('every UI role resolves to Geist; mono roles to GeistMono', () => {
    for (const role of ['sans', 'display', 'body', 'label', 'geist'] as const) {
      expect(families[role]?.[0], role).toBe('Geist');
    }
    for (const role of ['mono', 'geist-mono'] as const) {
      expect(families[role]?.[0], role).toBe('GeistMono');
    }
  });

  it('no second font family ships', () => {
    const all = JSON.stringify(families);
    expect(all).not.toMatch(/Roboto|JetBrains/i);
    const deps = Object.keys((pkg as { dependencies: Record<string, string> }).dependencies);
    expect(deps.filter(d => d.includes('fontsource'))).toEqual([]);
  });
});
