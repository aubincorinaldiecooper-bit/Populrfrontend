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
import type { PlatformCapabilities, ConnectedAccount } from '../lib/api';

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

  // Takes the specific account row, not a platform: with two accounts on the
  // same platform, the old platform-keyed lookup (`accounts.find(a =>
  // a.platform === ...)`) disconnected whichever happened to come back
  // first — possibly not the one the user clicked.
  const handleDisconnect = async (account: ConnectedAccount) => {
    const label = account.username ? `@${account.username}` : metaFor(account.platform).name;
    if (!window.confirm(
      `Disconnect ${label}? Automations using this account will stop running until you reconnect it.`
    )) return;

    setDisconnecting(account.id);
    try {
      await disconnectAccount(account.id);
      await refreshConnectedAccounts();
      showToast(`${label} disconnected`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Could not disconnect ${label}.`, 'error');
    } finally {
      setDisconnecting(null);
    }
  };

  // The accounts worth showing: live ones and ones whose authorization
  // expired. The backend list can also carry rows disconnected long ago;
  // those belong nowhere on this page.
  const visibleAccounts = accounts.filter(a => a.is_connected || a.status === 'reconnect_required');

  // One card per platform: every platform we offer, plus any platform the
  // user actually has an account on (or is mid-connect with). Connecting
  // Twitter or Reddit during onboarding used to leave it with no card here
  // at all — invisible, and impossible to disconnect. Each card then lists
  // its REAL accounts individually — the page used to collapse everything to
  // one account per platform, hiding any second account entirely.
  const extraPlatformIds = [
    ...visibleAccounts.map(a => a.platform),
    ...connectedPlatforms.filter(p => p.status !== 'idle').map(p => p.id),
  ].filter((id, i, arr) => arr.indexOf(id) === i && !OFFERED_PLATFORMS.some(o => o.id === id));

  const rows = [
    ...OFFERED_PLATFORMS,
    ...extraPlatformIds.map(id => ({ id, ...metaFor(id) })),
  ];

  const connectedCount = visibleAccounts.filter(a => a.status === 'connected').length;

  return (
    <div className="pop-page max-w-[720px]">
      <PageHeader
        title="Channels"
        subtitle="Connect the accounts your automations run on. One is enough to get started."
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
          const platformStatus = cp?.status ?? 'idle';
          const accts = visibleAccounts.filter(a => a.platform === p.id);
          const caps = capabilities[p.id];
          // Only meaningful once an account exists — otherwise a platform
          // nobody has connected advertises its limitations unprompted.
          const limited = accts.length > 0 && caps && (!caps.supportsCommentReplies || !caps.supportsDMs);
          const connectBusy = platformStatus === 'connecting' || platformStatus === 'syncing';
          const Icon = p.icon;
          return (
            <div key={p.id} className="pop-card p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FAFAF8] flex items-center justify-center flex-shrink-0">
                  <Icon size={20} style={{ color: p.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-semibold text-[#111111]">{p.name}</span>
                    {connectBusy && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FFF3E0] text-[#D97706]">
                        <Loader2 size={10} className="animate-spin" />
                        {platformStatus === 'syncing' ? 'Finishing up' : 'Connecting'}
                      </span>
                    )}
                    {platformStatus === 'error' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FEE2E2] text-[#DC2626]">
                        Connection failed
                      </span>
                    )}
                    {accts.length === 0 && !connectBusy && platformStatus !== 'error' && (
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
                  {platformStatus === 'error' && cp?.errorMessage && (
                    <p className="text-[12px] text-[#DC2626] mt-0.5">{cp.errorMessage}</p>
                  )}
                  {limited && caps?.caveat && (
                    <p className="text-[11px] text-[#9B9B8F] mt-1 leading-relaxed">{caps.caveat}</p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {accts.length === 0 && platformStatus === 'idle' && (
                    <button onClick={() => beginPlatformConnect(p.id)} className="pop-btn-primary text-[12px] py-2 px-3">
                      Connect
                    </button>
                  )}
                  {connectBusy && (
                    <button disabled className="pop-btn-secondary text-[12px] py-2 px-3 opacity-60 cursor-not-allowed">
                      <Loader2 size={13} className="animate-spin" />
                      {platformStatus === 'syncing' ? 'Finishing…' : 'Connecting…'}
                    </button>
                  )}
                  {platformStatus === 'error' && (
                    <button onClick={() => beginPlatformConnect(p.id)} className="pop-btn-secondary text-[12px] py-2 px-3">
                      <RefreshCw size={13} /> Try again
                    </button>
                  )}
                  {accts.length > 0 && !connectBusy && platformStatus !== 'error' && (
                    <button onClick={() => beginPlatformConnect(p.id)} className="pop-btn-tertiary text-[12px] py-2 px-3">
                      Connect another
                    </button>
                  )}
                </div>
              </div>

              {/* One row per real account. The page used to collapse each
                  platform to a single account (`accounts.find`), so a second
                  connected account was invisible here — and Disconnect,
                  keyed by platform, could hit the wrong one. */}
              {accts.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#F0EEEA] space-y-2">
                  {accts.map(a => {
                    const needsReauth = a.status === 'reconnect_required';
                    const label = a.username ? `@${a.username}` : a.display_name ?? 'Connected account';
                    return (
                      <div key={a.id} className="flex items-center gap-3">
                        {a.avatar_url ? (
                          <img src={a.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[#FAFAF8] flex items-center justify-center flex-shrink-0">
                            <Icon size={14} style={{ color: p.color }} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-medium text-[#111111] truncate">{label}</span>
                            {needsReauth ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FFF3E0] text-[#D97706]">
                                <AlertCircle size={10} /> Reconnect needed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#E0F5E9] text-[#059669]">
                                <Check size={10} /> Connected
                              </span>
                            )}
                          </div>
                          {needsReauth && (
                            <p className="text-[12px] text-[#D97706] mt-0.5">
                              Authorization expired — reconnect to keep this account active.
                            </p>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          {/* Reconnect is offered only when authorization has
                              actually expired. A healthy account gets
                              Disconnect — "Reconnect" on a working account
                              reads as though something were broken and pushes
                              the user through a pointless OAuth round-trip. */}
                          {needsReauth ? (
                            <button onClick={() => beginPlatformConnect(p.id)} className="pop-btn-secondary text-[12px] py-1.5 px-3">
                              <RefreshCw size={13} /> Reconnect
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDisconnect(a)}
                              disabled={disconnecting === a.id}
                              className="pop-btn-tertiary text-[12px] py-1.5 px-3 disabled:opacity-50"
                            >
                              {disconnecting === a.id
                                ? <><Loader2 size={13} className="animate-spin" />Disconnecting…</>
                                : <><Link2Off size={13} />Disconnect</>}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* The natural next step after connecting is building an automation,
          not the Opportunities inbox — that framing predates the automations
          pivot and survived here through the redesign restore. */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-[12px] text-[#6B6B6B]">
          {connectedCount > 0
            ? `${connectedCount} ${connectedCount === 1 ? 'account' : 'accounts'} connected`
            : 'Connect at least one account so your automations have somewhere to run.'}
        </p>
        <button
          onClick={() => navigate('/automations/new')}
          disabled={connectedCount === 0}
          className="pop-btn-primary text-[13px] py-2.5 px-4 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Create an automation <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
