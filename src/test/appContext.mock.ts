import { vi } from 'vitest';
import type { AppContextType } from '../context/AppContext';

/**
 * A complete AppContext value for suites that mock `useApp`.
 *
 * Every suite used to hand-roll its own partial object — `{ showToast }`,
 * `{ showToast, accounts: [] }` — which worked until a component read a field
 * that particular literal happened to omit. Adding one context field then
 * broke twenty unrelated files at once, each with an error naming the field
 * rather than the omission, and the fix was twenty edits that set the same
 * trap again.
 *
 * One factory, spread with whatever the test actually cares about. A new
 * context field lands here and nowhere else.
 *
 * Deliberately NOT a partial type: the return is the real AppContextType, so
 * a field added to the context and forgotten here is a compile error in one
 * file instead of a runtime error in twenty.
 */
export function appContext(overrides: Partial<AppContextType> = {}): AppContextType {
  return {
    connectedPlatforms: [],
    accounts: [],
    accountsLoading: false,
    accountsError: null,
    isLoading: false,
    toasts: [],
    subscriptionModal: null,
    connecting: null,
    workspaceAccess: null,
    workspaces: [],
    beginPlatformConnect: vi.fn(),
    refreshConnectedAccounts: vi.fn(),
    completeOAuthReturn: vi.fn(),
    failOAuthReturn: vi.fn(),
    openSubscriptionModal: vi.fn(),
    closeSubscriptionModal: vi.fn(),
    refreshAccounts: vi.fn(),
    refreshWorkspaceAccess: vi.fn(),
    switchToWorkspace: vi.fn(),
    disconnectAccount: vi.fn(),
    showToast: vi.fn(),
    removeToast: vi.fn(),
    setLoading: vi.fn(),
    ...overrides,
  } as AppContextType;
}
