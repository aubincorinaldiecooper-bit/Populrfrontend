import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AlertCircle, Check, Eye, Loader2, PenLine, RefreshCw, Users } from 'lucide-react';
import Avatar from '../components/inbox/Avatar';
import {
  ApiError,
  acceptInvitation,
  fetchInvitePreview,
  type AutomationScope,
  type InviteAcceptStatus,
  type InvitePreview,
} from '../lib/api';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { displayName } from '../lib/people';
import { resolveIdentity } from '../lib/identity';

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
 * This page used to redeem the token on load, so the first thing anybody saw
 * was the outcome. They never learned who invited them, into what, or what
 * they would be able to do — and accepting binds permanently to whichever
 * account happens to be signed in, which in a browser holding a work login
 * and a personal one is a coin toss nobody was told they were making. So it
 * reads the invitation first and asks.
 *
 * Every outcome the backend distinguishes gets its own sentence: an expired
 * invite and a withdrawn one are different things that need different next
 * steps, and a creator clicking their own workspace's link should be told
 * that plainly rather than handed an error.
 */

type Outcome =
  | { kind: 'reading' }
  | { kind: 'offer'; invite: InvitePreview }
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
  const { refreshWorkspaceAccess, switchToWorkspace } = useApp();
  const { user, signOut } = useAuth();
  const acceptingAs = resolveIdentity(user).email;
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'reading' });
  // Reading is idempotent, but the read still runs once: React 18's
  // development double-effect would otherwise flash the card twice.
  const read = useRef(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const navigate = useNavigate();

  /**
   * Leave, and come back to this same link.
   *
   * The invite is already spent if it was accepted — this is for the person
   * who realises mid-flow that they are signed in as the wrong one, and for
   * the one who lands here logged in as an account that was never invited.
   * Signing out returns them to /login with this path stashed, so the link
   * survives the round trip exactly as it does for a first-time recipient.
   */
  const signInAsSomeoneElse = useCallback(async () => {
    if (switchingAccount) return;
    setSwitchingAccount(true);
    try {
      await signOut();
      navigate('/login', { replace: true, state: { returnTo: `/invite/${token}` } });
    } catch {
      setSwitchingAccount(false);
    }
  }, [navigate, signOut, switchingAccount, token]);

  const accept = useCallback(() => {
    setOutcome({ kind: 'working' });
    acceptInvitation(token)
      .then(async result => {
        if (result.status !== 'owner') {
          // MOVE them, don't just re-read. Refreshing alone re-runs the
          // server's fallback inference, and for anyone who has an
          // automation or a connected account of their own that answers
          // "your own workspace" — so the link below opened an automation
          // that, from where they were standing, did not exist. Accepting an
          // invitation is the clearest possible statement of which workspace
          // someone means; this makes it the one they are in.
          //
          // A failure here costs them the automatic move, not the
          // membership: they are on the team either way and the switcher in
          // the sidebar can take them across.
          try {
            await switchToWorkspace(result.workspaceId, result.automation?.id ?? null);
          } catch (err) {
            console.warn('[invite] joined, but could not open the workspace:', err);
            await refreshWorkspaceAccess();
          }
        }
        setOutcome({ kind: 'done', status: result.status, automation: result.automation ?? null });
      })
      .catch(err => setOutcome(refusal(err)));
  }, [token, refreshWorkspaceAccess, switchToWorkspace]);

  /**
   * Read the invitation without spending it.
   *
   * An invitation that is already accepted, withdrawn or expired is answered
   * here rather than by making the recipient press a button to be refused —
   * the same sentences, one step earlier.
   */
  const load = useCallback(() => {
    setOutcome({ kind: 'reading' });
    fetchInvitePreview(token)
      .then(invite => {
        if (invite.status === 'expired') {
          setOutcome(refusal(new ApiError('expired', 410, 'invite_expired')));
        } else if (invite.status === 'revoked') {
          setOutcome(refusal(new ApiError('revoked', 410, 'invite_revoked')));
        } else if (invite.status === 'accepted') {
          setOutcome(refusal(new ApiError('used', 410, 'invite_used')));
        } else if (invite.yours) {
          setOutcome({ kind: 'done', status: 'owner', automation: invite.automation });
        } else {
          setOutcome({ kind: 'offer', invite });
        }
      })
      .catch(err => setOutcome(refusal(err)));
  }, [token]);

  useEffect(() => {
    if (read.current) return;
    read.current = true;
    // Reading the invitation IS this page's job on arrival — an external
    // effect, not derived state. Accepting waits for a person.
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-7 text-center">
        {outcome.kind === 'reading' && (
          <>
            <div className="w-12 h-12 rounded-2xl bg-[#FAFAF8] flex items-center justify-center mx-auto mb-4">
              <Loader2 size={20} className="animate-spin text-[#6B6B6B]" />
            </div>
            <p className="text-[15px] font-semibold text-[#111111]">Reading your invite…</p>
            <p className="text-[12.5px] text-[#6B6B6B] mt-1.5">One moment.</p>
          </>
        )}

        {outcome.kind === 'offer' && <Offer invite={outcome.invite} onAccept={accept} />}

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
            <Link to="/" className={cn(buttonVariants(), "mt-5 inline-flex")}>Go to Populr</Link>
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
              <Link to={`/automations/${outcome.automation.id}`} className={cn(buttonVariants(), "mt-5 inline-flex")}>
                Open the automation
              </Link>
            ) : (
              <Link to="/" className={cn(buttonVariants(), "mt-5 inline-flex")}>Go to Populr</Link>
            )}
          </>
        )}

        {/* Which account this is happening to.
            An invite binds to whoever is signed in, once and permanently.
            Two accounts in one browser is the ordinary case for the person
            testing their own product, and it is the ordinary case for anyone
            with a work login and a personal one — so the page says which one
            it used rather than letting them find out later from a workspace
            that isn't theirs. */}
        {acceptingAs && outcome.kind !== 'working' && outcome.kind !== 'reading' && (
          <p className="mt-5 border-t border-border pt-4 text-[12px] leading-relaxed text-[#6B6B6B]">
            {outcome.kind === 'done' && outcome.status !== 'owner'
              ? <>Joined as <span className="font-semibold text-[#111111]">{acceptingAs}</span>.</>
              : outcome.kind === 'offer' && outcome.invite.invitedEmail.toLowerCase() !== acceptingAs.toLowerCase()
                // Sent to one address, opened by another. Accepting binds to
                // the session, permanently, so the mismatch is said out loud
                // here rather than discovered afterwards in a workspace that
                // was meant for somebody else's account.
                ? <>Sent to <span className="font-semibold text-[#111111]">{outcome.invite.invitedEmail}</span>,
                    but you&apos;re signed in as <span className="font-semibold text-[#111111]">{acceptingAs}</span>.
                    Accepting joins this account.</>
                : <>Signed in as <span className="font-semibold text-[#111111]">{acceptingAs}</span>.</>}
            {' '}
            <button
              type="button"
              onClick={() => void signInAsSomeoneElse()}
              disabled={switchingAccount}
              className="underline underline-offset-2 hover:text-[#111111] disabled:opacity-60"
            >
              {switchingAccount ? 'Signing out…' : 'Use a different account'}
            </button>
          </p>
        )}

        {outcome.kind === 'refused' && (
          <>
            <div className="w-12 h-12 rounded-2xl bg-[#FFF3E0] flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={20} className="text-[#D97706]" />
            </div>
            <p className="text-[16px] font-bold text-[#111111]">{outcome.title}</p>
            <p className="text-[13px] text-[#6B6B6B] mt-2 leading-relaxed">{outcome.detail}</p>
            <div className="mt-5 flex items-center justify-center gap-2">
              {/* Back to the read, not straight to another accept: a
                  transient failure leaves the invitation unspent either way,
                  and returning to the offer is the state that can be acted
                  on. */}
              {outcome.retryable && (
                <button type="button" onClick={load} className={cn(buttonVariants({ variant: 'secondary' }), "text-[13px]")}>
                  <RefreshCw size={14} />Try again
                </button>
              )}
              <Link to="/" className={cn(buttonVariants({ variant: 'outline' }), "text-[13px]")}>Go to Populr</Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/**
 * What this link is, before it is spent.
 *
 * The four things a recipient needs and never had: who is asking, into what,
 * what they'll be able to do there, and anything the sender wanted to say.
 * Then one button, because accepting is a decision and this is the moment
 * somebody could notice a link isn't from who they assumed.
 */
function Offer({ invite, onAccept }: { invite: InvitePreview; onAccept: () => void }) {
  const who = displayName(invite.invitedBy);
  // A canvas invite says edit or view; a workspace invite's reach is the
  // permissions block, and viewing is its floor rather than a setting.
  const canEdit = invite.automation ? invite.canEdit !== false : invite.permissions.editAutomations;

  return (
    <>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center">
        <Avatar
          handle={invite.invitedBy.email}
          name={invite.invitedBy.name}
          avatarUrl={invite.invitedBy.avatarUrl}
          size="lg"
        />
      </div>

      <p className="text-[18px] font-bold leading-snug text-[#111111]">
        {who} invited you
        {invite.automation
          ? <> to <span className="whitespace-nowrap">&ldquo;{invite.automation.name}&rdquo;</span></>
          : invite.workspaceName
            ? <> to {invite.workspaceName}</>
            : ' to their workspace'}
      </p>

      {/* The workspace behind a canvas invite, said once and quietly: it is
          context for whose account this is, not the thing being offered. */}
      {invite.automation && invite.workspaceName && (
        <p className="mt-1.5 text-[12.5px] text-[#6B6B6B]">in {invite.workspaceName}</p>
      )}

      {invite.note && (
        <p className="mt-4 rounded-xl bg-[#F7F5F2] px-4 py-3 text-left text-[13px] leading-relaxed text-[#111111]">
          &ldquo;{invite.note}&rdquo;
        </p>
      )}

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#E8E4DF] px-3.5 py-3 text-left">
        {canEdit
          ? <PenLine size={15} className="mt-0.5 flex-shrink-0 text-[#6B6B6B]" />
          : <Eye size={15} className="mt-0.5 flex-shrink-0 text-[#6B6B6B]" />}
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#111111]">
            {canEdit ? 'You can build and change it' : 'You can look, not change'}
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[#6B6B6B]">
            {invite.automation
              ? canEdit
                ? 'This one automation, and nothing else in their workspace. Turning it on stays with them.'
                : 'You’ll see how this automation works and can comment on it. Editing and turning it on stay with them.'
              : canEdit
                ? 'Their automations are yours to build on. Turning one on stays with them.'
                : 'You’ll see their automations, their inbox and their contacts.'}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onAccept}
        className={cn(buttonVariants(), 'mt-5 w-full justify-center')}
      >
        {invite.automation ? 'Accept and open it' : 'Accept and join'}
      </button>
    </>
  );
}
