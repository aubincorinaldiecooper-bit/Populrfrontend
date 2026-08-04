import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Instagram, Music, Linkedin, Twitter, MessageCircle, ArrowRight, RefreshCw, Loader2, AlertCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { isBackendConfigured, fetchCapabilities } from '../lib/api';
import type { PlatformCapabilities } from '../lib/api';

// Populr's supported connection surface. lucide-react has no dedicated TikTok
// or Reddit logo, so those two use a generic stand-in icon paired with the
// platform's real brand color.
const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', icon: Instagram, color: '#E4405F' },
  { id: 'tiktok', name: 'TikTok', icon: Music, color: '#111111' },
  { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: '#0A66C2' },
  { id: 'twitter', name: 'Twitter', icon: Twitter, color: '#1DA1F2' },
  { id: 'reddit', name: 'Reddit', icon: MessageCircle, color: '#FF4500' },
];

const card = 'bg-surface-container-lowest border border-outline-variant rounded-xl';
const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-primary text-on-primary px-4 py-2 text-body-md font-semibold hover:opacity-90 transition-opacity disabled:opacity-50';
const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-outline-variant text-primary px-4 py-2 text-body-md font-medium hover:bg-surface-container-high transition-colors disabled:opacity-50';
const ghostBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-body-md font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-50';

const STATUS_META: Record<string, { label: string; dot: string }> = {
  connected: { label: 'Connected', dot: 'bg-[#0d9f6e]' },
  connecting: { label: 'Connecting', dot: 'bg-[#d97706]' },
  syncing: { label: 'Finishing connection…', dot: 'bg-[#d97706]' },
  error: { label: 'Connection failed', dot: 'bg-error' },
  reconnect_required: { label: 'Reconnect required', dot: 'bg-error' },
  idle: { label: 'Not connected', dot: 'bg-outline' },
};

