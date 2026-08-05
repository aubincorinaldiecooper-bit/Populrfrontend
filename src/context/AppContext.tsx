import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { OnboardingPlatform } from '../data';
import { defaultOnboardingPlatforms } from '../data';
import {
  isBackendConfigured, getPlatformConnectUrl, fetchConnectedAccounts,
  syncConnectedAccounts, disconnectAccount as disconnectAccountApi, ApiError,
} from '../lib/api';
import type { ConnectedAccount } from '../lib/api';
import { isOnboardingComplete, markOnboardingComplete, adoptLegacyOnboardingFlag } from '../lib/onboarding';
import { useAuth } from './AuthContext';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AppState {
  // Connected account state
  connectedPlatforms: OnboardingPlatform[];
  // Authoritative connected accounts, straight from the backend (see the
  // Channels page). Empty until refreshAccounts() resolves.
  accounts: ConnectedAccount[];
  accountsLoading: boolean;
  // Set when the last refreshAccounts() call failed — distinct from a
  // successful load that simply found zero accounts, so callers (e.g.
  // a page's empty state) can tell "nothing connected yet" apart
  // from "couldn't check what's connected" instead of conflating them.
  accountsError: string | null;
  // UI
  toasts: Toast[];
  isLoading: boolean;
  // $12/month subscription modal (Zernio 402 -> subscription_required).
  // null = closed. `platform` is remembered so it can be retried once the
  // user returns from checkout.
  subscriptionModal: { platform: string | null } | null;
}

