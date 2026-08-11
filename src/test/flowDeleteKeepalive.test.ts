import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deleteFlow, restoreFlow, pauseFlow } from '../lib/api';
import { clearApiAuthToken } from '../lib/authClient';

/* The delete has to survive the page that sent it.
 *
 * Deleting an automation acts immediately: the row disappears and the toast
 * says "deleted" before the server has answered. An ordinary fetch is bound to
 * its document, so a reload or a closed tab in the moments after the click
 * lets the browser cancel the request — and the automation is back on the way
 * in, with nothing having failed and nothing to report.
 *
 * That is the same failure the old seven-second undo delay caused, through a
 * much smaller door. Raised in review on #84, and correct: a window shrinking
 * is not a window closing. `keepalive` is the browser's contract that the
 * request goes out regardless of what happens to the document.
 *
 * It is deliberately NOT set on everything. A GET whose result nobody will be
 * around to read, or a POST whose outcome the next page re-reads anyway, gains
 * nothing from outliving its document — and keepalive requests share a small
 * per-origin budget. It belongs on the calls the interface has already acted
 * on as though they had succeeded.
 */

let requests: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
  clearApiAuthToken();
  requests = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init: init ?? {} });
    if (url.includes('/api/auth/token')) {
      return { ok: true, status: 200, json: async () => ({ token: 'tok' }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ deleted: true, flow: {}, cancelledRuns: 0 }) } as Response;
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearApiAuthToken();
});

function sent(pathFragment: string) {
  return requests.find(r => r.url.includes(pathFragment) && !r.url.includes('/auth/token'));
}

describe('DELETE /api/flows/:id survives page teardown', () => {
  it('is dispatched with keepalive', async () => {
    await deleteFlow('f1');
    const req = sent('/api/flows/f1');
    expect(req?.init.method).toBe('DELETE');
    expect(req?.init.keepalive).toBe(true);
  });

  it('still carries the Authorization header', async () => {
    // keepalive changes the request's lifetime, not its identity. A delete the
    // backend rejects as anonymous is a delete that did not happen.
    await deleteFlow('f1');
    const headers = sent('/api/flows/f1')?.init.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe('Bearer tok');
  });

  it('is not set on calls whose result the caller waits for', async () => {
    // Restore and pause both report back into a page that is still there, and
    // keepalive requests draw on a small shared per-origin budget. Nothing is
    // gained by spending it here.
    await restoreFlow('f1');
    expect(sent('/api/flows/f1/restore')?.init.keepalive).toBeUndefined();

    requests = [];
    await pauseFlow('f2');
    expect(sent('/api/flows/f2/pause')?.init.keepalive).toBeUndefined();
  });
});