export default function ConnectionsPage() {
  const {
    connectedPlatforms, accounts, beginPlatformConnect, completeOAuthReturn, failOAuthReturn,
    openSubscriptionModal, refreshConnectedAccounts, disconnectAccount, showToast,
  } = useApp();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const backendConfigured = isBackendConfigured();

  const [capabilities, setCapabilities] = useState<Record<string, PlatformCapabilities>>({});
  // Platform id pending confirmation, not the account id — the account id is
  // looked up fresh at click time so it's never stale by confirm.
  const [disconnectModalPlatform, setDisconnectModalPlatform] = useState<string | null>(null);
  const [disconnectingAccountId, setDisconnectingAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!backendConfigured) return;
    fetchCapabilities()
      .then(list => setCapabilities(Object.fromEntries(list.map(c => [c.platform, c]))))
      .catch(err => console.error('[connections] failed to load platform capabilities:', err));
  }, [backendConfigured]);

  // The authoritative account list is only reflected onto connectedPlatforms by
  // specific actions (OAuth return, an explicit sync) — without this, a
  // returning user who didn't just complete an OAuth round trip would see stale
  // cards even though their accounts really are connected or need reauth.
  useEffect(() => {
    refreshConnectedAccounts();
  }, [refreshConnectedAccounts]);

  // Returning from the $12/month checkout. Never marks anything subscribed
  // locally — just clears the way to manually retry the platform.
  useEffect(() => {
    if (searchParams.get('subscription') !== 'success') return;
    const retryId = searchParams.get('retry');
    const label = retryId ? PLATFORMS.find(p => p.id === retryId)?.name ?? retryId : null;
    showToast(
      label ? `Subscription confirmed. Try connecting ${label} again.` : 'Subscription confirmed.',
      'success',
    );
    const url = new URL(window.location.href);
    url.searchParams.delete('subscription');
    url.searchParams.delete('retry');
    window.history.replaceState(null, '', url.toString());
    // Only run once on mount, driven by the checkout provider's return redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Returning from Zernio's hosted OAuth: connect_error means the backend's
  // callback already confirmed sync failed; connected only means the callback
  // believes it worked, so it's re-verified against the real account list
  // before this page shows "Connected".
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
  const availableCount = PLATFORMS.length - connectedCount;

  // Disconnect goes through the real, authenticated backend endpoint and is
  // never simulated locally. The card only flips to "Not connected" once the
  // authoritative account list has been re-fetched; on failure it stays as it
  // was and the user sees a safe, generic error.
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
  const pct = Math.round((connectedCount / PLATFORMS.length) * 100);

  return (
    <div className="px-container-padding-mobile md:px-container-padding-desktop py-8 md:py-10 max-w-[880px] mx-auto pb-24">
      <div className="mb-7">
        <h1 className="font-display text-headline-md md:text-display-lg-mobile text-on-surface">Channels</h1>
        <p className="font-body text-body-md text-on-surface-variant mt-1.5 max-w-2xl">
          Connect the accounts you want Populr to review for meaningful engagement. One is enough to get started.
        </p>
      </div>

      {!backendConfigured && (
        <div className={`${card} p-4 mb-6 flex items-start gap-2.5`}>
          <AlertCircle size={16} className="text-on-surface-variant flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-body-md font-semibold text-on-surface">Populr isn’t connected to a backend yet</p>
            <p className="text-[13px] text-on-surface-variant mt-0.5">Set VITE_API_URL to your Populr backend to connect real accounts here.</p>
          </div>
        </div>
      )}

      {/* Summary — computed entirely from the real connected-platform list */}
      <div className={`${card} p-5 sm:p-6 mb-6`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex-1 min-w-0">
            <p className="text-body-lg font-semibold text-on-surface">
              <span className="font-label">{connectedCount}</span> of <span className="font-label">{PLATFORMS.length}</span> connected
            </p>
            <div className="h-2 rounded-full bg-surface-container-high overflow-hidden mt-3">
              <motion.div
                className="h-full rounded-full bg-secondary-fixed-dim"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: [0.24, 1, 0.4, 1] }}
              />
            </div>
            <p className="text-[13px] text-on-surface-variant mt-2">More channels connected means more opportunities Populr can surface for you.</p>
          </div>
          <div className="flex items-center gap-6 sm:border-l sm:border-surface-variant sm:pl-6">
            <div className="text-center">
              <p className="font-label text-2xl text-on-surface">{connectedCount}</p>
              <p className="font-label text-label-sm uppercase text-on-surface-variant mt-0.5">Connected</p>
            </div>
            <div className="text-center">
              <p className="font-label text-2xl text-on-surface">{availableCount}</p>
              <p className="font-label text-label-sm uppercase text-on-surface-variant mt-0.5">Available</p>
            </div>
            <div className="text-center">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-label text-label-sm uppercase ${connectedCount > 0 ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'}`}>
                {connectedCount > 0 ? 'Unlocked' : 'Locked'}
              </span>
              <p className="font-label text-label-sm uppercase text-on-surface-variant mt-1.5">Opportunities</p>
            </div>
          </div>
        </div>
      </div>

      {/* Platform cards */}
      <div className="space-y-3 mb-7">
        {PLATFORMS.map(p => {
          const cp = connectedPlatforms.find(c => c.id === p.id);
          const status = cp?.status ?? 'idle';
          const caps = capabilities[p.id];
          const limited = caps && (!caps.supportsCommentReplies || !caps.supportsDMs);
          const Icon = p.icon;
          const realAccount = accounts.find(a => a.platform === p.id);
          const meta = STATUS_META[status] ?? STATUS_META.idle;
          const isLoadingStatus = status === 'connecting' || status === 'syncing';
          const isAttentionState = status === 'error' || status === 'reconnect_required';

          return (
            <div key={p.id} className={`rounded-xl border p-4 ${isAttentionState ? 'border-error/40 bg-error-container/25' : 'border-outline-variant bg-surface-container-lowest'}`}>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="w-11 h-11 rounded-xl bg-surface-container-high flex items-center justify-center flex-shrink-0">
                  <Icon size={21} style={{ color: p.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-body-md font-semibold text-on-surface">{p.name}</span>
                    <span className="inline-flex items-center gap-1.5">
                      {isLoadingStatus
                        ? <Loader2 size={13} className="animate-spin text-on-surface-variant" />
                        : <span className={`w-2 h-2 rounded-full ${meta.dot}`} />}
                      <span className="text-[13px] text-on-surface-variant">{meta.label}</span>
                    </span>
                    {limited && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full font-label text-label-sm uppercase bg-tertiary-fixed text-on-tertiary-fixed-variant">
                        Limited access
                      </span>
                    )}
                  </div>
                  {(status === 'connected' || status === 'reconnect_required') && cp?.handle && (
                    <p className="font-label text-label-sm text-on-surface-variant mt-0.5">{cp.handle}</p>
                  )}
                  {status === 'error' && cp?.errorMessage && (
                    <p className="text-[13px] text-error mt-0.5">{cp.errorMessage}</p>
                  )}
                  {status === 'reconnect_required' && (
                    <p className="text-[13px] text-error mt-0.5">Authorization expired — reconnect to keep this account active.</p>
                  )}
                  {limited && caps?.caveat && (
                    <p className="text-[13px] text-on-surface-variant mt-0.5">{caps.caveat}</p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {status === 'idle' && (
                    <button onClick={() => beginPlatformConnect(p.id)} className={primaryBtn}>Connect</button>
                  )}
                  {status === 'connecting' && (
                    <button disabled className={secondaryBtn}><Loader2 size={13} className="animate-spin" /> Connecting</button>
                  )}
                  {status === 'syncing' && (
                    <button disabled className={secondaryBtn}><Loader2 size={13} className="animate-spin" /> Finishing…</button>
                  )}
                  {status === 'error' && (
                    <button onClick={() => beginPlatformConnect(p.id)} className={secondaryBtn}><RefreshCw size={13} /> Try again</button>
                  )}
                  {status === 'connected' && (
                    <button disabled={!realAccount} onClick={() => setDisconnectModalPlatform(p.id)} className={ghostBtn}>Disconnect</button>
                  )}
                  {status === 'reconnect_required' && (
                    <button onClick={() => beginPlatformConnect(p.id)} className={secondaryBtn}><RefreshCw size={13} /> Reconnect</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => navigate('/opportunities')}
        disabled={connectedCount === 0}
        className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary text-on-primary px-6 py-3.5 text-body-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        Go to Opportunities <ArrowRight size={16} />
      </button>

      {/* Disconnect confirmation */}
      <AnimatePresence>
        {disconnectModalPlatform !== null && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !isDisconnectingModal && setDisconnectModalPlatform(null)}
              className="fixed inset-0 bg-black/30 z-[80]"
            />
            <div className="fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                role="alertdialog"
                aria-modal="true"
                aria-label={`Disconnect ${modalPlatform?.name ?? disconnectModalPlatform ?? ''}?`}
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.2, ease: [0.24, 1, 0.4, 1] }}
                className={`${card} w-full max-w-[420px] p-6 pointer-events-auto shadow-drawer`}
              >
                <h2 className="font-display text-headline-md text-on-surface">
                  Disconnect {modalPlatform?.name ?? disconnectModalPlatform ?? ''}?
                </h2>
                <p className="text-body-md text-on-surface-variant mt-2">
                  Populr will stop reviewing engagement on this account. You can reconnect it any time.
                </p>
                <div className="flex justify-end gap-2 mt-6">
                  <button disabled={isDisconnectingModal} onClick={() => setDisconnectModalPlatform(null)} className={ghostBtn}>Cancel</button>
                  <button
                    disabled={isDisconnectingModal || !modalAccount}
                    onClick={() => modalAccount && handleDisconnect(modalAccount.id)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-error text-on-error px-5 py-2 text-body-md font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isDisconnectingModal ? <Loader2 size={14} className="animate-spin" /> : null}
                    {isDisconnectingModal ? 'Disconnecting…' : 'Disconnect account'}
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