interface AppContextType extends AppState {
  /** Derived from the signed-in user, not stored — see AppProvider. */
  onboardingComplete: boolean;
  completeOnboarding: () => void;
  // Onboarding platform connection
  beginPlatformConnect: (id: string) => void;
  refreshConnectedAccounts: () => Promise<void>;
  completeOAuthReturn: (id: string) => Promise<void>;
  failOAuthReturn: (id: string | undefined) => void;
  openSubscriptionModal: (platform?: string) => void;
  closeSubscriptionModal: () => void;
  // Connected accounts (authoritative, backend-backed)
  refreshAccounts: () => Promise<void>;
  disconnectAccount: (id: string) => Promise<void>;
  // Toast
  showToast: (message: string, type: Toast['type']) => void;
  removeToast: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

const AppContext = createContext<AppContextType | null>(null);

/** Shown when the app can't reach its backend. Deliberately names no env var
 *  — build configuration isn't something a creator can act on. */
const NOT_CONFIGURED_MESSAGE = "Populr can't reach its server right now. Please try again shortly.";

// Verifying a return from Zernio's hosted OAuth (see completeOAuthReturn
// below) is async and keyed by platform id, not by component instance — a
// module-level guard (rather than a ref) is what actually survives React
// StrictMode's mount/unmount/remount of AppProvider without either running
// the same verification twice or losing the guard on remount.
const oauthReturnInFlight = new Set<string>();

const OAUTH_SYNC_MAX_ATTEMPTS = 8;
const OAUTH_SYNC_RETRY_MS = 1000;
export const OAUTH_SYNC_ERROR_MESSAGE =
  'Your account was authorized, but Populr could not finish syncing it. Try again.';
// Deliberately generic: whatever the backend's own error text is (a Zernio
// failure like "Zernio GET /connect/instagram failed with 500", a config
// error, a network blip) is never shown verbatim — only logged to the
// console for debugging. subscription_required never reaches this message;
// it opens the subscription modal instead (see beginPlatformConnect).
function connectionFailedMessage(platformLabel: string): string {
  return `Couldn't connect ${platformLabel}. Populr could not complete the connection. Try again.`;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  // AuthProvider wraps AppProvider (see main.tsx), so the signed-in user is
  // available here — which is what lets the onboarding flag be per-account
  // rather than per-browser.
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Completed during *this* session, before any storage read would reflect
  // it. Merged with the persisted flag below.
  const [justOnboarded, setJustOnboarded] = useState(false);

  const [state, setState] = useState<AppState>({
    connectedPlatforms: defaultOnboardingPlatforms.map(p => ({ ...p })),
    accounts: [],
    accountsLoading: false,
    accountsError: null,
    toasts: [],
    isLoading: false,
    subscriptionModal: null,
  });

  // Derived during render, not stored: the route gate reads this while
  // deciding where to send the user, so a tick where the session has
  // resolved but the flag hasn't would redirect an onboarded creator to
  // /connect and throw away the route they actually opened.
  const onboardingComplete = justOnboarded || isOnboardingComplete(userId);

  // Storage tidy-up only (see adoptLegacyOnboardingFlag) — the read above
  // already honors the legacy key, so this changes nothing on screen.
  useEffect(() => { adoptLegacyOnboardingFlag(userId); }, [userId]);

  // A different account signing in on the same browser must not inherit the
  // previous one's in-session completion.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJustOnboarded(false);
  }, [userId]);

  const completeOnboarding = useCallback(() => {
    markOnboardingComplete(userId);
    setJustOnboarded(true);
  }, [userId]);








  // Authoritative connected accounts — always the backend's own list, never
  // inferred or held only in the frontend, per the "no fake success" rule
  // that governs the rest of this app's real-data surfaces.
  const refreshAccounts = useCallback(async () => {
    if (!isBackendConfigured()) return;
    setState(prev => ({ ...prev, accountsLoading: true, accountsError: null }));
    try {
      const accounts = await fetchConnectedAccounts();
      setState(prev => ({ ...prev, accounts, accountsLoading: false }));
    } catch (err) {
      console.error('[accounts] failed to load connected accounts:', err);
      const message = err instanceof Error && err.message ? err.message : 'Could not load connected accounts.';
      setState(prev => ({ ...prev, accountsLoading: false, accountsError: message }));
    }
  }, []);

  // Disconnect goes through the real backend endpoint and only updates local
  // state once Zernio has actually confirmed the revoke — never optimistic,
  // never hidden/deleted client-side only.
  const disconnectAccount = useCallback(async (id: string) => {
    const updated = await disconnectAccountApi(id);
    setState(prev => ({
      ...prev,
      accounts: prev.accounts.map(a => (a.id === id ? updated : a)),
    }));
  }, []);

  // Campaign management



  // Team management




  // Contact actions





  // Toast
  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = `toast-${Date.now()}`;
    setState(prev => ({ ...prev, toasts: [...prev.toasts, { id, message, type }] }));
    setTimeout(() => {
      setState(prev => ({ ...prev, toasts: prev.toasts.filter(t => t.id !== id) }));
    }, 3000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setState(prev => ({ ...prev, toasts: prev.toasts.filter(t => t.id !== id) }));
  }, []);

  const openSubscriptionModal = useCallback((platform?: string) => {
    setState(prev => ({ ...prev, subscriptionModal: { platform: platform ?? null } }));
  }, []);

  const closeSubscriptionModal = useCallback(() => {
    setState(prev => ({ ...prev, subscriptionModal: null }));
  }, []);

  // Real Instagram/TikTok/YouTube/X connect, backed by the Zernio-powered
  // backend. With no backend configured there is no real connect flow to
  // run, so the card reflects that honestly rather than faking a successful
  // connection with an invented handle.
  const beginPlatformConnect = useCallback((id: string) => {
    if (!isBackendConfigured()) {
      setState(prev => ({
        ...prev,
        connectedPlatforms: prev.connectedPlatforms.map(p =>
          p.id === id
            ? { ...p, status: 'error' as const, errorMessage: NOT_CONFIGURED_MESSAGE }
            : p
        ),
      }));
      return;
    }
    setState(prev => ({
      ...prev,
      connectedPlatforms: prev.connectedPlatforms.map(p =>
        p.id === id ? { ...p, status: 'connecting' as const, errorMessage: undefined } : p
      ),
    }));
    const to = `${window.location.origin}${window.location.pathname}?connected=${id}`;
    getPlatformConnectUrl(id, to)
      .then(url => {
        window.location.href = url;
      })
      .catch(err => {
        console.error(`[connect] failed to start ${id} connect:`, err);
        if (err instanceof ApiError && (err.code === 'subscription_required' || err.status === 402)) {
          // The subscription modal takes over instead — never both an
          // error card and the modal for the same response. Card resets to
          // idle rather than staying stuck mid-"Connecting".
          setState(prev => ({
            ...prev,
            connectedPlatforms: prev.connectedPlatforms.map(p =>
              p.id === id ? { ...p, status: 'idle' as const, errorMessage: undefined } : p
            ),
          }));
          openSubscriptionModal(id);
          return;
        }
        // Persist as a visible "Connection failed" card state rather than
        // silently reverting to idle — a toast alone disappears before the
        // user can act on it. The message is always the fixed, safe copy;
        // whatever the backend actually said is only ever in the console.error
        // above, never rendered.
        const label = defaultOnboardingPlatforms.find(p => p.id === id)?.name ?? id;
        const message = connectionFailedMessage(label);
        setState(prev => ({
          ...prev,
          connectedPlatforms: prev.connectedPlatforms.map(p =>
            p.id === id ? { ...p, status: 'error' as const, errorMessage: message } : p
          ),
        }));
        showToast(message, 'error');
      });
  }, [showToast, openSubscriptionModal]);

  // Pulls real synced accounts from the backend and reflects them onto both
  // the onboarding platform list and the authoritative `accounts` list —
  // used after returning from the OAuth redirect, so both stay derived from
  // the same backend response instead of drifting out of sync.
  const refreshConnectedAccounts = useCallback(() => {
    if (!isBackendConfigured()) return Promise.resolve();
    return fetchConnectedAccounts()
      .then(accounts => {
        setState(prev => ({
          ...prev,
          connectedPlatforms: prev.connectedPlatforms.map(p => {
            const match = accounts.find(a => a.platform === p.id);
            if (!match) return p;
            const handle = match.username ? `@${match.username}` : match.display_name ?? p.handle;
            if (match.status === 'connected') {
              return { ...p, status: 'connected' as const, handle, errorMessage: undefined };
            }
            if (match.status === 'reconnect_required') {
              return { ...p, status: 'reconnect_required' as const, handle, errorMessage: undefined };
            }
            // 'disconnected' — a real past connection the user ended (or one
            // just disconnected through this app). Explicitly transitioned
            // to idle rather than left as whatever it was before, since
            // "reconnecting" is the same "Connect" action either way.
            return { ...p, status: 'idle' as const, errorMessage: undefined };
          }),
          accounts,
        }));
      })
      .catch(err => {
        console.error('[connect] failed to refresh connected accounts:', err);
      });
  }, []);

  // The return trip from Zernio's hosted OAuth only proves the *authorization*
  // step happened — it says nothing about whether the account actually made
  // it into our database, since Zernio's own account list can be eventually
  // consistent and the backend callback's own sync attempt is best-effort
  // from here. This re-verifies for real: it explicitly asks the backend to
  // sync, then polls the authoritative account list (immediate check, then up
  // to 7 more ~1s apart) until a matching, genuinely connected account shows
  // up, or gives up and surfaces a retryable error. The `connected=<platform>`
  // URL marker is never trusted on its own.
  const completeOAuthReturn = useCallback(async (id: string) => {
    if (oauthReturnInFlight.has(id)) return;
    oauthReturnInFlight.add(id);
    try {
      if (!isBackendConfigured()) {
        setState(prev => ({
          ...prev,
          connectedPlatforms: prev.connectedPlatforms.map(p =>
            p.id === id
              ? { ...p, status: 'error' as const, errorMessage: NOT_CONFIGURED_MESSAGE }
              : p
          ),
        }));
        showToast('Populr is not configured — connections are unavailable right now.', 'error');
        return;
      }

      setState(prev => ({
        ...prev,
        connectedPlatforms: prev.connectedPlatforms.map(p =>
          p.id === id ? { ...p, status: 'syncing' as const, errorMessage: undefined } : p
        ),
      }));

      try {
        await syncConnectedAccounts();
      } catch (err) {
        // Best-effort: the OAuth callback already attempted a server-side
        // sync, and the poll below is the real verification, so a failed
        // explicit sync call here doesn't by itself mean the account isn't
        // connected — it might just mean this particular call raced Zernio.
        console.warn(`[connect] explicit sync call failed while verifying ${id}, continuing to poll:`, err);
      }

      for (let attempt = 0; attempt < OAUTH_SYNC_MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) await delay(OAUTH_SYNC_RETRY_MS);

        let accounts: ConnectedAccount[];
        try {
          accounts = await fetchConnectedAccounts();
        } catch (err) {
          console.error(`[connect] failed to fetch accounts while verifying ${id} (attempt ${attempt + 1}):`, err);
          continue;
        }

        const match = accounts.find(a => a.platform === id && a.is_connected === true && a.status === 'connected');
        if (match) {
          setState(prev => ({
            ...prev,
            accounts,
            connectedPlatforms: prev.connectedPlatforms.map(p =>
              p.id === id
                ? {
                    ...p,
                    status: 'connected' as const,
                    handle: match.username ? `@${match.username}` : match.display_name ?? p.handle,
                    errorMessage: undefined,
                  }
                : p
            ),
          }));
          const label = defaultOnboardingPlatforms.find(p => p.id === id)?.name ?? id;
          showToast(`${label} connected.`, 'success');
          return;
        }
      }

      setState(prev => ({
        ...prev,
        connectedPlatforms: prev.connectedPlatforms.map(p =>
          p.id === id ? { ...p, status: 'error' as const, errorMessage: OAUTH_SYNC_ERROR_MESSAGE } : p
        ),
      }));
      showToast(OAUTH_SYNC_ERROR_MESSAGE, 'error');
    } finally {
      oauthReturnInFlight.delete(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast]);

  // The backend's callback already confirmed sync failure (connect_error=
  // account_sync_failed) before redirecting here — no polling needed, this
  // just reflects that known outcome into the platform card.
  const failOAuthReturn = useCallback((id: string | undefined) => {
    if (!id) {
      showToast(OAUTH_SYNC_ERROR_MESSAGE, 'error');
      return;
    }
    setState(prev => ({
      ...prev,
      connectedPlatforms: prev.connectedPlatforms.map(p =>
        p.id === id ? { ...p, status: 'error' as const, errorMessage: OAUTH_SYNC_ERROR_MESSAGE } : p
      ),
    }));
    showToast(OAUTH_SYNC_ERROR_MESSAGE, 'error');
  }, [showToast]);

  // On application load, fetch the authoritative connected-account list —
  // it's server-persisted, not client state, so a fresh tab/browser/session
  // must never show stale or empty data before this resolves.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshAccounts();
  }, [refreshAccounts]);

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading }));
  }, []);

  return (
    <AppContext.Provider value={{
      ...state,
      onboardingComplete,
      completeOnboarding,
      beginPlatformConnect,
      refreshConnectedAccounts,
      completeOAuthReturn,
      failOAuthReturn,
      openSubscriptionModal,
      closeSubscriptionModal,
      refreshAccounts,
      disconnectAccount,
      showToast,
      removeToast,
      setLoading,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
