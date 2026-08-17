import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { OnboardingPlatform } from '../data';
import { defaultOnboardingPlatforms } from '../data';
import { connectFailure } from '../lib/connectErrors';
import {
  isBackendConfigured, getPlatformConnectUrl, fetchConnectedAccounts,
  syncConnectedAccounts, disconnectAccount as disconnectAccountApi, ApiError,
  fetchWorkspaceAccess,
} from '../lib/api';
import type { ConnectedAccount, WorkspaceAccess } from '../lib/api';
import { useAuth } from './AuthContext';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  /**
   * An offer to take it back. Undo is only honest if the toast outlives the
   * moment of surprise, so a toast carrying an action gets a longer default
   * life than a plain confirmation.
   */
  action?: { label: string; onClick: () => void };
}

export interface ToastOptions {
  action?: { label: string; onClick: () => void };
  /** Milliseconds on screen. Defaults to 3s, or 7s when there's an action. */
  durationMs?: number;
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
  // Which workspace this account acts in and what it may do there, served by
  // GET /api/me — the same resolution the API enforces. null while unknown
  // (loading, backend unreachable): consumers treat null as "hide nothing",
  // because the majority case is an owner and the API refuses anything a
  // member truly can't do. The chrome catches up when this resolves.
  workspaceAccess: WorkspaceAccess | null;
}

interface AppContextType extends AppState {
  // Onboarding platform connection
  beginPlatformConnect: (id: string) => void;
  refreshConnectedAccounts: () => Promise<void>;
  // opts.accountId narrows verification to one specific account — the one
  // the backend callback said this OAuth return added (account_result=new)
  // or revived (restored). Without it, verification is platform-level, which
  // with multiple accounts on a platform would declare success the moment
  // ANY of them is connected — exactly wrong for "connect another".
  completeOAuthReturn: (id: string, opts?: { accountId?: string; restored?: boolean }) => Promise<void>;
  failOAuthReturn: (id: string | undefined) => void;
  openSubscriptionModal: (platform?: string) => void;
  closeSubscriptionModal: () => void;
  // Connected accounts (authoritative, backend-backed)
  refreshAccounts: () => Promise<void>;
  disconnectAccount: (id: string) => Promise<void>;
  // Toast
  showToast: (message: string, type?: Toast['type'], options?: ToastOptions) => void;
  removeToast: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

const AppContext = createContext<AppContextType | null>(null);

/** Shown when the app can't reach its backend. Deliberately names no env var
 *  — build configuration isn't something a creator can act on. */
const NOT_CONFIGURED_MESSAGE = "Populr can't reach its server right now. Try again in a moment.";

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
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>({
    connectedPlatforms: defaultOnboardingPlatforms.map(p => ({ ...p })),
    accounts: [],
    accountsLoading: false,
    accountsError: null,
    toasts: [],
    isLoading: false,
    subscriptionModal: null,
    workspaceAccess: null,
  });

  const { user } = useAuth();

  // Stale-write guard for the authoritative `accounts` list. Every read takes
  // a monotonically increasing ticket BEFORE it awaits; only the LATEST ISSUED
  // read may touch account state — a read is stale the moment a newer one is
  // issued, whether or not that newer one has resolved (or failed). Comparing
  // against a "last applied" counter instead let an older success land after a
  // newer failure, since a failure never advanced the counter. Without any of
  // this, the app-mount refresh (issued first) could resolve AFTER
  // completeOAuthReturn's verified write and clobber the just-connected
  // account back to its pre-sync snapshot.
  const accountsSeq = useRef(0);
  const isLatestAccountsRead = (seq: number) => seq === accountsSeq.current;
  const applyAccountsWrite = useCallback((seq: number, updater: (prev: AppState) => AppState): boolean => {
    if (seq !== accountsSeq.current) return false;
    setState(updater);
    return true;
  }, []);




