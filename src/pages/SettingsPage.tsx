import { useCallback, useEffect, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useNavigate, Link } from 'react-router';
import { useApp } from '../context/AppContext';
import { isOwnerView } from '../lib/access';
import { useAuth } from '../context/AuthContext';
import { resolveIdentity } from '../lib/identity';
import { LogOut, Waypoints, ArrowRight, AlertCircle, Loader2, Pause, Play } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import {
  isBackendConfigured, fetchWorkspaceSettings, setWorkspacePause,
} from '../lib/api';

/**
 * Settings is deliberately small: the signed-in Populr account, the
 * workspace's automation pause switch, and ending the session. Everything
 * here is backed by a real endpoint.
 *
 * It previously carried Notifications, Billing, and Security tabs, none of
 * which were wired to anything:
 *  - Notifications rendered three toggles over `useState` with invented
 *    defaults (push/email on, weekly summary off) and no persistence
 *    endpoint behind them, so they presented fabricated values as the
 *    user's saved preferences and silently reset on reload.
 *  - Billing asserted "this account isn't on a paid plan" as static JSX,
 *    never fetched — while a real $12/month subscription exists and is
 *    triggered on backend 402s (see SubscriptionModal), so a paying
 *    creator was told flatly that they hadn't paid.
 *  - Security offered "Change password" although Populr auth is
 *    passwordless (Google + magic link, see lib/authClient.ts), plus two
 *    more buttons whose only behavior was a toast saying they don't exist.
 *
 * These come back when there are endpoints behind them. Until then the page
 * says only what it can stand behind — an empty-but-honest surface beats a
 * populated one the product can't honor.
 */
