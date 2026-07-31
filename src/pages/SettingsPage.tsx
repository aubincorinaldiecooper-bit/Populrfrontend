import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { resolveIdentity } from '../lib/identity';
import {
  Instagram, Video, Linkedin, Twitter, MessageCircle, Link2, LogOut,
  Trash2, AlertTriangle,
  Loader2, ChevronDown, RefreshCw,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { isBackendConfigured } from '../lib/api';
import type { ConnectedAccount, AccountStatus } from '../lib/api';

const iconMap: Record<string, React.ElementType> = {
  instagram: Instagram, tiktok: Video, linkedin: Linkedin, twitter: Twitter, reddit: MessageCircle,
};

const statusConfig: Record<AccountStatus, { label: string; color: string; bg: string }> = {
  connected: { label: 'Connected', color: 'text-[#059669]', bg: 'bg-[#E0F5E9]' },
  disconnected: { label: 'Disconnected', color: 'text-[#6B6B6B]', bg: 'bg-[#FAFAF8]' },
  reconnect_required: { label: 'Reconnect required', color: 'text-[#DC2626]', bg: 'bg-[#FEE2E2]' },
};

type Tab = 'profile' | 'accounts';

export default function SettingsPage() {
  const {
    accounts, accountsLoading, refreshAccounts, disconnectAccount, beginPlatformConnect,
    showToast,
  } = useApp();
  const { user, signOut } = useAuth();
  const identity = resolveIdentity(user, accounts);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [mobileTabsOpen, setMobileTabsOpen] = useState(false);

  const [disconnectModal, setDisconnectModal] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  /** Ends the Better Auth session (server-side) and clears the frontend's
   * local view. Deliberately does NOT touch:
   *   - onboardingComplete: signing out doesn't undo product setup.
   *   - Connected social accounts / their Zernio-side state: those live
   *     server-side and belong to the user across sessions. Sign-out ≠
   *     "delete my account".
   * The routing itself happens here (not inside AuthContext.signOut) so
   * callers can compose without every one of them owning navigation. */
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sign out failed.', 'error');
    } finally {
      setSigningOut(false);
    }
  };

  // Fetch the authoritative list whenever this tab is opened, not just once
  // on app load — an account connected or disconnected elsewhere (e.g. the
  // Connections page) must show up here without a full page reload.
  useEffect(() => {
    if (activeTab === 'accounts') {
      refreshAccounts();
    }
  }, [activeTab, refreshAccounts]);

  const handleDisconnect = async (id: string) => {
    setDisconnecting(id);
    try {
      await disconnectAccount(id);
      showToast('Account disconnected', 'success');
      setDisconnectModal(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not disconnect this account.', 'error');
    } finally {
      setDisconnecting(null);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'profile', label: 'Account' },
    { key: 'accounts', label: 'Connected Accounts' },
  ];

  const activeLabel = tabs.find(t => t.key === activeTab)?.label || 'Account';
  const connectedAccounts = accounts.filter((a: ConnectedAccount) => a.status === 'connected');
  const backendConfigured = isBackendConfigured();

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto">
      <PageHeader title="Settings" />

      {/* Tabs - Desktop */}
      <div className="hidden md:flex gap-1 mb-6 border-b border-[#E8E4DF]">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-[13px] font-medium transition-all border-b-2 -mb-px ${activeTab === tab.key ? 'border-chartreuse text-[#111111]' : 'border-transparent text-[#6B6B6B] hover:text-[#111111]'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tabs - Mobile dropdown */}
      <div className="md:hidden mb-6 relative">
        <button onClick={() => setMobileTabsOpen(!mobileTabsOpen)}
          className="w-full flex items-center justify-between border border-[#E8E4DF] rounded-xl px-4 py-3 bg-white text-[13px] font-medium text-[#111111]">
          {activeLabel}<ChevronDown size={16} className={`transition-transform ${mobileTabsOpen ? 'rotate-180' : ''}`} />
        </button>
        {mobileTabsOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E8E4DF] rounded-xl shadow-lg z-20 overflow-hidden">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => { setActiveTab(tab.key); setMobileTabsOpen(false); }}
                className={`w-full text-left px-4 py-3 text-[13px] transition-all ${activeTab === tab.key ? 'bg-[#FAFAF8] font-semibold text-[#111111]' : 'text-[#6B6B6B] hover:bg-[#FAFAF8]'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── ACCOUNT TAB ─── */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-[#E8E4DF]">
            <h2 className="font-geist font-semibold text-sm text-[#111111] mb-5">Account</h2>
            <div className="flex items-center gap-4 mb-6">
              {identity.avatarUrl ? (
                <img src={identity.avatarUrl} alt={identity.name} className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-[#FAFAF8] flex items-center justify-center text-lg font-semibold text-[#6B6B6B]">
                  {identity.initials}
                </div>
              )}
              <div>
                <p className="font-geist font-bold text-base text-[#111111]">{identity.name}</p>
                {identity.email && <p className="text-[13px] text-[#6B6B6B]">{identity.email}</p>}
                {identity.handle && <p className="text-[13px] text-[#6B6B6B]">{identity.handle}</p>}
                <p className="text-[11px] text-[#9B9B8F] mt-1">{connectedAccounts.length} platform{connectedAccounts.length === 1 ? '' : 's'} connected</p>
              </div>
            </div>
          </div>

          {/* Connected identities */}
          {connectedAccounts.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-[#E8E4DF]">
              <h2 className="font-geist font-semibold text-sm text-[#111111] mb-4">Connected social identities</h2>
              <div className="flex flex-wrap gap-2">
                {connectedAccounts.map((acc: ConnectedAccount) => {
                  const Icon = iconMap[acc.platform] || Link2;
                  return (
                    <div key={acc.id} className="flex items-center gap-2 bg-[#FAFAF8] rounded-lg px-3 py-2">
                      <Icon size={14} className="text-[#6B6B6B]" />
                      <span className="text-[12px] text-[#111111]">{acc.username ? `@${acc.username}` : acc.display_name || acc.platform}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Session */}
          <div className="bg-white rounded-2xl p-6 border border-[#E8E4DF]">
            <h2 className="font-geist font-semibold text-sm text-[#111111] mb-1">Session</h2>
            <p className="text-[13px] text-[#6B6B6B] mb-4">
              {user?.email
                ? <>Signed in as <span className="font-medium text-[#111111]">{user.email}</span>.</>
                : 'Signed in.'}
            </p>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="inline-flex items-center gap-2 rounded-[10px] border border-[#E8E4DF] px-4 py-2.5 text-[13px] font-semibold text-[#111111] hover:bg-[#FAFAF8] transition-all disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingOut ? (
                <><Loader2 size={14} className="animate-spin" /> Signing out…</>
              ) : (
                <><LogOut size={14} /> Sign out</>
              )}
            </button>
            <p className="text-[11px] text-[#9B9B8F] mt-3">
              Signing out ends your session on this device. It doesn't disconnect your social accounts.
            </p>
          </div>
        </div>
      )}

      {/* ─── CONNECTED ACCOUNTS TAB ─── */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-geist font-semibold text-sm text-[#111111]">Connected accounts</h2>
              <p className="text-[12px] text-[#6B6B6B] mt-0.5">View and manage the accounts Populr can review for engagement.</p>
            </div>
            {accounts.length > 0 && (
              <span className="text-[11px] text-[#9B9B8F]">{connectedAccounts.length} of {accounts.length} connected</span>
            )}
          </div>

          {!backendConfigured && (
            <div className="bg-white rounded-2xl p-6 border border-[#E8E4DF] flex items-start gap-3">
              <AlertTriangle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to a backend yet</p>
                <p className="text-[12px] text-[#6B6B6B] mt-1">Set <code className="bg-[#FAFAF8] px-1 py-0.5 rounded">VITE_API_URL</code> to see real connected accounts here.</p>
              </div>
            </div>
          )}

          {backendConfigured && accountsLoading && (
            <div className="flex items-center justify-center py-12 text-[#6B6B6B]">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading connected accounts...
            </div>
          )}

          {backendConfigured && !accountsLoading && accounts.length === 0 && (
            <div className="bg-white rounded-2xl p-8 border border-[#E8E4DF] text-center">
              <Link2 size={22} className="text-[#9B9B8F] mx-auto mb-3" />
              <p className="text-[14px] font-semibold text-[#111111]">No accounts connected yet</p>
              <p className="text-[12px] text-[#6B6B6B] mt-1.5">Connect Instagram, TikTok, LinkedIn, Twitter, or Reddit from the Connections page.</p>
            </div>
          )}

          {backendConfigured && !accountsLoading && accounts.map((acc: ConnectedAccount) => {
            const Icon = iconMap[acc.platform] || Link2;
            const status = statusConfig[acc.status];
            const isConnected = acc.status === 'connected';
            const needsReconnect = acc.status === 'reconnect_required';
            const isDisconnected = acc.status === 'disconnected';

            return (
              <div key={acc.id} className={`bg-white rounded-2xl border transition-all ${needsReconnect ? 'border-[#FECACA]' : 'border-[#E8E4DF]'}`}>
                <div className="p-5">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#FAFAF8] overflow-hidden">
                      {acc.avatar_url ? (
                        <img src={acc.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Icon size={22} className={isConnected ? 'text-[#111111]' : 'text-[#9B9B8F]'} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14px] font-semibold text-[#111111] capitalize">{acc.platform}</p>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>{status.label}</span>
                      </div>
                      <p className="text-[11px] text-[#6B6B6B] mt-0.5">
                        {acc.username ? `@${acc.username}` : acc.display_name || 'Unknown account'}
                      </p>
                      {needsReconnect && <p className="text-[11px] text-[#DC2626] mt-0.5">Authorization expired — reconnect to keep this account active.</p>}
                      {isDisconnected && <p className="text-[11px] text-[#6B6B6B] mt-0.5">Historical data preserved. New activity will not sync.</p>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                      {isConnected && (
                        <button onClick={() => setDisconnectModal(acc.id)}
                          className="p-2 text-[#9B9B8F] hover:text-[#DC2626] hover:bg-[#FEE2E2] rounded-lg transition-all" title="Disconnect">
                          <Trash2 size={16} />
                        </button>
                      )}
                      {(needsReconnect || isDisconnected) && (
                        <button onClick={() => beginPlatformConnect(acc.platform)}
                          className="flex items-center gap-1.5 border border-[#E8E4DF] text-[#111111] rounded-lg px-3 py-2 text-[12px] font-medium hover:bg-[#FAFAF8] transition-all">
                          <RefreshCw size={14} />Reconnect
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── MODALS ─── */}

      {/* Disconnect Confirmation Modal */}
      {disconnectModal && (() => {
        const acc = accounts.find((a: ConnectedAccount) => a.id === disconnectModal);
        if (!acc) return null;
        const isDisconnecting = disconnecting === disconnectModal;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl w-full max-w-[440px] shadow-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#FEE2E2] flex items-center justify-center">
                  <AlertTriangle size={20} className="text-[#DC2626]" />
                </div>
                <h3 className="font-geist font-bold text-base text-[#111111] capitalize">Disconnect {acc.platform}?</h3>
              </div>
              <div className="bg-[#FAFAF8] rounded-xl p-4 mb-5 space-y-2">
                <p className="text-[12px] text-[#6B6B6B]">Historical opportunities and conversations will <span className="font-semibold text-[#111111]">remain visible</span>.</p>
                <p className="text-[12px] text-[#6B6B6B]">Populr will <span className="font-semibold text-[#DC2626]">stop syncing</span> new engagement from this account.</p>
              </div>
              <div className="flex gap-2.5">
                <button onClick={() => setDisconnectModal(null)} disabled={isDisconnecting}
                  className="flex-1 border border-[#E8E4DF] text-[#111111] rounded-[10px] py-2.5 text-[13px] font-medium hover:bg-[#FAFAF8] transition-all disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={() => handleDisconnect(disconnectModal)} disabled={isDisconnecting}
                  className="flex-1 bg-[#DC2626] text-white rounded-[10px] py-2.5 text-[13px] font-semibold hover:bg-[#B91C1C] transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                  {isDisconnecting && <Loader2 size={14} className="animate-spin" />}
                  {isDisconnecting ? 'Disconnecting...' : 'Disconnect account'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
