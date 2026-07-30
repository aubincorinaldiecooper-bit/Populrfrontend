import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type {
  OnboardingPlatform, Campaign, Broadcast,
  TeamMember, PendingInvitation, TeamRole,
  ContactNote,
} from '../data';
import {
  campaigns as initialCampaigns, broadcasts as initialBroadcasts,
  defaultOnboardingPlatforms, defaultTeamMembers,
  contacts as initialContacts,
} from '../data';
import type { Contact } from '../data';
import {
  isBackendConfigured, getPlatformConnectUrl, fetchConnectedAccounts,
  syncConnectedAccounts, disconnectAccount as disconnectAccountApi, ApiError,
} from '../lib/api';
import type { ConnectedAccount } from '../lib/api';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AppState {
  onboardingComplete: boolean;
  selectedConversationId: string | null;
  selectedContactId: string | null;
  showContactDrawer: boolean;
  smartReply: { text: string; editing: boolean } | null;
  contactDrawerContext: 'inbox' | 'contacts' | 'dashboard' | 'pipeline' | 'analytics' | null;
  // Connected account state
  connectedPlatforms: OnboardingPlatform[];
  selectedAudienceGoal: string;
  // Authoritative connected accounts, straight from the backend (Settings >
  // Connected accounts). Empty until refreshAccounts() resolves.
  accounts: ConnectedAccount[];
  accountsLoading: boolean;
  // Contacts
  contacts: Contact[];
  // Campaign / broadcast
  campaigns: Campaign[];
  broadcasts: Broadcast[];
  // Team
  teamMembers: TeamMember[];
  pendingInvitations: PendingInvitation[];
  // UI
  toasts: Toast[];
  isLoading: boolean;
  // $12/month subscription modal (Zernio 402 -> subscription_required).
  // null = closed. `platform` is remembered so it can be retried once the
  // user returns from checkout.
  subscriptionModal: { platform: string | null } | null;
}

