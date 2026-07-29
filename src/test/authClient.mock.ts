import { vi } from 'vitest';

/**
 * Shared vi.mock() for authClient — one place that captures the calls
 * every test file wants to assert on. The exported handles let each test
 * set the getSession() return value, inspect signIn calls, and reset
 * state between tests.
 */
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
}));

export function resetAuthClientMock() {
  authClientMock.getSession.mockReset();
  authClientMock.signIn.social.mockReset();
  authClientMock.signIn.magicLink.mockReset();
  authClientMock.signOut.mockReset();
}
