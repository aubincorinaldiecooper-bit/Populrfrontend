import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Copy, Check, Loader2, AlertCircle, RefreshCw, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getPlatformConnectUrl, ApiError } from '../lib/api';
import type { ConnectedAccount } from '../lib/api';

/**
 * Shown when the user asks to connect an additional account on a platform
 * that already has one. Providers' hosted OAuth reuses whatever login the
 * browser already holds, so "Connect another" straight into a redirect
 * usually just re-authorizes the account that's already connected. This
 * modal explains that up front and offers the private-window escape hatch.
 *
 * Modes:
 *  - confirm:   the explainer, with "Continue here" and "Copy connection
 *               link for a private window".
 *  - waiting:   a link was copied; the OAuth is finishing in a private
 *               window this tab can't see, so poll the workspace account
 *               list until an account that wasn't connected before shows
 *               up, alongside a manual "Check now".
 *  - duplicate: the backend callback classified the return as
 *               account_result=existing — the provider reused the current
 *               login. States it plainly and offers a fresh link / retry,
 *               never a success state.
 *
 * Every connection link is minted fresh from the backend for the signed-in
 * workspace at the moment it's needed (they're single-use server-side), and
 * private-window links return to the public /connect/complete page rather
 * than a login screen.
 */
export type ConnectAnotherInitialMode = 'confirm' | 'duplicate';

interface Props {
  platform: string;
  platformName: string;
  initialMode: ConnectAnotherInitialMode;
  onClose: () => void;
}

/** "an Instagram account" / "a Facebook account" / "an X account" — the
 *  copy templates take the platform name mid-sentence, so the article has
 *  to follow it. X is spelled with a vowel sound ("ex"), like any letter
 *  name that starts one. */
function article(name: string): 'a' | 'an' {
  return /^([aeiou]|[fhlmnrsx]\b)/i.test(name) ? 'an' : 'a';
}

/**
 * Platform-specific guidance, shown only where it actually applies — a
 * platform with no entry gets no extra instructions. Instagram's hosted
 * OAuth silently reuses the login already active in the browser, so adding
 * a second account realistically requires a private window or separate
 * browser profile; that advice would be noise on platforms whose OAuth
 * shows an account picker.
 */
const PLATFORM_GUIDANCE: Record<string, { confirm: string; duplicate: string }> = {
  instagram: {
    confirm:
      'Instagram usually reuses the login already active in this browser. To add a different '
      + 'account, open the connection link in a private window (or a separate browser profile) '
      + 'and sign into the other account there.',
    duplicate:
      'This Instagram account is already connected. Instagram reused your current login. '
      + 'Open the connection link in a private window and sign into the other account.',
  },
};

function duplicateMessage(platform: string, platformName: string): string {
  return (
    PLATFORM_GUIDANCE[platform]?.duplicate
    ?? `This ${platformName} account is already connected — the authorization went to an account `
      + `that was already in your workspace, so nothing was added. Try again and pick the other `
      + `account, or copy a fresh connection link and open it where the other account is signed in.`
  );
}

