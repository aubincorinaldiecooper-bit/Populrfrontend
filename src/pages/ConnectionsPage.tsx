import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Instagram, Music, Linkedin, Twitter, MessageCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Banner } from '@astryxdesign/core/Banner';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/PageHeader';
import { isBackendConfigured, fetchCapabilities } from '../lib/api';
import type { PlatformCapabilities } from '../lib/api';

// Populr's supported connection surface: Instagram, TikTok, LinkedIn,
// Twitter/X, and Reddit. lucide-react has no dedicated TikTok or Reddit
// logo, so those two use a generic stand-in icon paired with the
// platform's real brand color (same convention already used for TikTok).
const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', icon: Instagram, color: '#E4405F' },
  { id: 'tiktok', name: 'TikTok', icon: Music, color: '#000000' },
  { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: '#0A66C2' },
  { id: 'twitter', name: 'Twitter', icon: Twitter, color: '#1DA1F2' },
  { id: 'reddit', name: 'Reddit', icon: MessageCircle, color: '#FF4500' },
];

export default function ConnectionsPage() {
  const {
    connectedPlatforms, accounts, beginPlatformConnect, completeOAuthReturn, failOAuthReturn,
    openSubscriptionModal, refreshConnectedAccounts, disconnectAccount, showToast,
  } = useApp();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const backendConfigured = isBackendConfigured();

  const [capabilities, setCapabilities] = useState<Record<string, PlatformCapabilities>>({});
  // Platform id (e.g. "instagram") pending confirmation, not the account id —
  // the account id is looked up fresh at click time from the authoritative
  // `accounts` list so it's never stale by the time the user confirms.
  const [disconnectModalPlatform, setDisconnectModalPlatform] = useState<string | null>(null);
  const [disconnectingAccountId, setDisconnectingAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!backendConfigured) return;
    fetchCapabilities()
      .then(list => {
        setCapabilities(Object.fromEntries(list.map(c => [c.platform, c])));
      })
      .catch(err => {
        console.error('[connections] failed to load platform capabilities:', err);
      });
  }, [backendConfigured]);

  // The authoritative account list (connected/reconnect_required/disconnected)
  // is only reflected onto connectedPlatforms by specific actions (OAuth
  // return, an explicit sync) — without this, a returning user who didn't
  // just complete an OAuth round trip would see stale/idle cards even
  // though their accounts really are connected or need reauth.
  useEffect(() => {
    refreshConnectedAccounts();
  }, [refreshConnectedAccounts]);

  // Returning from the $12/month checkout. Never marks anything subscribed
  // locally — that's not this frontend's to claim — just clears the way for
  // the user to manually retry the platform they were trying to connect.
  useEffect(() => {
    if (searchParams.get('subscription') !== 'success') return;
    const retryId = searchParams.get('retry');
    const label = retryId ? PLATFORMS.find(p => p.id === retryId)?.name ?? retryId : null;
    showToast(
      label ? `Subscription confirmed. Try connecting ${label} again.` : 'Subscription confirmed.',
      'success'
    );
    const url = new URL(window.location.href);
    url.searchParams.delete('subscription');
    url.searchParams.delete('retry');
    window.history.replaceState(null, '', url.toString());
    // Only run once on mount, driven by the checkout provider's return redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Returning from Zernio's hosted OAuth (see Onboarding.tsx for the full
  // rationale): connect_error means the backend's callback already confirmed
  // sync failed; connected only means the callback believes it worked, so it
  // still has to be re-verified against the real account list before this
  // page shows "Connected". Runs once per mount; params are read before being
  // stripped so an in-flight verification isn't cut off mid-poll.
  useEffect(() => {
    if (!backendConfigured) return;
    const connectError = searchParams.get('connect_error');
    const errorPlatform = connectError ? searchParams.get('platform') : null;
    const connectedPlatformId = searchParams.get('connected');
    if (!connectError && !connectedPlatformId) return;

    const cleanUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('connected');
      url.searchParams.delete('sync');
      url.searchParams.delete('connect_error');
      url.searchParams.delete('platform');
      window.history.replaceState(null, '', url.toString());
    };

    if (connectError === 'subscription_required') {
      openSubscriptionModal(errorPlatform ?? undefined);
      cleanUrl();
    } else if (connectError === 'account_sync_failed') {
      failOAuthReturn(errorPlatform ?? undefined);
      cleanUrl();
    } else if (connectedPlatformId) {
      completeOAuthReturn(connectedPlatformId).finally(cleanUrl);
    }
    // Only run once on mount, driven by the OAuth provider's return redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectedCount = connectedPlatforms.filter(p => p.status === 'connected').length;

  // Disconnect goes through the real, authenticated backend endpoint (see
  // AppContext.disconnectAccount -> lib/api.ts's disconnectAccount, POST
  // /api/accounts/:id/disconnect) and is never simulated locally. On success
  // the card only flips to "Not connected" once the authoritative account
  // list has been re-fetched; on failure the account stays exactly as it
  // was and the user sees a safe, generic error (whatever the backend
  // actually said is only ever logged, never shown raw).
  const handleDisconnect = async (accountId: string) => {
    setDisconnectingAccountId(accountId);
    try {
      await disconnectAccount(accountId);
      await refreshConnectedAccounts();
      showToast('Account disconnected.', 'success');
      setDisconnectModalPlatform(null);
    } catch (err) {
      console.error('[connections] failed to disconnect account:', err);
      showToast('Could not disconnect this account. Try again.', 'error');
    } finally {
      setDisconnectingAccountId(null);
    }
  };

  const modalPlatform = PLATFORMS.find(pl => pl.id === disconnectModalPlatform);
  const modalAccount = accounts.find(a => a.platform === disconnectModalPlatform);
  const isDisconnectingModal = !!modalAccount && disconnectingAccountId === modalAccount.id;

  const availableCount = PLATFORMS.length - connectedCount;
  const progressPct = Math.round((connectedCount / PLATFORMS.length) * 100);

  return (
    <div className="pop-page">
      <PageHeader
        title="Connections"
        subtitle="Connect the accounts you want Populr to review for meaningful engagement. One is enough to get started."
      />

      {!backendConfigured && (
        <Banner
          status="warning"
          title="Populr isn't connected to a backend yet"
          description="Set VITE_API_URL to your Populr backend to connect real accounts here."
          className="mb-6"
        />
      )}

      {/* Summary panel: everything here is computed from the real connected-platform
          list above — no invented numbers. */}
      <div className="pop-card p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex-1 min-w-0">
          <p className="font-geist font-bold text-[20px] text-[#111111]">
            <span className="font-geist-mono">{connectedCount}</span> of <span className="font-geist-mono">{PLATFORMS.length}</span> connected
          </p>
          <div className="h-1.5 rounded-full bg-[#F0EEEA] mt-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-chartreuse transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="pop-meta mt-2">More channels connected means more opportunities Populr can surface for you.</p>
        </div>
        <div className="flex items-center gap-4 sm:gap-6 sm:border-l sm:border-[#E8E4DF] sm:pl-6">
          <div>
            <p className="font-geist-mono font-bold text-xl text-[#111111]">{connectedCount}</p>
            <p className="pop-meta">Connected</p>
          </div>
          <div>
            <p className="font-geist-mono font-bold text-xl text-[#111111]">{availableCount}</p>
            <p className="pop-meta">Available</p>
          </div>
          <div>
            <p className={`font-geist font-bold text-sm ${connectedCount > 0 ? 'text-[#059669]' : 'text-[#9B9B8F]'}`}>
              {connectedCount > 0 ? 'Unlocked' : 'Locked'}
            </p>
            <p className="pop-meta">Opportunities</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {PLATFORMS.map(p => {
          const cp = connectedPlatforms.find(c => c.id === p.id);
          const status = cp?.status ?? 'idle';
          const caps = capabilities[p.id];
          const limited = caps && (!caps.supportsCommentReplies || !caps.supportsDMs);
          const Icon = p.icon;
          // The account's real backend id (never the platform name) — the
          // only thing disconnect is ever called with. In-flight/disabled
          // state while disconnecting is shown in the confirm modal below,
          // which covers the whole page while open.
          const realAccount = accounts.find(a => a.platform === p.id);

          const statusMeta: Record<string, { label: string; dot: string; text: string }> = {
            connected: { label: 'Connected', dot: 'bg-[#059669]', text: 'text-[#059669]' },
            connecting: { label: 'Connecting', dot: 'bg-[#D97706]', text: 'text-[#D97706]' },
            syncing: { label: 'Finishing connection…', dot: 'bg-[#D97706]', text: 'text-[#D97706]' },
            error: { label: 'Connection failed', dot: 'bg-[#DC2626]', text: 'text-[#DC2626]' },
            reconnect_required: { label: 'Reconnect required', dot: 'bg-[#DC2626]', text: 'text-[#DC2626]' },
            idle: { label: 'Not connected', dot: 'bg-[#D4CFC8]', text: 'text-[#9B9B8F]' },
          };
          const meta = statusMeta[status] ?? statusMeta.idle;
          const isLoadingStatus = status === 'connecting' || status === 'syncing';

          return (
            <div key={p.id} className="pop-card p-4">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-[#FAFAF8] flex items-center justify-center flex-shrink-0">
                  <Icon size={21} style={{ color: p.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="pop-card-title">{p.name}</span>
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${meta.text}`}>
                      {isLoadingStatus ? <Spinner size="sm" shade="inherit" /> : <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${meta.dot}`} />}
                      {meta.label}
                    </span>
                    {limited && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#3B82F6]">
                        <span className="w-[7px] h-[7px] rounded-full flex-shrink-0 bg-[#3B82F6]" />
                        Limited access
                      </span>
                    )}
                  </div>
                  {(status === 'connected' || status === 'reconnect_required') && cp?.handle && (
                    <p className="pop-meta mt-1 font-geist-mono">{cp.handle}</p>
                  )}
                  {status === 'error' && cp?.errorMessage && (
                    <p className="text-[12px] text-[#DC2626] mt-1">{cp.errorMessage}</p>
                  )}
                  {status === 'reconnect_required' && (
                    <p className="text-[12px] text-[#DC2626] mt-1">Authorization expired — reconnect to keep this account active.</p>
                  )}
                  {limited && caps?.caveat && (
                    <p className="pop-meta mt-1 leading-relaxed">{caps.caveat}</p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {status === 'idle' && (
                    <Button label="Connect" variant="primary" size="sm" onClick={() => beginPlatformConnect(p.id)} />
                  )}
                  {status === 'connecting' && (
                    <Button label="Connecting" variant="secondary" size="sm" isLoading isDisabled />
                  )}
                  {status === 'syncing' && (
                    <Button label="Finishing…" variant="secondary" size="sm" isLoading isDisabled />
                  )}
                  {status === 'error' && (
                    <Button label="Try again" variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={() => beginPlatformConnect(p.id)} />
                  )}
                  {status === 'connected' && (
                    <Button
                      label="Disconnect"
                      variant="ghost"
                      size="sm"
                      isDisabled={!realAccount}
                      onClick={() => setDisconnectModalPlatform(p.id)}
                    />
                  )}
                  {status === 'reconnect_required' && (
                    <Button label="Reconnect" variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={() => beginPlatformConnect(p.id)} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => connectedCount > 0 && navigate('/opportunities')}
        disabled={connectedCount === 0}
        className="pop-btn-primary w-full justify-center py-3.5 text-[14px] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Go to Opportunities <ArrowRight size={15} />
      </button>

      <AlertDialog
        isOpen={disconnectModalPlatform !== null}
        onOpenChange={(open) => { if (!open) setDisconnectModalPlatform(null); }}
        title={`Disconnect ${modalPlatform?.name ?? disconnectModalPlatform ?? ''}?`}
        description="Populr will stop reviewing engagement on this account. You can reconnect it any time."
        actionLabel={isDisconnectingModal ? 'Disconnecting…' : 'Disconnect account'}
        actionVariant="destructive"
        isActionLoading={isDisconnectingModal}
        onAction={() => modalAccount && handleDisconnect(modalAccount.id)}
      />
    </div>
  );
}