export default function SettingsPage() {
  const { showToast, workspaceAccess } = useApp();
  const ownerView = isOwnerView(workspaceAccess);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const backendConfigured = isBackendConfigured();
  const [signingOut, setSigningOut] = useState(false);

  // Pause state is fetched, never assumed: rendering a default and correcting
  // it after the response would show the creator the wrong answer to "are my
  // automations running right now" for as long as the request takes.
  const [paused, setPaused] = useState<boolean | null>(null);
  // Load and write failures are kept apart on purpose. A failed load means
  // the status is unknown, so the control can't be shown at all — claiming
  // "running" or "paused" would be a guess. A failed write means the status
  // is still known and unchanged, so the control must stay on screen with
  // the error beside it; replacing it would strand the user with no way to
  // try again and no view of where they actually stand.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pauseBusy, setPauseBusy] = useState(false);

  const loadPause = useCallback(() => {
    if (!backendConfigured) return;
    setLoadError(null);
    setSaveError(null);
    fetchWorkspaceSettings()
      .then(s => setPaused(s.workspacePause))
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Could not load your automation status.'));
  }, [backendConfigured]);

  useEffect(() => {
    // Data fetch from the backend, not derived state — see ContactsPage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPause();
  }, [loadPause]);

  const togglePause = async () => {
    if (paused === null || pauseBusy) return;
    const next = !paused;
    setPauseBusy(true);
    setSaveError(null);
    try {
      // Trust the server's echoed value rather than the optimistic one, so the
      // switch can never show a state the backend didn't actually record.
      setPaused(await setWorkspacePause(next));
      showToast(next ? 'Automations paused for this workspace' : 'Automations resumed', 'success');
    } catch (err) {
      // `paused` is deliberately left untouched — the write didn't happen.
      setSaveError(err instanceof Error ? err.message : 'Could not change your automation status.');
    } finally {
      setPauseBusy(false);
    }
  };

  // Who's signed in comes from Better Auth (name/email/avatar), never from a
  // connected social platform — a connected account can be any platform the
  // creator happens to manage and says nothing about which account they
  // logged into Populr with. Same helper the sidebar uses, so both agree.
  const identity = resolveIdentity(user);

  // Ends the Better Auth session and returns to /login. Deliberately does
  // not touch any connected social account — signing out of Populr isn't the
  // same as disconnecting Instagram/TikTok/etc., which live server-side and
  // belong to the user across sessions.
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't sign out. Try again.", 'error');
      setSigningOut(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto">
      <PageHeader title="Settings" subtitle="Your Populr account." />

      <div className="space-y-4">
        <section className="pop-card p-6">
          <h2 className="font-geist font-semibold text-sm text-[#111111] mb-5">Account</h2>
          <div className="flex items-center gap-4">
            {identity.avatarUrl ? (
              <img src={identity.avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#FAFAF8] flex items-center justify-center text-[20px] font-semibold text-[#9B9B8F] flex-shrink-0">
                {identity.initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-geist font-bold text-base text-[#111111] truncate">{identity.name}</p>
              {identity.email && <p className="text-[13px] text-[#6B6B6B] truncate">{identity.email}</p>}
            </div>
          </div>
          <p className="text-[11px] text-[#9B9B8F] mt-4">
            This is the account you signed in with. Your name and photo come from it and
            can&apos;t be edited in Populr yet.
          </p>
        </section>

        {/* Scoped to this workspace. Populr also has a platform-wide
            emergency stop, but that is operator-only for incident response —
            it is never reported here, because it isn't the creator's to see
            or act on. */}
        {backendConfigured && ownerView && (
          <section className="pop-card p-6">
            <h2 className="font-geist font-semibold text-sm text-[#111111] mb-1">Automations</h2>
            <p className="text-[12px] text-[#6B6B6B] mb-4">
              Pause every automation in this workspace without editing them one by one.
              Comments and DMs are still recorded while paused — Populr just won&apos;t reply.
            </p>

            {loadError ? (
              <div className="flex items-start gap-2">
                <AlertCircle size={15} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-[#6B6B6B] flex-1">{loadError}</p>
                <button onClick={loadPause} className={cn(buttonVariants({ variant: 'outline' }), 'text-[12px] py-1 px-3 flex-shrink-0')}>
                  Retry
                </button>
              </div>
            ) : paused === null ? (
              <p className="text-[12px] text-[#9B9B8F] flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />Checking your automation status…
              </p>
            ) : (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={togglePause}
                    disabled={pauseBusy}
                    aria-pressed={paused}
                    className={cn(buttonVariants({ variant: paused ? 'default' : 'outline' }), 'text-[13px] disabled:opacity-50')}
                  >
                    {pauseBusy
                      ? <><Loader2 size={14} className="animate-spin" />Saving…</>
                      : paused
                        ? <><Play size={14} />Resume automations</>
                        : <><Pause size={14} />Pause automations</>}
                  </button>
                  <span className="text-[12px] text-[#6B6B6B]">
                    {paused
                      ? 'Paused — nothing is being sent automatically.'
                      : 'Running — your active automations reply as normal.'}
                  </span>
                </div>
                {/* Shown beside the control, not instead of it: the state
                    above is still accurate, and the user needs to be able to
                    try again. */}
                {saveError && (
                  <div className="flex items-start gap-2 mt-3">
                    <AlertCircle size={14} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
                    <p className="text-[12px] text-[#6B6B6B]">{saveError}</p>
                  </div>
                )}
                <p className="text-[11px] text-[#9B9B8F] mt-3">
                  This affects only your workspace. Individual automations keep their own
                  active or paused state, so resuming here brings back exactly what was
                  running before.
                </p>
              </>
            )}
          </section>
        )}

        {/* Connected social accounts are managed on Channels — pointing there
            keeps one home for that rather than a second, drifting copy of the
            same connection UI here. */}
        <Link to="/channels" className="pop-card p-5 pop-card-hover flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FAFAF8] flex items-center justify-center flex-shrink-0">
            <Waypoints size={16} className="text-[#6B6B6B]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#111111]">Connected accounts</p>
            <p className="text-[12px] text-[#6B6B6B]">Connect or disconnect the accounts Populr works with.</p>
          </div>
          <ArrowRight size={16} className="text-[#9B9B8F] flex-shrink-0" />
        </Link>

        <section className="pop-card p-6">
          <h2 className="font-geist font-semibold text-sm text-[#111111] mb-1">Session</h2>
          <p className="text-[12px] text-[#6B6B6B] mb-4">
            {identity.email
              ? <>Signed in as <span className="font-medium text-[#111111]">{identity.email}</span>.</>
              : 'Signed in.'}
          </p>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className={cn(buttonVariants({ variant: 'secondary' }), 'text-[13px] flex items-center gap-2 disabled:opacity-50')}
          >
            <LogOut size={14} />{signingOut ? 'Signing out…' : 'Sign out'}
          </button>
          <p className="text-[11px] text-[#9B9B8F] mt-3">
            Signing out ends your session on this device. It doesn&apos;t disconnect your social accounts.
          </p>
        </section>
      </div>
    </div>
  );
}
