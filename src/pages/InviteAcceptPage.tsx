import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AlertCircle, Check, Loader2, RefreshCw, Users } from 'lucide-react';
import { ApiError, acceptInvitation, type AutomationScope, type InviteAcceptStatus } from '../lib/api';
import { useApp } from '../context/AppContext';

/**
 * Where a team invite link lands: /invite/<token>.
 *
 * The route is auth-protected like every other product route, which is
 * exactly what makes the invitation survive authentication — the route gate
 * stashes this path (lib/returnTo.ts) before bouncing to /login, and
 * /auth/complete returns here afterwards. So a brand-new recipient signs up,
 * an existing one signs in, and both come back to the same link with the
 * token intact. Nothing about the token is passed through the auth service.
 *
 * Every outcome the backend distinguishes gets its own sentence: an expired
 * invite and a withdrawn one are different things that need different next
 * steps, and a creator clicking their own workspace's link should be told
 * that plainly rather than handed an error.
 */

type Outcome =
  | { kind: 'working' }
  | { kind: 'done'; status: InviteAcceptStatus; automation: AutomationScope | null }
  | { kind: 'refused'; title: string; detail: string; retryable: boolean };

function refusal(err: unknown): Outcome {
  const code = err instanceof ApiError ? err.code : undefined;
  switch (code) {
    case 'invite_expired':
      return {
        kind: 'refused',
        title: 'This invite has expired',
        detail: 'Invites last 7 days. Ask whoever invited you to send a fresh one.',
        retryable: false,
      };
    case 'invite_revoked':
      return {
        kind: 'refused',
        title: 'This invite was withdrawn',
        detail: 'The workspace owner cancelled it. Ask them to invite you again if that wasn’t intended.',
        retryable: false,
      };
    case 'invite_used':
      return {
        kind: 'refused',
        title: 'This invite was already used',
        detail: 'Each invite works once. If you already accepted it, you’re on the team — otherwise ask for a new one.',
        retryable: false,
      };
    case 'invite_not_found':
      return {
        kind: 'refused',
        title: 'This invite link isn’t valid',
        detail: 'The link may have been copied incompletely. Try opening it again from the email.',
        retryable: false,
      };
    default:
      return {
        kind: 'refused',
        title: 'Couldn’t accept this invite',
        detail: err instanceof Error ? err.message : 'Something went wrong. Try again in a moment.',
        retryable: true,
      };
  }
}

export default function InviteAcceptPage() {
  const { token = '' } = useParams();
  const { refreshWorkspaceAccess } = useApp();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'working' });
  // The token is single-use: a second POST for the same link would be told
  // it was already used and turn a success into an error message. React 18's
  // development double-effect makes that a certainty without this guard.
  const claimed = useRef(false);

  const accept = useCallback(() => {
    setOutcome({ kind: 'working' });
    acceptInvitation(token)
      .then(result => {
        // Membership just changed what this account can reach; re-resolve the
        // workspace context NOW so "Go to Populr" opens the joined workspace
        // (or the canvas) instead of a stale view of the old one.
        void refreshWorkspaceAccess();
        setOutcome({ kind: 'done', status: result.status, automation: result.automation ?? null });
      })
      .catch(err => setOutcome(refusal(err)));
  }, [token, refreshWorkspaceAccess]);

  useEffect(() => {
    if (claimed.current) return;
    claimed.current = true;
    // Redeeming the token IS this page's job — an external effect, not
    // derived state.
    accept();
  }, [accept]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="pop-card w-full max-w-md p-7 text-center">
        {outcome.kind === 'working' && (
          <>
            <div className="w-12 h-12 rounded-2xl bg-[#FAFAF8] flex items-center justify-center mx-auto mb-4">
              <Loader2 size={20} className="animate-spin text-[#6B6B6B]" />
            </div>
            <p className="text-[15px] font-semibold text-[#111111]">Accepting your invite…</p>
            <p className="text-[12.5px] text-[#6B6B6B] mt-1.5">One moment.</p>
          </>
        )}

        {outcome.kind === 'done' && outcome.status === 'owner' && (
          <>
            <div className="w-12 h-12 rounded-2xl bg-[#FAFAF8] flex items-center justify-center mx-auto mb-4">
              <Users size={20} className="text-[#6B6B6B]" />
            </div>
            <p className="text-[16px] font-bold text-[#111111]">This is your own workspace</p>
            <p className="text-[13px] text-[#6B6B6B] mt-2 leading-relaxed">
              You sent this invite — there&apos;s nothing to accept. Whoever you sent it to
              can still use their copy of the link.
            </p>
            <Link to="/" className="pop-btn-primary mt-5 inline-flex">Go to Populr</Link>
          </>
        )}

        {outcome.kind === 'done' && outcome.status !== 'owner' && (
          <>
            <div className="w-12 h-12 rounded-2xl bg-chartreuse flex items-center justify-center mx-auto mb-4">
              <Check size={22} strokeWidth={2.5} className="text-[#111111]" />
            </div>
            <p className="text-[18px] font-bold text-[#111111]">
              {outcome.status === 'already_member' ? 'You’re already on the team' : 'You’re in'}
            </p>
            <p className="text-[13px] text-[#6B6B6B] mt-2 leading-relaxed">
              {outcome.status === 'already_member'
                ? 'This invite was already accepted with this account — nothing else to do.'
                : outcome.automation
                  ? <>You can now open and edit <span className="font-semibold text-[#111111]">&ldquo;{outcome.automation.name}&rdquo;</span>. Whoever invited you can see you on their team.</>
                  : 'You’ve joined the workspace — it’s what Populr opens for you now.'}
            </p>
            {outcome.automation ? (
              <Link to={`/automations/${outcome.automation.id}`} className="pop-btn-primary mt-5 inline-flex">
                Open the automation
              </Link>
            ) : (
              <Link to="/" className="pop-btn-primary mt-5 inline-flex">Go to Populr</Link>
            )}
          </>
        )}

        {outcome.kind === 'refused' && (
          <>
            <div className="w-12 h-12 rounded-2xl bg-[#FFF3E0] flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={20} className="text-[#D97706]" />
            </div>
            <p className="text-[16px] font-bold text-[#111111]">{outcome.title}</p>
            <p className="text-[13px] text-[#6B6B6B] mt-2 leading-relaxed">{outcome.detail}</p>
            <div className="mt-5 flex items-center justify-center gap-2">
              {outcome.retryable && (
                <button type="button" onClick={accept} className="pop-btn-secondary text-[13px]">
                  <RefreshCw size={14} />Try again
                </button>
              )}
              <Link to="/" className="pop-btn-tertiary text-[13px]">Go to Populr</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
