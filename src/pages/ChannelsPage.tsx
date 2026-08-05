import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Instagram, Music, Linkedin, Twitter, MessageCircle, Loader2, Check, AlertCircle, ArrowRight,
  RefreshCw, Link2Off,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/PageHeader';
import { isBackendConfigured, fetchCapabilities } from '../lib/api';
import type { PlatformCapabilities } from '../lib/api';

// The platforms Populr offers to connect. Same three the product leads with;
// anything already connected on another platform still renders below (see
// `rows`), so an account can never become invisible — and therefore
// unmanageable — just because it isn't on this list.
const OFFERED_PLATFORMS = [
  { id: 'instagram', name: 'Instagram', icon: Instagram, color: '#E4405F' },
  { id: 'tiktok', name: 'TikTok', icon: Music, color: '#000000' },
  { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: '#0A66C2' },
];

// lucide-react has no TikTok or Reddit glyph; Music and MessageCircle stand
// in, matching the substitution Onboarding already makes.
const PLATFORM_META: Record<string, { name: string; icon: LucideIcon; color: string }> = {
  instagram: { name: 'Instagram', icon: Instagram, color: '#E4405F' },
  tiktok: { name: 'TikTok', icon: Music, color: '#000000' },
  linkedin: { name: 'LinkedIn', icon: Linkedin, color: '#0A66C2' },
  twitter: { name: 'Twitter', icon: Twitter, color: '#1DA1F2' },
  reddit: { name: 'Reddit', icon: MessageCircle, color: '#FF4500' },
};

function metaFor(id: string) {
  return PLATFORM_META[id] ?? { name: id.charAt(0).toUpperCase() + id.slice(1), icon: MessageCircle, color: '#6B6B6B' };
}

