import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { resolveIdentity } from '../lib/identity';
import {
  Instagram, Video, Linkedin, Twitter, MessageCircle, Link2, LogOut,
  Trash2, RefreshCw, Loader2,
} from 'lucide-react';
import { isBackendConfigured } from '../lib/api';
import type { AccountStatus, ConnectedAccount } from '../lib/api';

const iconMap: Record<string, React.ElementType> = {
  instagram: Instagram, tiktok: Video, linkedin: Linkedin, twitter: Twitter, reddit: MessageCircle,
};

const ACCOUNT_STATUS_META: Record<AccountStatus, { label: string; chip: string }> = {
  connected: { label: 'Connected', chip: 'bg-[#e3f6ec] text-[#046c4e]' },
  disconnected: { label: 'Disconnected', chip: 'bg-surface-container-high text-on-surface-variant' },
  reconnect_required: { label: 'Reconnect required', chip: 'bg-error-container text-on-error-container' },
};

const card = 'bg-surface-container-lowest border border-outline-variant rounded-xl';
const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-outline-variant text-primary px-4 py-2 text-body-md font-medium hover:bg-surface-container-high transition-colors disabled:opacity-50';
const ghostBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-body-md font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-50';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function initialsFrom(name: string): string {
  const s = name.trim();
  if (!s) return '?';
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type SettingsTab = 'profile' | 'accounts';

