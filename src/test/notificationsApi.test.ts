import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { markNotificationsRead } from '../lib/api';
import { clearApiAuthToken } from '../lib/authClient';

/* The read receipt's wire format. apiFetch serializes request bodies
 * itself, so the one way to get this wrong — stringifying before handing
 * over — produces a JSON string OF JSON, which the backend parses to a
 * string with no usable id and nothing is ever marked read. Pinned at the
 * fetch boundary, where a component-level mock can't hide it. */

let sentBody: unknown;

beforeEach(() => {
  clearApiAuthToken();
  sentBody = undefined;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/auth/token')) {
      return { ok: true, status: 200, json: async () => ({ token: 'tok-1' }) } as Response;
    }
    if (url.includes('/api/notifications/read')) {
      sentBody = init?.body;
      return { ok: true, status: 200, json: async () => ({ marked: 1 }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearApiAuthToken();
});

describe('markNotificationsRead wire format', () => {
  it('sends single-encoded JSON with the id', async () => {
    await markNotificationsRead('42');
    expect(sentBody).toBe('{"id":"42"}');
  });

  it('mark-all sends an empty object, not a quoted string', async () => {
    await markNotificationsRead();
    expect(sentBody).toBe('{}');
  });
});