export default function ChannelsPage() {
  const {
    connectedPlatforms, accounts, beginPlatformConnect, refreshConnectedAccounts,
    disconnectAccount, showToast, openSubscriptionModal,
  } = useApp();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const backendConfigured = isBackendConfigured();

  const [capabilities, setCapabilities] = useState<Record<string, PlatformCapabilities>>({});
  const [capabilitiesError, setCapabilitiesError] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  useEffect(() => {
    if (!backendConfigured) return;
    fetchCapabilities()
      .then(list => {
        setCapabilities(Object.fromEntries(list.map(c => [c.platform, c])));
        setCapabilitiesError(false);
      })
      .catch(err => {
        console.error('[channels] failed to load platform capabilities:', err);
        setCapabilitiesError(true);
      });
  }, [backendConfigured]);

  // Connection state lives in memory, so after any full page load (including
  // the return trip from the OAuth redirect) it has to be re-read from the
  // backend — otherwise a genuinely connected account renders as "Not
  // connected". Also clears the one-shot markers the callback leaves behind.
  const syncFromBackend = useCallback(() => {
    if (!backendConfigured) return;
    refreshConnectedAccounts();

    // The OAuth callback and the subscription checkout both return here with
    // one-shot query markers. Onboarding has always acted on these; this page
    // used to strip `connected` and silently ignore the rest, so a creator who
    // hit a subscription wall — or paid and came back — saw nothing at all.
    const connectError = searchParams.get('connect_error');
    const subscription = searchParams.get('subscription');
    const platform = searchParams.get('platform') ?? searchParams.get('retry') ?? undefined;

    if (connectError === 'subscription_required') {
      openSubscriptionModal(platform);
    } else if (connectError) {
      showToast("We couldn't finish connecting that account. Please try again.", 'error');
    } else if (subscription === 'success') {
      showToast('Subscription active — you can connect your account now.', 'success');
    }

    if (connectError || subscription || searchParams.get('connected')) {
      const url = new URL(window.location.href);
      for (const key of ['connected', 'connect_error', 'subscription', 'platform', 'retry']) {
        url.searchParams.delete(key);
      }
      window.history.replaceState(null, '', url.toString());
    }
  }, [backendConfigured, searchParams, refreshConnectedAccounts, openSubscriptionModal, showToast]);

  useEffect(() => {
    syncFromBackend();
  }, [syncFromBackend]);

  const handleDisconnect = async (platformId: string, platformName: string) => {
    const account = accounts.find(a => a.platform === platformId);
    if (!account) {
      showToast(`We couldn't find a connected ${platformName} account to disconnect.`, 'error');
      return;
    }
    if (!window.confirm(
      `Disconnect ${platformName}? Automations using this account will stop running until you reconnect it.`
    )) return;

    setDisconnecting(platformId);
    try {
      await disconnectAccount(account.id);
      await refreshConnectedAccounts();
      showToast(`${platformName} disconnected`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Could not disconnect ${platformName}.`, 'error');
    } finally {
      setDisconnecting(null);
    }
  };

  // Every platform we offer, plus any platform the user actually has an
  // account on. Connecting Twitter or Reddit during onboarding used to leave
  // it with no card here at all — invisible, and impossible to disconnect.
  const rows = [
    ...OFFERED_PLATFORMS,
    ...connectedPlatforms
      .filter(p => p.status !== 'idle' && !OFFERED_PLATFORMS.some(o => o.id === p.id))
      .map(p => ({ id: p.id, ...metaFor(p.id) })),
  ];

  const connectedCount = rows.filter(
    r => connectedPlatforms.find(c => c.id === r.id)?.status === 'connected'
  ).length;

  return (
    <div className="pop-page max-w-[720px]">
      <PageHeader
        title="Channels"
        subtitle="Connect the accounts you want Populr to review for meaningful engagement. One is enough to get started."
      />

      {!backendConfigured && (
        <div className="pop-card p-6 mb-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to a backend yet</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Populr can&apos;t reach its server, so accounts can&apos;t be connected right now.
            </p>
          </div>
        </div>
      )}

      {capabilitiesError && (
        <div className="pop-card p-4 mb-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-[#6B6B6B]">
            We couldn&apos;t check what each platform supports right now, so some limitations may not be shown below.
          </p>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {rows.map(p => {
          const cp = connectedPlatforms.find(c => c.id === p.id);
          const status = cp?.status ?? 'idle';
          const caps = capabilities[p.id];
          // Only meaningful once an account exists — otherwise a platform
          // nobody has connected advertises its limitations unprompted.
          const isLive = status === 'connected' || status === 'reconnect_required';
          const limited = isLive && caps && (!caps.supportsCommentReplies || !caps.supportsDMs);
          const busy = status === 'connecting' || status === 'syncing' || disconnecting === p.id;
          const Icon = p.icon;

          return (
            <div key={p.id} className="pop-card p-4">
              <div className="flex items-start sm:items-center gap-3 flex-col sm:flex-row">
                <div className="flex items-center gap-3 flex-1 min-w-0 w-full">
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
                      {status === 'reconnect_required' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FFF3E0] text-[#D97706]">
                          <AlertCircle size={10} /> Reconnect needed
                        </span>
                      )}
                      {(status === 'connecting' || status === 'syncing') && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FFF3E0] text-[#D97706]">
                          <Loader2 size={10} className="animate-spin" />
                          {status === 'syncing' ? 'Finishing up' : 'Connecting'}
                        </span>
                      )}
                      {status === 'error' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FEE2E2] text-[#DC2626]">
                          Connection failed
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
                    {isLive && cp?.handle && (
                      <p className="text-[12px] text-[#6B6B6B] mt-0.5">{cp.handle}</p>
                    )}
                    {status === 'reconnect_required' && (
                      <p className="text-[12px] text-[#D97706] mt-0.5">
                        Authorization expired — reconnect to keep this account active.
                      </p>
                    )}
                    {status === 'error' && cp?.errorMessage && (
                      <p className="text-[12px] text-[#DC2626] mt-0.5">{cp.errorMessage}</p>
                    )}
                    {limited && caps?.caveat && (
                      <p className="text-[11px] text-[#9B9B8F] mt-1 leading-relaxed">{caps.caveat}</p>
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0 self-end sm:self-auto">
                  {status === 'idle' && (
                    <button onClick={() => beginPlatformConnect(p.id)} className="pop-btn-primary text-[12px] py-2 px-3">
                      Connect
                    </button>
                  )}
                  {busy && status !== 'connected' && status !== 'reconnect_required' && (
                    <button disabled className="pop-btn-secondary text-[12px] py-2 px-3 opacity-60 cursor-not-allowed">
                      <Loader2 size={13} className="animate-spin" />
                      {status === 'syncing' ? 'Finishing…' : 'Connecting…'}
                    </button>
                  )}
                  {status === 'error' && (
                    <button onClick={() => beginPlatformConnect(p.id)} className="pop-btn-secondary text-[12px] py-2 px-3">
                      <RefreshCw size={13} /> Try again
                    </button>
                  )}
                  {/* Reconnect is offered only when authorization has actually
                      expired. A healthy account gets Disconnect — it used to
                      get "Reconnect", which read as though something were
                      broken and pushed the user through a pointless OAuth
                      round-trip, while genuinely-expired accounts had no
                      action at all. */}
                  {status === 'reconnect_required' && (
                    <button onClick={() => beginPlatformConnect(p.id)} className="pop-btn-secondary text-[12px] py-2 px-3">
                      <RefreshCw size={13} /> Reconnect
                    </button>
                  )}
                  {status === 'connected' && (
                    <button
                      onClick={() => handleDisconnect(p.id, p.name)}
                      disabled={disconnecting === p.id}
                      className="pop-btn-tertiary text-[12px] py-2 px-3 disabled:opacity-50"
                    >
                      {disconnecting === p.id
                        ? <><Loader2 size={13} className="animate-spin" />Disconnecting…</>
                        : <><Link2Off size={13} />Disconnect</>}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-[12px] text-[#6B6B6B]">
          {connectedCount > 0
            ? `${connectedCount} of ${rows.length} connected`
            : 'Connect at least one account to see opportunities.'}
        </p>
        <button
          onClick={() => navigate('/opportunities')}
          disabled={connectedCount === 0}
          className="pop-btn-primary text-[13px] py-2.5 px-4 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Go to Opportunities <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