export default function ConnectAnotherModal({ platform, platformName, initialMode, onClose }: Props) {
  const { accounts, refreshConnectedAccounts, beginPlatformConnect, showToast, openSubscriptionModal } = useApp();

  const [mode, setMode] = useState<'confirm' | 'waiting' | 'duplicate'>(initialMode);
  const [link, setLink] = useState<string | null>(null);
  const [linkError, setLinkError] = useState(false);
  // Set when the clipboard write fails (some browsers restrict it) — the
  // link is shown read-only for manual copying instead of being dropped.
  const [manualLink, setManualLink] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkedEmpty, setCheckedEmpty] = useState(false);
  // The private-window connection completes in a window this one can't see, so
  // the wait polls the account list. But some outcomes never produce a new
  // account — the provider reused the already-connected login (the callback's
  // `existing` case, shown in the OTHER window), or the link expired, or the
  // user abandoned it — so the poll is bounded rather than spinning forever.
  const [waitExpired, setWaitExpired] = useState(false);
  const [waitToken, setWaitToken] = useState(0);

  // When the prefetched link was minted — they're single-use and short-lived
  // server-side, so one that has sat in an open modal too long is re-minted
  // at copy time instead of handing the user a link that will 401 on them.
  const mintedAtRef = useRef(0);

  // Snapshot of the platform's account statuses taken when the private-window
  // wait begins. An account counts as "arrived" only if it's connected now
  // and wasn't connected in this snapshot — a genuinely new id or a revived
  // one, never the accounts that were already live.
  const baselineRef = useRef<Map<string, ConnectedAccount['status']> | null>(null);

  const privateWindowReturnUrl = `${window.location.origin}/connect/complete`;

  // onClose comes from the parent as an inline arrow, so its identity changes
  // on every parent render. Holding it in a ref keeps mintLink (and thus the
  // prefetch effect) stable — otherwise, while the modal polls every 4s in
  // waiting mode (and on every 3s toast auto-dismiss), each parent re-render
  // re-created mintLink and the effect minted a brand-new single-use link and
  // Zernio round-trip indefinitely.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Mint a connection link ahead of the copy click so the clipboard write
  // happens synchronously inside the user gesture (async fetch-then-write
  // loses transient activation in some browsers). Links are single-use
  // server-side, so a replacement is minted after each copy.
  const mintLink = useCallback(async (): Promise<string | null> => {
    try {
      const url = await getPlatformConnectUrl(platform, privateWindowReturnUrl);
      mintedAtRef.current = Date.now();
      setLink(url);
      setLinkError(false);
      return url;
    } catch (err) {
      console.error(`[connect] failed to mint a ${platform} connection link:`, err);
      if (err instanceof ApiError && (err.code === 'subscription_required' || err.status === 402)) {
        openSubscriptionModal(platform);
        onCloseRef.current();
        return null;
      }
      setLinkError(true);
      return null;
    }
  }, [platform, privateWindowReturnUrl, openSubscriptionModal]);

  useEffect(() => {
    // Prefetching here (not on the copy click) is what keeps the clipboard
    // write inside the user gesture later. Every state update inside
    // mintLink happens after its network await settles, never synchronously
    // in this effect body — the rule can't see through the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void mintLink();
  }, [mintLink]);

  const copyLink = async () => {
    // Prefer the prefetched link so the clipboard write stays inside the
    // user gesture; fetch now only when it's missing or has sat long enough
    // to risk expiring (clipboard may be refused after the await — the
    // manual-copy field covers that).
    const FRESH_LINK_MAX_AGE_MS = 5 * 60 * 1000;
    const stale = !link || Date.now() - mintedAtRef.current > FRESH_LINK_MAX_AGE_MS;
    const url = stale ? await mintLink() : link;
    if (!url) return;
    setLink(null);
    void mintLink();
    try {
      await navigator.clipboard.writeText(url);
      setManualLink(null);
      showToast('Connection link copied.', 'success');
    } catch {
      setManualLink(url);
    }
    // Entering the wait, or restarting it with a fresh link — reset the
    // baseline, clear the "nothing yet"/expired states, and bump waitToken so
    // the polling effect re-arms a full new window.
    baselineRef.current = new Map(
      accounts.filter(a => a.platform === platform).map(a => [a.id, a.status])
    );
    setCheckedEmpty(false);
    setWaitExpired(false);
    setWaitToken(t => t + 1);
    if (mode !== 'waiting') setMode('waiting');
  };

  // Hands off to the normal same-tab flow and closes. beginPlatformConnect
  // reports its own failures on the platform card (error state, subscription
  // modal) and never throws — keeping this modal open with a spinner would
  // leave it stuck on "Opening…" forever when the startup call fails.
  const continueHere = () => {
    beginPlatformConnect(platform);
    onClose();
  };

  // While waiting on a private-window connection, keep re-reading the
  // authoritative account list — the OAuth completes in a window that can't
  // talk to this one, so polling the backend is the only honest signal.
  useEffect(() => {
    if (mode !== 'waiting') return;
    // ~3 minutes of 4s polls. Past that, an account that was going to appear
    // already has; keep the door open (Check now / fresh link) but stop the
    // silent spin and say what likely happened.
    const MAX_POLLS = 45;
    let polls = 0;
    const timer = setInterval(() => {
      polls += 1;
      if (polls > MAX_POLLS) {
        clearInterval(timer);
        setWaitExpired(true);
        return;
      }
      void refreshConnectedAccounts();
    }, 4000);
    return () => clearInterval(timer);
    // waitToken restarts the poll (and clears the expired state) after a fresh
    // copy, so a second attempt gets a full new window.
  }, [mode, waitToken, refreshConnectedAccounts]);

  useEffect(() => {
    if (mode !== 'waiting' || !baselineRef.current) return;
    const baseline = baselineRef.current;
    const arrived = accounts.find(
      a => a.platform === platform && a.status === 'connected' && baseline.get(a.id) !== 'connected'
    );
    if (arrived) {
      const label = arrived.username ? `@${arrived.username}` : arrived.display_name ?? platformName;
      showToast(`${label} connected.`, 'success');
      onClose();
    }
  }, [accounts, mode, platform, platformName, showToast, onClose]);

  const checkNow = async () => {
    setChecking(true);
    setCheckedEmpty(false);
    try {
      await refreshConnectedAccounts();
      // If the refresh surfaced the new account, the effect above closes the
      // modal before this matters; otherwise say honestly that nothing new
      // arrived yet rather than leaving the click unacknowledged.
      setCheckedEmpty(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Connect another ${platformName} account`}>
      <div className="bg-white rounded-2xl w-full max-w-[440px] shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-[#9B9B8F] hover:text-[#111111] hover:bg-[#FAFAF8] rounded-lg transition-all"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {mode === 'confirm' && (
          <>
            <h3 className="font-geist font-bold text-xl text-[#111111] mb-2 pr-8">
              Connect another {platformName} account
            </h3>
            <p className="text-[13px] text-[#6B6B6B] leading-relaxed mb-3">
              You already have {article(platformName)} {platformName} account connected. Make sure
              you authorize the additional account you want to add. Some platforms may reuse the
              account currently signed into your browser.
            </p>
            {PLATFORM_GUIDANCE[platform] && (
              <p className="text-[12px] text-[#9B9B8F] leading-relaxed mb-5">
                {PLATFORM_GUIDANCE[platform].confirm}
              </p>
            )}
            <div className="space-y-2">
              <button
                onClick={continueHere}
                className="pop-btn-primary w-full justify-center text-[13px] py-2.5"
              >
                Continue here <ArrowRight size={14} />
              </button>
              <button
                onClick={() => { void copyLink(); }}
                className="pop-btn-secondary w-full justify-center text-[13px] py-2.5"
              >
                <Copy size={14} /> Copy connection link
              </button>
            </div>
          </>
        )}

        {mode === 'duplicate' && (
          <>
            <div className="w-10 h-10 rounded-xl bg-[#FFF3E0] flex items-center justify-center mb-3">
              <AlertCircle size={20} className="text-[#D97706]" />
            </div>
            <h3 className="font-geist font-bold text-xl text-[#111111] mb-2 pr-8">
              Already connected
            </h3>
            <p className="text-[13px] text-[#6B6B6B] leading-relaxed mb-5">
              {duplicateMessage(platform, platformName)}
            </p>
            <div className="space-y-2">
              <button
                onClick={() => { void copyLink(); }}
                className="pop-btn-primary w-full justify-center text-[13px] py-2.5"
              >
                <Copy size={14} /> Copy a fresh connection link
              </button>
              <button
                onClick={continueHere}
                className="pop-btn-secondary w-full justify-center text-[13px] py-2.5"
              >
                <RefreshCw size={14} /> Try again
              </button>
            </div>
          </>
        )}

        {mode === 'waiting' && (
          <>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${waitExpired ? 'bg-[#FFF3E0]' : 'bg-[#E0F5E9]'}`}>
              {waitExpired ? <AlertCircle size={20} className="text-[#D97706]" /> : <Check size={20} className="text-[#059669]" />}
            </div>
            <h3 className="font-geist font-bold text-xl text-[#111111] mb-2 pr-8">
              {waitExpired ? 'No new account yet' : manualLink ? 'Copy the connection link' : 'Link copied'}
            </h3>
            <p className="text-[13px] text-[#6B6B6B] leading-relaxed mb-4">
              {waitExpired ? (
                <>
                  We haven&apos;t detected a new {platformName} account. If the other window said the
                  account was already connected, {platformName} reused your current login — sign into
                  the other account in a private window, then copy a fresh link and try again.
                </>
              ) : (
                <>
                  Open it in a private window or another browser profile, sign into the other{' '}
                  {platformName} account, and approve the connection. This page updates as soon as the
                  new account arrives.
                </>
              )}
            </p>
            {manualLink && (
              <input
                readOnly
                value={manualLink}
                onFocus={e => e.currentTarget.select()}
                aria-label="Connection link"
                className="w-full mb-4 px-3 py-2 text-[12px] text-[#111111] bg-[#FAFAF8] border border-[#F0EEEA] rounded-lg"
              />
            )}
            {!waitExpired && (
              <div className="flex items-center gap-2 text-[12px] text-[#9B9B8F] mb-5">
                <Loader2 size={13} className="animate-spin" />
                Watching for the new account…
                {checkedEmpty && !checking && <span>Nothing new yet.</span>}
              </div>
            )}
            <div className="space-y-2">
              <button
                onClick={() => { void checkNow(); }}
                disabled={checking}
                className="pop-btn-primary w-full justify-center text-[13px] py-2.5 disabled:opacity-60"
              >
                {checking
                  ? <><Loader2 size={14} className="animate-spin" /> Checking…</>
                  : <><RefreshCw size={14} /> Check now</>}
              </button>
              <button
                onClick={() => { void copyLink(); }}
                className="pop-btn-secondary w-full justify-center text-[13px] py-2.5"
              >
                <Copy size={14} /> Copy a fresh link
              </button>
            </div>
          </>
        )}

        {linkError && (
          <p className="text-[12px] text-[#DC2626] mt-3">
            Couldn&apos;t create a connection link just now — copying will retry.
          </p>
        )}
      </div>
    </div>
  );
}
