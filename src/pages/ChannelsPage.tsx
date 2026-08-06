import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Loader2, Check, AlertCircle, ArrowRight, RefreshCw, Link2Off,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/PageHeader';
import ConnectAnotherModal from '../components/ConnectAnotherModal';
import type { ConnectAnotherInitialMode } from '../components/ConnectAnotherModal';
import { isBackendConfigured, fetchCapabilities } from '../lib/api';
import type { PlatformCapabilities, ConnectedAccount } from '../lib/api';
import { BETA_PLATFORMS, isBetaPlatform, platformMeta } from '../lib/platformMeta';

// The beta connection surface (Instagram, Facebook, X) comes from the shared
// platform meta — the single source of truth for names/icons/offering.
// Anything already connected on a hidden platform still renders below (see
// `rows`), so an account can never become invisible — and therefore
// unmanageable — just because its platform left the offered list.
const OFFERED_PLATFORMS = BETA_PLATFORMS.map(id => ({ id, ...platformMeta(id) }));

const metaFor = platformMeta;

export default function ChannelsPage() {
  const {
    connectedPlatforms, accounts, beginPlatformConnect, refreshConnectedAccounts,
    completeOAuthReturn, failOAuthReturn,
    disconnectAccount, showToast, openSubscriptionModal,
  } = useApp();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const backendConfigured = isBackendConfigured();

  const [capabilities, setCapabilities] = useState<Record<string, PlatformCapabilities>>({});
  const [capabilitiesError, setCapabilitiesError] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  // "Connect another" modal — opened in 'confirm' mode from the button, or
  // in 'duplicate' mode when an OAuth return comes back classified as
  // account_result=existing (the provider reused the already-connected login).
  const [connectAnother, setConnectAnother] = useState<{ platform: string; mode: ConnectAnotherInitialMode } | null>(null);

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

    // The OAuth callback and the subscription checkout both return here with
    // one-shot query markers. Onboarding has always acted on these; this page
    // used to strip `connected` and silently ignore the rest, so a creator who
    // hit a subscription wall — or paid and came back — saw nothing at all.
    const connectError = searchParams.get('connect_error');
    const subscription = searchParams.get('subscription');
    const platform = searchParams.get('platform') ?? searchParams.get('retry') ?? undefined;
    const connected = searchParams.get('connected');
    // The callback's classification of what this OAuth return actually did:
    // 'new' or 'restored' arrive with the specific account id to verify;
    // 'existing' means the provider reused the already-connected login and
    // nothing changed — a success redirect that must NOT read as success.
    const accountResult = searchParams.get('account_result');
    const accountId = searchParams.get('account') ?? undefined;
    // When the verifier runs it owns the accounts list — a concurrent
    // passive GET could capture the pre-sync list and resolve last,
    // overwriting the verified account with stale state. Everywhere else,
    // the passive refresh is what re-reads memory-held connection state
    // after a full page load. The 'existing' outcome runs no verifier
    // either — its refresh happens in its own branch below, sequenced
    // before the duplicate explainer opens.
    if (!connected) refreshConnectedAccounts();

    const stripMarkers = () => {
      const url = new URL(window.location.href);
      for (const key of ['connected', 'connect_error', 'subscription', 'platform', 'retry', 'sync', 'account_result', 'account']) {
        url.searchParams.delete(key);
      }
      window.history.replaceState(null, '', url.toString());
    };

    if (connectError === 'subscription_required') {
      openSubscriptionModal(platform);
      stripMarkers();
    } else if (connectError) {
      // The callback already confirmed the failure — reflect it onto the
      // platform card (and toast), as the retired onboarding path did.
      failOAuthReturn(platform);
      stripMarkers();
    } else if (subscription === 'success') {
      showToast('Subscription active — you can connect your account now.', 'success');
      stripMarkers();
    } else if (connected && accountResult === 'existing') {
      // No new account, no misleading success toast — say what happened and
      // hand the user the private-window path to the account they meant.
      // The explainer opens once the passive refresh settles, so it sits
      // over current rows rather than a stale list.
      refreshConnectedAccounts().finally(() => {
        setConnectAnother({ platform: connected, mode: 'duplicate' });
      });
      stripMarkers();
    } else if (connected) {
      // A fresh OAuth return: run the same verification the retired
      // onboarding path did — explicit sync plus bounded polling — and
      // settle the platform card either way. When the callback named the
      // specific account this return added or revived, verify THAT id: with
      // two accounts on a platform, platform-level matching would declare
      // success off the pre-existing one. The marker is stripped only once
      // verification settles, so a reload mid-poll re-enters this path
      // instead of downgrading to the single passive refresh.
      const verification = accountId
        ? completeOAuthReturn(connected, { accountId, restored: accountResult === 'restored' })
        : completeOAuthReturn(connected);
      verification.finally(stripMarkers);
    }
  }, [backendConfigured, searchParams, refreshConnectedAccounts, completeOAuthReturn, failOAuthReturn, openSubscriptionModal, showToast]);

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
          // Hidden (non-beta) platforms appear here only because real
          // accounts exist on them — those stay fully manageable
          // (Disconnect/Reconnect), but no NEW connections are offered.
          const offered = isBetaPlatform(p.id);
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
                  {accts.length === 0 && platformStatus === 'idle' && offered && (
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
                  {accts.length > 0 && !connectBusy && platformStatus !== 'error' && offered && (
                    // Not a straight redirect: providers reuse the login the
                    // browser already holds, so the modal explains that and
                    // offers the private-window link before anything happens.
                    <button
                      onClick={() => setConnectAnother({ platform: p.id, mode: 'confirm' })}
                      className="pop-btn-tertiary text-[12px] py-2 px-3"
                    >
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

      {connectAnother && (
        <ConnectAnotherModal
          platform={connectAnother.platform}
          platformName={metaFor(connectAnother.platform).name}
          initialMode={connectAnother.mode}
          onClose={() => setConnectAnother(null)}
        />
      )}
    </div>
  );
}
