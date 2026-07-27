import { createContext, useContext, useState, useCallback } from 'react';
import type {
  OnboardingPlatform, Campaign, Broadcast,
  ConnectedAccount, ConnectedAccountStatus, TeamMember, PendingInvitation, TeamRole, PrivacySettings,
  ContactNote,
} from '../data';
import {
  campaigns as initialCampaigns, broadcasts as initialBroadcasts,
  defaultOnboardingPlatforms, defaultConnectedAccounts, defaultTeamMembers, defaultPrivacySettings,
  contacts as initialContacts,
} from '../data';
import type { Contact } from '../data';
import { isBackendConfigured, getPlatformConnectUrl, fetchConnectedAccounts } from '../lib/api';

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
  unreadCount: number;
  showNotifications: boolean;
  smartReply: { text: string; editing: boolean } | null;
  contactDrawerContext: 'inbox' | 'contacts' | 'dashboard' | 'pipeline' | 'analytics' | null;
  // Connected account state
  connectedPlatforms: OnboardingPlatform[];
  selectedAudienceGoal: string;
  // Rich connected accounts
  connectedAccounts: ConnectedAccount[];
  primaryAccountId: string;
  // Contacts
  contacts: Contact[];
  // Campaign / broadcast
  campaigns: Campaign[];
  broadcasts: Broadcast[];
  // Team
  teamMembers: TeamMember[];
  pendingInvitations: PendingInvitation[];
  // Privacy
  privacySettings: PrivacySettings;
  // UI
  toasts: Toast[];
  isLoading: boolean;
}

interface AppContextType extends AppState {
  completeOnboarding: () => void;
  selectConversation: (id: string | null) => void;
  selectContact: (id: string | null) => void;
  openContactDrawer: (contactId: string, context?: 'inbox' | 'contacts' | 'dashboard' | 'pipeline' | 'analytics') => void;
  closeContactDrawer: () => void;
  setContactDrawerContext: (ctx: 'inbox' | 'contacts' | 'dashboard' | 'pipeline' | 'analytics' | null) => void;
  markConversationRead: (_id: string) => void;
  toggleNotifications: () => void;
  closeNotifications: () => void;
  setSmartReply: (reply: { text: string; editing: boolean } | null) => void;
  // Onboarding platform connection
  connectPlatform: (id: string) => void;
  beginPlatformConnect: (id: string) => void;
  refreshConnectedAccounts: () => void;
  setSelectedAudienceGoal: (goal: string) => void;
  // Connected accounts (rich)
  updateAccountStatus: (id: string, status: ConnectedAccountStatus) => void;
  setPrimaryAccount: (id: string) => void;
  disconnectAccount: (id: string) => void;
  reconnectAccount: (id: string) => void;
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
  // Privacy
  updatePrivacySetting: (key: keyof PrivacySettings, value: boolean | number) => void;
  deleteAudienceData: () => void;
  // Toast
  showToast: (message: string, type: Toast['type']) => void;
  removeToast: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>({
    onboardingComplete: false,
    selectedConversationId: '1',
    selectedContactId: null,
    showContactDrawer: false,
    unreadCount: 3,
    showNotifications: false,
    smartReply: null,
    contactDrawerContext: null,
    connectedPlatforms: defaultOnboardingPlatforms.map(p => ({ ...p })),
    selectedAudienceGoal: '',
    connectedAccounts: defaultConnectedAccounts.map(a => ({ ...a })),
    primaryAccountId: 'ig',
    contacts: initialContacts.map(c => ({ ...c })),
    campaigns: initialCampaigns.map(c => ({ ...c })),
    broadcasts: initialBroadcasts.map(b => ({ ...b })),
    teamMembers: defaultTeamMembers.map(m => ({ ...m })),
    pendingInvitations: [],
    privacySettings: { ...defaultPrivacySettings },
    toasts: [],
    isLoading: false,
  });