export default function SettingsPage() {
  const {
    accounts, accountsLoading, refreshAccounts, disconnectAccount, beginPlatformConnect,
    showToast,
  } = useApp();
  const { user, signOut } = useAuth();
  const identity = resolveIdentity(user, accounts);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [disconnectModal, setDisconnectModal] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  /** Ends the Better Auth session (server-side) and clears the frontend's
   * local view. Deliberately does NOT touch onboardingComplete or the
   * connected social accounts — sign-out ≠ "delete my account". Routing lives
   * here (not in AuthContext.signOut) so callers compose without each owning
   * navigation. */
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

  // Fetch the authoritative list whenever this tab is opened — an account
  // connected or disconnected elsewhere must show up here without a reload.
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

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'profile', label: 'Account' },
    { key: 'accounts', label: 'Connected Accounts' },
  ];

  const connectedAccounts = accounts.filter((a: ConnectedAccount) => a.status === 'connected');
  const backendConfigured = isBackendConfigured();

  const disconnectTarget = disconnectModal ? accounts.find((a: ConnectedAccount) => a.id === disconnectModal) : undefined;
  const isDisconnecting = disconnectModal !== null && disconnecting === disconnectModal;

  return (
    <div className="px-container-padding-mobile md:px-container-padding-desktop py-8 md:py-10 max-w-[900px] mx-auto pb-24">
      <h1 className="font-display text-headline-md md:text-display-lg-mobile text-on-surface mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-container rounded-full w-fit mb-7">
        {tabs.map(tab => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-2 text-body-md font-medium transition-colors ${active ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: [0.24, 1, 0.4, 1] }}
        >
          {/* ─── ACCOUNT TAB ─── */}
          {activeTab === 'profile' && (
            <div className="space-y-5">
              <div className={`${card} p-6`}>
                <h2 className="font-display text-headline-md text-on-surface mb-5">Account</h2>
                <div className="flex items-center gap-4">
                  {identity.avatarUrl ? (
                    <img src={identity.avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover border border-outline-variant" />
                  ) : (
                    <span className="w-16 h-16 rounded-full bg-surface-container-high border border-outline-variant flex items-center justify-center font-label text-xl text-on-surface-variant">
                      {initialsFrom(identity.name)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-body-lg font-semibold text-on-surface">{identity.name}</p>
                    {identity.email && <p className="text-body-md text-on-surface-variant">{identity.email}</p>}
                    {identity.handle && <p className="font-label text-label-sm text-on-surface-variant">{identity.handle}</p>}
                    <p className="font-label text-label-sm uppercase text-on-surface-variant mt-1.5">
                      {connectedAccounts.length} platform{connectedAccounts.length === 1 ? '' : 's'} connected
                    </p>
                  </div>
                </div>
              </div>

              {connectedAccounts.length > 0 && (
                <div className={`${card} p-6`}>
                  <h2 className="font-display text-headline-md text-on-surface mb-4">Connected social identities</h2>
                  <div className="flex flex-wrap gap-2">
                    {connectedAccounts.map((acc: ConnectedAccount) => {
                      const Icon = iconMap[acc.platform] || Link2;
                      return (
                        <span key={acc.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface text-body-md">
                          <Icon size={14} />
                          {acc.username ? `@${acc.username}` : acc.display_name || acc.platform}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className={`${card} p-6`}>
                <h2 className="font-display text-headline-md text-on-surface mb-1">Session</h2>
                <p className="text-body-md text-on-surface-variant mb-4">
                  {user?.email
                    ? <>Signed in as <span className="font-medium text-on-surface">{user.email}</span>.</>
                    : 'Signed in.'}
                </p>
                <button onClick={handleSignOut} disabled={signingOut} className={secondaryBtn}>
                  {signingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
                <p className="font-body text-[13px] text-on-surface-variant mt-3">
                  Signing out ends your session on this device. It doesn’t disconnect your social accounts.
                </p>
              </div>
            </div>
          )}

          {/* ─── CONNECTED ACCOUNTS TAB ─── */}
          {activeTab === 'accounts' && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-headline-md text-on-surface">Connected accounts</h2>
                  <p className="text-body-md text-on-surface-variant mt-1">View and manage the accounts Populr can review for engagement.</p>
                </div>
                {accounts.length > 0 && (
                  <span className="font-label text-label-sm uppercase text-on-surface-variant flex-shrink-0 pt-1">
                    {connectedAccounts.length} of {accounts.length} connected
                  </span>
                )}
              </div>

              {!backendConfigured && (
                <div className={`${card} p-4 flex items-start gap-2.5`}>
                  <Link2 size={16} className="text-on-surface-variant flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-body-md font-semibold text-on-surface">Populr isn’t connected to a backend yet</p>
                    <p className="text-[13px] text-on-surface-variant mt-0.5">Set VITE_API_URL to see real connected accounts here.</p>
                  </div>
                </div>
              )}

              {backendConfigured && accountsLoading && (
                <div className="flex items-center justify-center py-12 gap-2 text-on-surface-variant">
                  <Loader2 size={20} className="animate-spin" /> <span className="text-body-md">Loading connected accounts…</span>
                </div>
              )}

              {backendConfigured && !accountsLoading && accounts.length === 0 && (
                <div className={`${card} p-10 text-center`}>
                  <div className="w-12 h-12 rounded-full bg-surface-container-high mx-auto flex items-center justify-center mb-3">
                    <Link2 size={22} className="text-on-surface-variant" />
                  </div>
                  <h3 className="font-display text-headline-md text-on-surface">No accounts connected yet</h3>
                  <p className="text-body-md text-on-surface-variant mt-1.5 max-w-sm mx-auto">Connect Instagram, TikTok, LinkedIn, Twitter, or Reddit from the Channels page.</p>
                  <button onClick={() => navigate('/connections')} className={`${secondaryBtn} mt-5`}>Go to Channels</button>
                </div>
              )}

              {backendConfigured && !accountsLoading && accounts.map((acc: ConnectedAccount) => {
                const Icon = iconMap[acc.platform] || Link2;
                const isConnected = acc.status === 'connected';
                const needsReconnect = acc.status === 'reconnect_required';
                const isDisconnected = acc.status === 'disconnected';
                const meta = ACCOUNT_STATUS_META[acc.status];

                return (
                  <div key={acc.id} className={`rounded-xl border p-5 ${needsReconnect ? 'border-error/40 bg-error-container/25' : 'border-outline-variant bg-surface-container-lowest'}`}>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-surface-container-high overflow-hidden">
                        {acc.avatar_url ? (
                          <img src={acc.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Icon size={22} className={isConnected ? 'text-on-surface' : 'text-on-surface-variant'} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-body-md font-semibold text-on-surface capitalize">{acc.platform}</span>
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-label text-label-sm uppercase ${meta.chip}`}>{meta.label}</span>
                        </div>
                        <p className="text-body-md text-on-surface-variant mt-0.5">
                          {acc.username ? `@${acc.username}` : acc.display_name || 'Unknown account'}
                        </p>
                        {needsReconnect && <p className="text-[13px] text-error mt-0.5">Authorization expired — reconnect to keep this account active.</p>}
                        {isDisconnected && <p className="text-[13px] text-on-surface-variant mt-0.5">Historical data preserved. New activity will not sync.</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                        {isConnected && (
                          <button onClick={() => setDisconnectModal(acc.id)} aria-label="Disconnect" className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-error transition-colors">
                            <Trash2 size={16} />
                          </button>
                        )}
                        {(needsReconnect || isDisconnected) && (
                          <button onClick={() => beginPlatformConnect(acc.platform)} className={secondaryBtn}>
                            <RefreshCw size={14} /> Reconnect
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Disconnect confirmation */}
      <AnimatePresence>
        {disconnectModal !== null && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !isDisconnecting && setDisconnectModal(null)}
              className="fixed inset-0 bg-black/30 z-[80]"
            />
            <div className="fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                role="alertdialog"
                aria-modal="true"
                aria-label={`Disconnect ${disconnectTarget ? capitalize(disconnectTarget.platform) : ''}?`}
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.2, ease: [0.24, 1, 0.4, 1] }}
                className={`${card} w-full max-w-[420px] p-6 pointer-events-auto shadow-drawer`}
              >
                <h2 className="font-display text-headline-md text-on-surface">
                  Disconnect {disconnectTarget ? capitalize(disconnectTarget.platform) : ''}?
                </h2>
                <p className="text-body-md text-on-surface-variant mt-2">
                  Historical opportunities and conversations will remain visible. Populr will stop syncing new engagement from this account.
                </p>
                <div className="flex justify-end gap-2 mt-6">
                  <button disabled={isDisconnecting} onClick={() => setDisconnectModal(null)} className={ghostBtn}>Cancel</button>
                  <button
                    disabled={isDisconnecting}
                    onClick={() => disconnectModal && handleDisconnect(disconnectModal)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-error text-on-error px-5 py-2 text-body-md font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isDisconnecting ? <Loader2 size={14} className="animate-spin" /> : null}
                    {isDisconnecting ? 'Disconnecting…' : 'Disconnect account'}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
