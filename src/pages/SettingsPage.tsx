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
import { Heading } from '@astryxdesign/core/Heading';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Badge } from '@astryxdesign/core/Badge';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Spinner } from '@astryxdesign/core/Spinner';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import { isBackendConfigured } from '../lib/api';
import type { AccountStatus, ConnectedAccount } from '../lib/api';

const iconMap: Record<string, React.ElementType> = {
  instagram: Instagram, tiktok: Video, linkedin: Linkedin, twitter: Twitter, reddit: MessageCircle,
};

// StatusPill's `status` prop doubles as the variant lookup key, so the raw
// enum has to stay lowercase/underscored for that to match — this maps it
// to display text separately rather than mangling the lookup key.
const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  reconnect_required: 'Reconnect required',
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
            <Heading level={5} accessibilityLevel={2} style={{ marginBottom: 20 }}>Account</Heading>
            <HStack gap={4} align="center" style={{ marginBottom: 24 }}>
              <Avatar src={identity.avatarUrl ?? undefined} name={identity.name} size={64} tooltip={false} />
              <VStack gap={0.5}>
                <Text type="body" weight="bold" display="block">{identity.name}</Text>
                {identity.email && <Text type="supporting" color="secondary" display="block">{identity.email}</Text>}
                {identity.handle && <Text type="supporting" color="secondary" display="block">{identity.handle}</Text>}
                <Text type="supporting" color="disabled" display="block" style={{ marginTop: 4 }}>
                  {connectedAccounts.length} platform{connectedAccounts.length === 1 ? '' : 's'} connected
                </Text>
              </VStack>
            </HStack>
          </Card>

          {/* Connected identities */}
          {connectedAccounts.length > 0 && (
            <Card padding={6}>
              <Heading level={5} accessibilityLevel={2} style={{ marginBottom: 16 }}>Connected social identities</Heading>
              <HStack wrap="wrap" gap={2}>
                {connectedAccounts.map((acc: ConnectedAccount) => {
                  const Icon = iconMap[acc.platform] || Link2;
                  return (
                    <Badge
                      key={acc.id}
                      variant="neutral"
                      icon={<Icon size={14} />}
                      label={acc.username ? `@${acc.username}` : acc.display_name || acc.platform}
                    />
                  );
                })}
              </HStack>
            </Card>
          )}

          {/* Session */}
          <Card padding={6}>
            <Heading level={5} accessibilityLevel={2} style={{ marginBottom: 4 }}>Session</Heading>
            <Text type="body" color="secondary" display="block" style={{ marginBottom: 16 }}>
              {user?.email
                ? <>Signed in as <Text type="inherit" weight="medium" color="primary">{user.email}</Text>.</>
                : 'Signed in.'}
            </Text>
            <Button
              variant="secondary" icon={<LogOut size={14} />}
              label={signingOut ? 'Signing out…' : 'Sign out'}
              isLoading={signingOut} isDisabled={signingOut}
              onClick={handleSignOut}
            />
            <Text type="supporting" color="disabled" display="block" style={{ marginTop: 12 }}>
              Signing out ends your session on this device. It doesn't disconnect your social accounts.
            </Text>
          </Card>
        </div>
      )}

      {/* ─── CONNECTED ACCOUNTS TAB ─── */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          <HStack justify="between" align="center" style={{ marginBottom: 8 }}>
            <VStack gap={0.5}>
              <Heading level={5} accessibilityLevel={2}>Connected accounts</Heading>
              <Text type="supporting" color="secondary">View and manage the accounts Populr can review for engagement.</Text>
            </VStack>
            {accounts.length > 0 && (
              <Text type="supporting" color="disabled">{connectedAccounts.length} of {accounts.length} connected</Text>
            )}
          </HStack>

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
            const isConnected = acc.status === 'connected';
            const needsReconnect = acc.status === 'reconnect_required';
            const isDisconnected = acc.status === 'disconnected';

            return (
              <Card key={acc.id} padding={5} variant={needsReconnect ? 'red' : 'default'}>
                <HStack gap={4} align="center" wrap="wrap">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#FAFAF8] overflow-hidden">
                    {acc.avatar_url ? (
                      <img src={acc.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Icon size={22} className={isConnected ? 'text-[#111111]' : 'text-[#9B9B8F]'} />
                    )}
                  </div>
                  <VStack gap={0.5} style={{ flex: 1, minWidth: 0 }}>
                    <HStack gap={2} align="center" wrap="wrap">
                      <Text type="body" weight="semibold" className="capitalize">{acc.platform}</Text>
                      <StatusPill status={acc.status} label={ACCOUNT_STATUS_LABEL[acc.status]} className="text-[10px]" />
                    </HStack>
                    <Text type="supporting" color="secondary">
                      {acc.username ? `@${acc.username}` : acc.display_name || 'Unknown account'}
                    </Text>
                    {needsReconnect && <Text type="supporting" style={{ color: 'var(--color-error)' }}>Authorization expired — reconnect to keep this account active.</Text>}
                    {isDisconnected && <Text type="supporting" color="secondary">Historical data preserved. New activity will not sync.</Text>}
                  </VStack>

                  {/* Actions */}
                  <HStack gap={1.5} align="center" style={{ flexShrink: 0, marginLeft: 'auto' }}>
                    {isConnected && (
                      <Button variant="ghost" size="sm" isIconOnly icon={<Trash2 size={16} />} label="Disconnect" onClick={() => setDisconnectModal(acc.id)} />
                    )}
                    {(needsReconnect || isDisconnected) && (
                      <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} label="Reconnect" onClick={() => beginPlatformConnect(acc.platform)} />
                    )}
                  </HStack>
                </HStack>
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
