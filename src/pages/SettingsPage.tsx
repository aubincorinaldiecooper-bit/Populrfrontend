import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { resolveIdentity } from '../lib/identity';
import {
  Instagram, Video, Linkedin, Twitter, MessageCircle, Link2, LogOut,
  Trash2, RefreshCw,
} from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Text } from '@astryxdesign/core/Text';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Spinner } from '@astryxdesign/core/Spinner';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'profile', label: 'Account' },
    { key: 'accounts', label: 'Connected Accounts' },
  ];

  const connectedAccounts = accounts.filter((a: ConnectedAccount) => a.status === 'connected');
  const backendConfigured = isBackendConfigured();

  const disconnectTarget = disconnectModal ? accounts.find((a: ConnectedAccount) => a.id === disconnectModal) : undefined;
  const isDisconnecting = disconnectModal !== null && disconnecting === disconnectModal;

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto">
      <PageHeader title="Settings" />

      <div className="mb-6 overflow-x-auto">
        <TabList value={activeTab} onChange={v => setActiveTab(v as SettingsTab)} hasDivider>
          {tabs.map(tab => (
            <Tab key={tab.key} value={tab.key} label={tab.label} />
          ))}
        </TabList>
      </div>

      {/* ─── ACCOUNT TAB ─── */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <Card padding={6}>
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
          </Card>

          {/* Connected identities */}
          {connectedAccounts.length > 0 && (
            <Card padding={6}>
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
            </Card>
          )}

          {/* Session */}
          <Card padding={6}>
            <h2 className="font-geist font-semibold text-sm text-[#111111] mb-1">Session</h2>
            <p className="text-[13px] text-[#6B6B6B] mb-4">
              {user?.email
                ? <>Signed in as <span className="font-medium text-[#111111]">{user.email}</span>.</>
                : 'Signed in.'}
            </p>
            <Button
              variant="secondary" icon={<LogOut size={14} />}
              label={signingOut ? 'Signing out…' : 'Sign out'}
              isLoading={signingOut} isDisabled={signingOut}
              onClick={handleSignOut}
            />
            <p className="text-[11px] text-[#9B9B8F] mt-3">
              Signing out ends your session on this device. It doesn't disconnect your social accounts.
            </p>
          </Card>
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
              <Text type="supporting" color="disabled">{connectedAccounts.length} of {accounts.length} connected</Text>
            )}
          </div>

          {!backendConfigured && (
            <Banner
              status="warning"
              title="Populr isn't connected to a backend yet"
              description="Set VITE_API_URL to see real connected accounts here."
            />
          )}

          {backendConfigured && accountsLoading && (
            <div className="flex items-center justify-center py-12 gap-2">
              <Spinner size="lg" />
              <Text type="body" color="secondary">Loading connected accounts...</Text>
            </div>
          )}

          {backendConfigured && !accountsLoading && accounts.length === 0 && (
            <Card padding={8} className="text-center">
              <Link2 size={22} className="text-[#9B9B8F] mx-auto mb-3" />
              <Text type="body" weight="bold" display="block">No accounts connected yet</Text>
              <Text type="supporting" color="secondary" display="block" className="mt-1.5">Connect Instagram, TikTok, LinkedIn, Twitter, or Reddit from the Connections page.</Text>
            </Card>
          )}

          {backendConfigured && !accountsLoading && accounts.map((acc: ConnectedAccount) => {
            const Icon = iconMap[acc.platform] || Link2;
            const status = statusConfig[acc.status];
            const isConnected = acc.status === 'connected';
            const needsReconnect = acc.status === 'reconnect_required';
            const isDisconnected = acc.status === 'disconnected';

            return (
              <Card key={acc.id} padding={5} variant={needsReconnect ? 'red' : 'default'}>
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
                      <Button variant="ghost" size="sm" isIconOnly icon={<Trash2 size={16} />} label="Disconnect" onClick={() => setDisconnectModal(acc.id)} />
                    )}
                    {(needsReconnect || isDisconnected) && (
                      <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} label="Reconnect" onClick={() => beginPlatformConnect(acc.platform)} />
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog
        isOpen={disconnectModal !== null}
        onOpenChange={(open) => { if (!open) setDisconnectModal(null); }}
        title={`Disconnect ${disconnectTarget ? capitalize(disconnectTarget.platform) : ''}?`}
        description="Historical opportunities and conversations will remain visible. Populr will stop syncing new engagement from this account."
        actionLabel={isDisconnecting ? 'Disconnecting...' : 'Disconnect account'}
        actionVariant="destructive"
        isActionLoading={isDisconnecting}
        onAction={() => disconnectModal && handleDisconnect(disconnectModal)}
      />
    </div>
  );
}
