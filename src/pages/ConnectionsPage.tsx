import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Instagram, Music, Linkedin, Twitter, MessageCircle, Check, AlertCircle, ArrowRight, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Spinner } from '@astryxdesign/core/Spinner';
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

  return (
    <div className="pop-page max-w-[720px]">
      <PageHeader
        title="Connections"
        subtitle="Connect the accounts you want Populr to review for meaningful engagement. One is enough to get started."
      />

      {!backendConfigured && (
        <div className="pop-card p-6 mb-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to a backend yet</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Set <code className="bg-[#FAFAF8] px-1 py-0.5 rounded">VITE_API_URL</code> to your Populr backend to connect real accounts here.
            </p>
          </div>
        </div>
      )}

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

          return (
            <div key={p.id} className="pop-card p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FAFAF8] flex items-center justify-center flex-shrink-0">
                  <Icon size={20} style={{ color: p.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-semibold text-[#111111]">{p.name}</span>
                    {status === 'connected' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#E0F5E9] text-[#059669]">
                        <Check size={10} /> Connected
                      </span>
                    )}
                    {status === 'connecting' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FFF3E0] text-[#D97706]">
                        <Spinner size="sm" shade="inherit" /> Connecting
                      </span>
                    )}
                    {status === 'syncing' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FFF3E0] text-[#D97706]">
                        <Spinner size="sm" shade="inherit" /> Finishing connection…
                      </span>
                    )}
                    {status === 'error' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FEE2E2] text-[#DC2626]">
                        Connection failed
                      </span>
                    )}
                    {status === 'reconnect_required' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FEE2E2] text-[#DC2626]">
                        Reconnect required
                      </span>
                    )}
                    {status === 'idle' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FAFAF8] text-[#9B9B8F]">
                        Not connected
                      </span>
                    )}
                    {limited && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#EFF6FF] text-[#3B82F6]">
                        Limited access
                      </span>
                    )}
                  </div>
                  {(status === 'connected' || status === 'reconnect_required') && cp?.handle && (
                    <p className="text-[12px] text-[#6B6B6B] mt-0.5">{cp.handle}</p>
                  )}
                  {status === 'error' && cp?.errorMessage && (
                    <p className="text-[12px] text-[#DC2626] mt-0.5">{cp.errorMessage}</p>
                  )}
                  {status === 'reconnect_required' && (
                    <p className="text-[12px] text-[#DC2626] mt-0.5">Authorization expired — reconnect to keep this account active.</p>
                  )}
                  {limited && caps?.caveat && (
                    <p className="text-[11px] text-[#9B9B8F] mt-1 leading-relaxed">{caps.caveat}</p>
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

      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[#6B6B6B]">
          {connectedCount > 0
            ? `${connectedCount} of ${PLATFORMS.length} connected`
            : 'Connect at least one account to see opportunities.'}
        </p>
        <Button
          label="Go to Opportunities"
          variant="primary"
          endContent={<ArrowRight size={14} />}
          isDisabled={connectedCount === 0}
          onClick={() => navigate('/opportunities')}
        />
      </div>

      {disconnectModalPlatform && (() => {
        const modalPlatform = PLATFORMS.find(pl => pl.id === disconnectModalPlatform);
        const modalAccount = accounts.find(a => a.platform === disconnectModalPlatform);
        const isDisconnectingModal = !!modalAccount && disconnectingAccountId === modalAccount.id;
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
              <h3 className="font-geist font-bold text-base text-[#111111]">
                Disconnect {modalPlatform?.name ?? disconnectModalPlatform}?
              </h3>
              <p className="text-[13px] text-[#6B6B6B] mt-2">
                Populr will stop reviewing engagement on this account. You can reconnect it any time.
              </p>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setDisconnectModalPlatform(null)}
                  disabled={isDisconnectingModal}
                  className="pop-btn-secondary flex-1 text-[13px] py-2.5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => modalAccount && handleDisconnect(modalAccount.id)}
                  disabled={!modalAccount || isDisconnectingModal}
                  className="flex-1 bg-[#DC2626] text-white rounded-[10px] text-[13px] py-2.5 font-semibold hover:bg-[#B91C1C] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDisconnectingModal && <Loader2 size={14} className="animate-spin" />}
                  {isDisconnectingModal ? 'Disconnecting…' : 'Disconnect account'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
