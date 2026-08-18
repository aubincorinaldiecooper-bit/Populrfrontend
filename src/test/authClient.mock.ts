import { vi } from 'vitest';

/**
 * Shared vi.mock() for authClient — one place that captures the calls
 * every test file wants to assert on. The exported handles let each test
 * set the getSession() return value, inspect signIn calls, and reset
 * state between tests.
 */
/** The token cache the real module owns; tests assert the session ends. */
export const clearApiAuthTokenMock = vi.fn();
export const getApiAuthTokenMock = vi.fn(async () => null);

export const authClientMock = {
  getSession: vi.fn(),
  signIn: {
    social: vi.fn(),
    magicLink: vi.fn(),
  },
  signOut: vi.fn(),
};

vi.mock('../lib/authClient', () => ({
  authClient: authClientMock,
  clearApiAuthToken: () => clearApiAuthTokenMock(),
  getApiAuthToken: () => getApiAuthTokenMock(),
}));

export function resetAuthClientMock() {
  authClientMock.getSession.mockReset();
  authClientMock.signIn.social.mockReset();
  authClientMock.signIn.magicLink.mockReset();
  authClientMock.signOut.mockReset();
  clearApiAuthTokenMock.mockReset();
  getApiAuthTokenMock.mockReset();
  getApiAuthTokenMock.mockResolvedValue(null);
}