  // Authoritative connected accounts — always the backend's own list, never
  // inferred or held only in the frontend, per the "no fake success" rule
  // that governs the rest of this app's real-data surfaces.
  const refreshAccounts = useCallback(async () => {
    if (!isBackendConfigured()) return;
    const seq = ++accountsSeq.current;
    setState(prev => ({ ...prev, accountsLoading: true, accountsError: null }));
    try {
      const accounts = await fetchConnectedAccounts();
      applyAccountsWrite(seq, prev => ({ ...prev, accounts, accountsError: null }));
    } catch (err) {
      console.error('[accounts] failed to load connected accounts:', err);
      const message = err instanceof Error && err.message ? err.message : 'Could not load connected accounts.';
      // Only the latest issued read may surface an error — a stale read's
      // failure must not stamp over a newer read's state.
      if (isLatestAccountsRead(seq)) {
        setState(prev => ({ ...prev, accountsError: message }));
      }
    } finally {
      // Same rule for the spinner: an older read settling must not clear the
      // loading state while a newer read is still pending.
      if (isLatestAccountsRead(seq)) {
        setState(prev => ({ ...prev, accountsLoading: false }));
      }
    }
  }, [applyAccountsWrite]);

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
  const showToast = useCallback((
    message: string,
    type: Toast['type'] = 'info',
    options?: ToastOptions,
  ) => {
    // Date.now() alone collided when two toasts were raised in the same
    // millisecond (deleting a step raises one, the save that follows can raise
    // another), and React then rendered two children with the same key.
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setState(prev => ({
      ...prev,
      toasts: [...prev.toasts, { id, message, type, action: options?.action }],
    }));
    setTimeout(() => {
      setState(prev => ({ ...prev, toasts: prev.toasts.filter(t => t.id !== id) }));
    }, options?.durationMs ?? (options?.action ? 7000 : 3000));
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
        // user can act on it. The backend's own text is still never rendered;
        // only its stable error CODE is read, and the copy for each is
        // Populr's own (see lib/connectErrors). Distinguishing "try again"
        // from "this needs support" is the point: the old single sentence
        // invited a creator to keep retrying a connect that could not succeed
        // until someone changed a setting.
        const label = defaultOnboardingPlatforms.find(p => p.id === id)?.name ?? id;
        const message = connectFailure(err, label).message;
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
    const seq = ++accountsSeq.current;
    return fetchConnectedAccounts()
      .then(accounts => {
        applyAccountsWrite(seq, prev => ({
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
  }, [applyAccountsWrite]);

  // The return trip from Zernio's hosted OAuth only proves the *authorization*
  // step happened — it says nothing about whether the account actually made
  // it into our database, since Zernio's own account list can be eventually
  // consistent and the backend callback's own sync attempt is best-effort
  // from here. This re-verifies for real: it explicitly asks the backend to
  // sync, then polls the authoritative account list (immediate check, then up
  // to 7 more ~1s apart) until a matching, genuinely connected account shows
  // up, or gives up and surfaces a retryable error. The `connected=<platform>`
  // URL marker is never trusted on its own.
  const completeOAuthReturn = useCallback(async (id: string, opts?: { accountId?: string; restored?: boolean }) => {
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

        // Ticket claimed before the read so this verified write outranks any
        // account refresh issued earlier (e.g. the app-mount refresh) that
        // might otherwise resolve later and overwrite it.
        const seq = ++accountsSeq.current;
        let accounts: ConnectedAccount[];
        try {
          accounts = await fetchConnectedAccounts();
        } catch (err) {
          console.error(`[connect] failed to fetch accounts while verifying ${id} (attempt ${attempt + 1}):`, err);
          continue;
        }

        const match = accounts.find(a =>
          opts?.accountId
            ? a.id === opts.accountId && a.is_connected === true && a.status === 'connected'
            : a.platform === id && a.is_connected === true && a.status === 'connected'
        );
        if (match) {
          applyAccountsWrite(seq, prev => ({
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
          // With multiple accounts on one platform, "Instagram connected."
          // no longer says which one — name the account when we can.
          const handle = match.username ? `@${match.username}` : match.display_name;
          showToast(
            opts?.restored
              ? `${handle ?? label} reconnected.`
              : handle
                ? `${handle} connected.`
                : `${label} connected.`,
            'success'
          );
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
  }, [showToast, applyAccountsWrite]);

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

  // Fetch the authoritative connected-account list whenever an authenticated
  // session appears — app load, sign-in, or a session restored after the
  // token exchange. Keyed on the user id (not a bare mount) for two reasons:
  // a mount-only fetch ran once for the SPA's whole lifetime and never
  // recovered if that first call failed or raced the session/token exchange
  // (leaving a real creator's accounts stuck at [] and a false "connect an
  // account" wall); and gating on auth avoids firing the request before
  // there's a session to authorize it. The stale-write guard above keeps a
  // slow earlier fetch from clobbering a newer one.
  const authedUserId = user?.id ?? null;
  useEffect(() => {
    if (!authedUserId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshAccounts();
  }, [authedUserId, refreshAccounts]);

  // The signed-in account's workspace access (owner / member / canvas),
  // loaded once per session. A failure leaves it null — the UI then hides
  // nothing and lets the API be the judge, which is the safe direction.
  useEffect(() => {
    if (!authedUserId || !isBackendConfigured()) return;
    let cancelled = false;
    fetchWorkspaceAccess()
      .then(access => {
        if (!cancelled) setState(prev => ({ ...prev, workspaceAccess: access }));
      })
      .catch(err => console.warn('[access] could not resolve workspace access:', err));
    return () => {
      cancelled = true;
    };
  }, [authedUserId]);

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading }));
  }, []);

  return (
    <AppContext.Provider value={{
      ...state,
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