interface AppContextType extends AppState {
  completeOnboarding: () => void;
  selectConversation: (id: string | null) => void;
  selectContact: (id: string | null) => void;
  openContactDrawer: (contactId: string, context?: 'inbox' | 'contacts' | 'dashboard' | 'pipeline' | 'analytics') => void;
  closeContactDrawer: () => void;
  setContactDrawerContext: (ctx: 'inbox' | 'contacts' | 'dashboard' | 'pipeline' | 'analytics' | null) => void;
  setSmartReply: (reply: { text: string; editing: boolean } | null) => void;
  // Onboarding platform connection
  connectPlatform: (id: string) => void;
  beginPlatformConnect: (id: string) => void;
  refreshConnectedAccounts: () => void;
  completeOAuthReturn: (id: string) => Promise<void>;
  failOAuthReturn: (id: string | undefined) => void;
  openSubscriptionModal: (platform?: string) => void;
  closeSubscriptionModal: () => void;
  setSelectedAudienceGoal: (goal: string) => void;
  // Connected accounts (authoritative, backend-backed)
  refreshAccounts: () => Promise<void>;
  disconnectAccount: (id: string) => Promise<void>;
  // Campaign/broadcast
  addCampaign: (campaign: Campaign) => void;
  addBroadcast: (broadcast: Broadcast) => void;
  saveCampaignAsDraft: (campaign: Partial<Campaign>) => void;
  // Team
  inviteTeamMember: (email: string, role: TeamRole) => void;
  revokeInvitation: (id: string) => void;
  changeMemberRole: (id: string, role: TeamRole) => void;
  removeTeamMember: (id: string) => void;
  // Contact actions
  addContactNote: (contactId: string, note: Omit<ContactNote, 'id'>) => void;
  addContactToCampaign: (contactId: string, campaignName: string, stage: string) => void;
  updateContactTags: (contactId: string, tags: string[]) => void;
  mergeContacts: (keepId: string, removeId: string) => void;
  updateContactStage: (contactId: string, stage: string) => void;
  // Toast
  showToast: (message: string, type: Toast['type']) => void;
  removeToast: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

const AppContext = createContext<AppContextType | null>(null);

// Onboarding completion outlives the tab because the OAuth connect flow leaves
// the app entirely and comes back via a full page load. Without this, the
// return trip lands on the marketing page instead of the route that reads
// ?connected= and pulls the freshly linked account. It also delivers the
// intended return experience: a creator who's already connected an account
// lands straight on Opportunities.
const ONBOARDING_STORAGE_KEY = 'populr.onboardingComplete';

function readOnboardingComplete(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
  } catch {
    // Storage can be unavailable (private mode, blocked cookies) — fall back
    // to the pre-onboarding experience rather than breaking the app.
    return false;
  }
}

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
  const [state, setState] = useState<AppState>({
    onboardingComplete: readOnboardingComplete(),
    selectedConversationId: '1',
    selectedContactId: null,
    showContactDrawer: false,
    smartReply: null,
    contactDrawerContext: null,
    connectedPlatforms: defaultOnboardingPlatforms.map(p => ({ ...p })),
    selectedAudienceGoal: '',
    accounts: [],
    accountsLoading: false,
    contacts: initialContacts.map(c => ({ ...c })),
    campaigns: initialCampaigns.map(c => ({ ...c })),
    broadcasts: initialBroadcasts.map(b => ({ ...b })),
    teamMembers: defaultTeamMembers.map(m => ({ ...m })),
    pendingInvitations: [],
    toasts: [],
    isLoading: false,
    subscriptionModal: null,
  });

  const completeOnboarding = useCallback(() => {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch {
      // Non-fatal: the session still proceeds, it just won't survive a reload.
    }
    setState(prev => ({ ...prev, onboardingComplete: true }));
  }, []);

  const selectConversation = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, selectedConversationId: id }));
  }, []);

  const selectContact = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, selectedContactId: id }));
  }, []);

  const openContactDrawer = useCallback((contactId: string, context?: 'inbox' | 'contacts' | 'dashboard' | 'pipeline' | 'analytics') => {
    setState(prev => ({ ...prev, selectedContactId: contactId, showContactDrawer: true, contactDrawerContext: context || null }));
  }, []);

  const closeContactDrawer = useCallback(() => {
    setState(prev => ({ ...prev, showContactDrawer: false, selectedContactId: null, contactDrawerContext: null }));
  }, []);

  const setContactDrawerContext = useCallback((ctx: typeof state.contactDrawerContext) => {
    setState(prev => ({ ...prev, contactDrawerContext: ctx }));
  }, []);

  const setSmartReply = useCallback((reply: { text: string; editing: boolean } | null) => {
    setState(prev => ({ ...prev, smartReply: reply }));
  }, []);

  // No backend configured (VITE_API_URL unset) — there is no real connect
  // flow to run, so this reflects that honestly instead of faking a
  // successful connection with an invented handle. Matches how
  // completeOAuthReturn treats the same "not configured" case.
  const connectPlatform = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      connectedPlatforms: prev.connectedPlatforms.map(p =>
        p.id === id
          ? { ...p, status: 'error' as const, errorMessage: 'Populr is not configured (VITE_API_URL is missing).' }
          : p
      ),
    }));
  }, []);

  const setSelectedAudienceGoal = useCallback((goal: string) => {
    setState(prev => ({ ...prev, selectedAudienceGoal: goal }));
  }, []);

  // Authoritative connected accounts — always the backend's own list, never
  // inferred or held only in the frontend, per the "no fake success" rule
  // that governs the rest of this app's real-data surfaces.
  const refreshAccounts = useCallback(async () => {
    if (!isBackendConfigured()) return;
    setState(prev => ({ ...prev, accountsLoading: true }));
    try {
      const accounts = await fetchConnectedAccounts();
      setState(prev => ({ ...prev, accounts, accountsLoading: false }));
    } catch (err) {
      console.error('[accounts] failed to load connected accounts:', err);
      setState(prev => ({ ...prev, accountsLoading: false }));
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
  const addCampaign = useCallback((campaign: Campaign) => {
    setState(prev => ({ ...prev, campaigns: [...prev.campaigns, campaign] }));
  }, []);

  const addBroadcast = useCallback((broadcast: Broadcast) => {
    setState(prev => ({ ...prev, broadcasts: [...prev.broadcasts, broadcast] }));
  }, []);

  const saveCampaignAsDraft = useCallback((campaign: Partial<Campaign>) => {
    const draft: Campaign = {
      id: `draft-${Date.now()}`,
      name: campaign.name || 'Untitled draft',
      goal: campaign.goal || '',
      trigger: campaign.trigger || '',
      message: campaign.message || '',
      destination: campaign.destination || '',
      status: 'draft',
      discovered: 0,
      engaged: 0,
      interested: 0,
      converted: 0,
      clicks: 0,
      conversions: 0,
      rate: '0%',
      platform: campaign.platform || 'instagram',
      automationStatus: 'none',
      humanHandoffs: 0,
      ...campaign,
    };
    setState(prev => ({ ...prev, campaigns: [...prev.campaigns, draft] }));
  }, []);

  // Team management
  const inviteTeamMember = useCallback((email: string, role: TeamRole) => {
    const invitation: PendingInvitation = {
      id: `inv-${Date.now()}`,
      email,
      role,
      invitedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      status: 'pending',
    };
    setState(prev => ({ ...prev, pendingInvitations: [...prev.pendingInvitations, invitation] }));
  }, []);

  const revokeInvitation = useCallback((id: string) => {
    setState(prev => ({ ...prev, pendingInvitations: prev.pendingInvitations.filter(i => i.id !== id) }));
  }, []);

  const changeMemberRole = useCallback((id: string, role: TeamRole) => {
    setState(prev => ({
      ...prev,
      teamMembers: prev.teamMembers.map(m => m.id === id ? { ...m, role } : m),
    }));
  }, []);

  const removeTeamMember = useCallback((id: string) => {
    setState(prev => ({ ...prev, teamMembers: prev.teamMembers.filter(m => m.id !== id) }));
  }, []);

  // Contact actions
  const addContactNote = useCallback((contactId: string, note: Omit<ContactNote, 'id'>) => {
    const newNote: ContactNote = { ...note, id: `note-${Date.now()}` };
    setState(prev => ({
      ...prev,
      contacts: prev.contacts.map(c =>
        c.id === contactId
          ? { ...c, notes: [...c.notes, newNote] }
          : c
      ),
    }));
  }, []);

  const addContactToCampaign = useCallback((contactId: string, campaignName: string, stage: string) => {
    setState(prev => ({
      ...prev,
      contacts: prev.contacts.map(c =>
        c.id === contactId
          ? { ...c, campaigns: [...c.campaigns, { name: campaignName, stage }] }
          : c
      ),
    }));
  }, []);

  const updateContactTags = useCallback((contactId: string, tags: string[]) => {
    setState(prev => ({
      ...prev,
      contacts: prev.contacts.map(c =>
        c.id === contactId ? { ...c, tags } : c
      ),
    }));
  }, []);

  const mergeContacts = useCallback((keepId: string, removeId: string) => {
    setState(prev => {
      const keep = prev.contacts.find(c => c.id === keepId);
      const remove = prev.contacts.find(c => c.id === removeId);
      if (!keep || !remove) return prev;
      return {
        ...prev,
        contacts: prev.contacts.filter(c => c.id !== removeId).map(c =>
          c.id === keepId
            ? {
                ...c,
                tags: [...new Set([...(c.tags || []), ...(remove.tags || [])])],
                notes: [...c.notes, ...remove.notes],
                campaigns: [...c.campaigns, ...remove.campaigns],
                insights: [...new Set([...c.insights, ...remove.insights])],
              }
            : c
        ),
      };
    });
  }, []);

  const updateContactStage = useCallback((contactId: string, stage: string) => {
    setState(prev => ({
      ...prev,
      contacts: prev.contacts.map(c =>
        c.id === contactId ? { ...c, stage: stage as Contact['stage'] } : c
      ),
    }));
  }, []);

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
  // backend. Falls back to the local simulated connect when no backend is
  // configured (VITE_API_URL unset), so the app still demos standalone.
  const beginPlatformConnect = useCallback((id: string) => {
    if (!isBackendConfigured()) {
      connectPlatform(id);
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
  }, [connectPlatform, showToast, openSubscriptionModal]);

  // Pulls real synced accounts from the backend and reflects them onto both
  // the onboarding platform list and the authoritative `accounts` list —
  // used after returning from the OAuth redirect, so both stay derived from
  // the same backend response instead of drifting out of sync.
  const refreshConnectedAccounts = useCallback(() => {
    if (!isBackendConfigured()) return;
    fetchConnectedAccounts()
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
            // 'disconnected' — a real past connection the user ended.
            // Treated the same as never-connected here: reconnecting is the
            // same "Connect" action either way.
            return p;
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
              ? { ...p, status: 'error' as const, errorMessage: 'Populr is not configured (VITE_API_URL is missing).' }
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
      completeOnboarding,
      selectConversation,
      selectContact,
      openContactDrawer,
      closeContactDrawer,
      setContactDrawerContext,
      setSmartReply,
      connectPlatform,
      beginPlatformConnect,
      refreshConnectedAccounts,
      completeOAuthReturn,
      failOAuthReturn,
      openSubscriptionModal,
      closeSubscriptionModal,
      setSelectedAudienceGoal,
      refreshAccounts,
      disconnectAccount,
      addCampaign,
      addBroadcast,
      saveCampaignAsDraft,
      inviteTeamMember,
      revokeInvitation,
      changeMemberRole,
      removeTeamMember,
      addContactNote,
      addContactToCampaign,
      updateContactTags,
      mergeContacts,
      updateContactStage,
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