  const completeOnboarding = useCallback(() => {
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

  const markConversationRead = useCallback((_id: string) => {
    setState(prev => ({ ...prev, unreadCount: Math.max(0, prev.unreadCount - 1) }));
  }, []);

  const toggleNotifications = useCallback(() => {
    setState(prev => ({ ...prev, showNotifications: !prev.showNotifications }));
  }, []);

  const closeNotifications = useCallback(() => {
    setState(prev => ({ ...prev, showNotifications: false }));
  }, []);

  const setSmartReply = useCallback((reply: { text: string; editing: boolean } | null) => {
    setState(prev => ({ ...prev, smartReply: reply }));
  }, []);

  // Onboarding platform connection
  const connectPlatform = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      connectedPlatforms: prev.connectedPlatforms.map(p =>
        p.id === id ? { ...p, status: 'connecting' as const } : p
      ),
    }));
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        connectedPlatforms: prev.connectedPlatforms.map(p =>
          p.id === id ? { ...p, status: 'connected' as const, handle: p.id === 'instagram' || p.id === 'tiktok' ? '@mayastyle' : p.id === 'youtube' ? 'Maya Chen' : undefined } : p
        ),
      }));
    }, 1200);
  }, []);

  const setSelectedAudienceGoal = useCallback((goal: string) => {
    setState(prev => ({ ...prev, selectedAudienceGoal: goal }));
  }, []);

  // Rich connected accounts
  const updateAccountStatus = useCallback((id: string, status: ConnectedAccountStatus) => {
    setState(prev => ({
      ...prev,
      connectedAccounts: prev.connectedAccounts.map(a => a.id === id ? { ...a, status } : a),
    }));
  }, []);

  const setPrimaryAccount = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      primaryAccountId: id,
      connectedAccounts: prev.connectedAccounts.map(a => ({ ...a, isPrimary: a.id === id })),
    }));
  }, []);

  const disconnectAccount = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      connectedAccounts: prev.connectedAccounts.map(a =>
        a.id === id ? { ...a, status: 'disconnected' as const, isPrimary: a.isPrimary ? false : a.isPrimary } : a
      ),
    }));
  }, []);

  const reconnectAccount = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      connectedAccounts: prev.connectedAccounts.map(a =>
        a.id === id ? { ...a, status: 'connecting' as const } : a
      ),
    }));
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        connectedAccounts: prev.connectedAccounts.map(a =>
          a.id === id ? { ...a, status: 'connected' as const, lastSynced: 'Just now' } : a
        ),
      }));
    }, 1500);
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

  // Privacy
  const updatePrivacySetting = useCallback((key: keyof PrivacySettings, value: boolean | number) => {
    setState(prev => ({
      ...prev,
      privacySettings: { ...prev.privacySettings, [key]: value },
    }));
  }, []);

  const deleteAudienceData = useCallback(() => {
    // In a real app this would clear imported data
    setState(prev => ({ ...prev }));
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

  // Real Instagram/TikTok/YouTube/X connect, backed by the Zernio-powered
  // backend. Falls back to the local simulated connect when no backend is
  // configured (VITE_API_BASE_URL unset), so the app still demos standalone.
  const beginPlatformConnect = useCallback((id: string) => {
    if (!isBackendConfigured()) {
      connectPlatform(id);
      return;
    }
    setState(prev => ({
      ...prev,
      connectedPlatforms: prev.connectedPlatforms.map(p =>
        p.id === id ? { ...p, status: 'connecting' as const } : p
      ),
    }));
    const to = `${window.location.origin}${window.location.pathname}?connected=${id}`;
    getPlatformConnectUrl(id, to)
      .then(url => {
        window.location.href = url;
      })
      .catch(err => {
        console.error(`[connect] failed to start ${id} connect:`, err);
        setState(prev => ({
          ...prev,
          connectedPlatforms: prev.connectedPlatforms.map(p =>
            p.id === id ? { ...p, status: 'idle' as const } : p
          ),
        }));
        showToast(`Couldn't connect ${id} right now. Please try again.`, 'error');
      });
  }, [connectPlatform, showToast]);

  // Pulls real synced accounts from the backend and reflects them onto the
  // onboarding platform list — used after returning from the OAuth redirect.
  const refreshConnectedAccounts = useCallback(() => {
    if (!isBackendConfigured()) return;
    fetchConnectedAccounts()
      .then(accounts => {
        setState(prev => ({
          ...prev,
          connectedPlatforms: prev.connectedPlatforms.map(p => {
            const match = accounts.find(a => a.platform === p.id && a.is_connected);
            if (!match) return p;
            return {
              ...p,
              status: 'connected' as const,
              handle: match.username ? `@${match.username}` : match.display_name ?? p.handle,
            };
          }),
        }));
      })
      .catch(err => {
        console.error('[connect] failed to refresh connected accounts:', err);
      });
  }, []);

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
      markConversationRead,
      toggleNotifications,
      closeNotifications,
      setSmartReply,
      connectPlatform,
      beginPlatformConnect,
      refreshConnectedAccounts,
      setSelectedAudienceGoal,
      updateAccountStatus,
      setPrimaryAccount,
      disconnectAccount,
      reconnectAccount,
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
      updatePrivacySetting,
      deleteAudienceData,
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
