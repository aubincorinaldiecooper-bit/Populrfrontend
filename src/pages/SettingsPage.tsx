import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { resolveIdentity } from '../lib/identity';
import { LogOut, Waypoints, ArrowRight } from 'lucide-react';
import PageHeader from '../components/PageHeader';

/**
 * Settings is deliberately small: it shows the signed-in Populr account and
 * ends the session. Nothing else here is real yet.
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
  const { showToast } = useApp();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

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
      showToast(err instanceof Error ? err.message : 'Sign out failed.', 'error');
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
            className="pop-btn-secondary text-[13px] flex items-center gap-2 disabled:opacity-50"
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
