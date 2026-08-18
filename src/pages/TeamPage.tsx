import { useCallback, useEffect, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertCircle, Check, Loader2, Mail, RefreshCw, UserPlus, X } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useApp } from '../context/AppContext';
import { isOwnerView } from '../lib/access';
import {
  isBackendConfigured, fetchTeam, inviteTeammate, revokeInvitation,
  type TeamInvitation, type TeamMember, type TeamPermissions,
} from '../lib/api';

/**
 * Team: who else can work in this workspace, and inviting them. Its own
 * destination in the nav — running a workspace with people is a first-class
 * activity, not a preference buried under the signed-in account.
 *
 * The permission model, said plainly: everyone invited can view the
 * workspace. Editing automations and reaching out to contacts are the two
 * things you can additionally hand over. Turning automations on and off,
 * managing the team, connected accounts and billing stay with you — they
 * aren't offered here because they aren't grantable, and a toggle that
 * can't be honored is worse than no toggle.
 *
 * Pending invitations are shown with what actually happened to them: still
 * waiting, expired, withdrawn — and, when Populr couldn't deliver the
 * email, that too, because "nobody joined" and "the invite never arrived"
 * are different problems with different fixes.
 */

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function permissionSummary(permissions: TeamPermissions): string {
  const extras: string[] = [];
  if (permissions.editAutomations) extras.push('Edit automations');
  if (permissions.contactOutreach) extras.push('Contact outreach');
  return extras.length ? `View · ${extras.join(' · ')}` : 'View only';
}

function PermissionToggle({ label, hint, checked, onChange, disabled }: {
  label: string; hint: string; checked: boolean;
  onChange: (next: boolean) => void; disabled: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-50
        ${checked ? 'border-[#C5FF3D] bg-[#FBFFF0]' : 'border-[#E8E4DF] bg-white hover:border-[#D8D3CC]'}`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[5px] border
          ${checked ? 'border-[#C5FF3D] bg-[#C5FF3D]' : 'border-[#D8D3CC] bg-white'}`}
      >
        {checked && <Check size={11} strokeWidth={3} className="text-[#111111]" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-[#111111]">{label}</span>
        <span className="block text-[11.5px] text-[#6B6B6B]">{hint}</span>
      </span>
    </button>
  );
}

export default function TeamPage() {
  const backendConfigured = isBackendConfigured();
  const { workspaceAccess } = useApp();
  // Members may look at the roster; inviting and withdrawing stay with the
  // owner, so for a member the controls simply aren't offered.
  const ownerView = isOwnerView(workspaceAccess);

  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(backendConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState<TeamPermissions>({
    editAutomations: false,
    contactOutreach: false,
  });
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // The last invitation this visit created, and whether its email actually
  // went out: the API can save the invitation but fail to deliver the email,
  // and announcing that as "sent" would contradict the pending row below
  // saying it couldn't be emailed.
  const [sent, setSent] = useState<{ email: string; delivered: boolean } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    fetchTeam()
      .then(team => { setInvitations(team.invitations); setMembers(team.members); })
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Could not load your team.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!backendConfigured) return;
    // Data fetch from the backend, not derived state — see ContactsPage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [backendConfigured, load]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL_SHAPE.test(address)) {
      setFormError("That doesn't look like an email address.");
      return;
    }
    setSending(true);
    setFormError(null);
    try {
      const invitation = await inviteTeammate(address, permissions);
      setInvitations(prev => [invitation, ...prev]);
      setSent({ email: address, delivered: invitation.emailDelivery === 'sent' });
      setEmail('');
      setPermissions({ editAutomations: false, contactOutreach: false });
      setInviting(false);
    } catch (err) {
      // Stays on the form with what they typed intact: a delivery failure is
      // worth retrying, and retyping the address to do it is a punishment.
      setFormError(err instanceof Error ? err.message : 'Could not send that invite.');
    } finally {
      setSending(false);
    }
  };

  const withdraw = async (invitation: TeamInvitation) => {
    if (revoking) return;
    setRevoking(invitation.id);
    try {
      await revokeInvitation(invitation.id);
      setInvitations(prev =>
        prev.map(i => (i.id === invitation.id ? { ...i, status: 'revoked' as const } : i)));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not withdraw that invite.');
    } finally {
      setRevoking(null);
    }
  };

  const pending = invitations.filter(i => i.status === 'pending');
  const settled = invitations.filter(i => i.status === 'expired' || i.status === 'revoked');

  if (!backendConfigured) {
    return (
      <div className="pop-page">
        <PageHeader title="Team" subtitle="Invite someone to help run this workspace." />
        <div className="pop-card p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to its server yet</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Populr can&apos;t reach its server, so your team can&apos;t be loaded right now.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pop-page">
      <PageHeader
        title="Team"
        subtitle="Invite someone to help run this workspace. Everyone you invite can view it — you choose what else they can do."
        action={ownerView && !inviting && !loading && !loadError ? (
          <button
            type="button"
            onClick={() => { setInviting(true); setSent(null); }}
            className={cn(buttonVariants(), 'text-[12.5px] py-2 px-3.5 flex-shrink-0')}
          >
            <UserPlus size={14} />Invite teammate
          </button>
        ) : undefined}
      />

      <section className="pop-card p-6" aria-label="Your team">
        {loading && (
          <p className="text-[12px] text-[#9B9B8F] flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />Loading your team…
          </p>
        )}

        {!loading && loadError && (
          <div className="flex items-start gap-2">
            <AlertCircle size={15} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-[#6B6B6B] flex-1">{loadError}</p>
            <button onClick={load} className={cn(buttonVariants({ variant: 'outline' }), 'text-[12px] py-1 px-3 flex-shrink-0')}>
              <RefreshCw size={12} />Retry
            </button>
          </div>
        )}

        {!loading && !loadError && (
          <>
            {sent && sent.delivered && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-[#FBFFF0] border border-[#C5FF3D] px-3 py-2.5">
                <Mail size={14} className="text-[#3F5212] flex-shrink-0" />
                <p className="text-[12.5px] text-[#111111]">
                  Invite sent to <span className="font-semibold">{sent.email}</span>. It expires in 7 days.
                </p>
              </div>
            )}
            {sent && !sent.delivered && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-[#FFF7ED] border border-[#FDBA74] px-3 py-2.5">
                <AlertCircle size={14} className="text-[#B45309] flex-shrink-0" />
                <p className="text-[12.5px] text-[#111111]">
                  The invite to <span className="font-semibold">{sent.email}</span> was saved, but the
                  email couldn&apos;t be sent. It&apos;s listed below — withdraw it and invite them again.
                </p>
              </div>
            )}

            {inviting && (
              // noValidate: the form's own check runs instead of the browser's
              // tooltip, so a mistyped address gets the same creator-voice
              // error styling as everything else.
              <form onSubmit={send} noValidate className="mb-5 rounded-xl border border-[#E8E4DF] bg-[#FCFBF9] p-4">
                <label htmlFor="invite-email" className="block text-[12px] font-medium text-[#111111] mb-1.5">
                  Their email
                </label>
                <input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setFormError(null); }}
                  placeholder="teammate@example.com"
                  autoFocus
                  disabled={sending}
                  className="w-full"
                />

                <p className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9B9B8F]">
                  What they can do
                </p>
                <div className="flex items-start gap-2.5 rounded-xl border border-[#E8E4DF] bg-white px-3 py-2.5 opacity-80">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[5px] border border-[#D8D3CC] bg-[#F0EDE8]"
                  >
                    <Check size={11} strokeWidth={3} className="text-[#8A857E]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-[#111111]">View workspace</span>
                    <span className="block text-[11.5px] text-[#6B6B6B]">
                      Always included — see automations, conversations and contacts.
                    </span>
                  </span>
                </div>
                <div className="mt-2 space-y-2">
                  <PermissionToggle
                    label="Edit automations"
                    hint="Build and change automations. Turning them on stays with you."
                    checked={permissions.editAutomations}
                    disabled={sending}
                    onChange={next => setPermissions(p => ({ ...p, editAutomations: next }))}
                  />
                  <PermissionToggle
                    label="Contact outreach"
                    hint="Reply to people in the inbox on your behalf."
                    checked={permissions.contactOutreach}
                    disabled={sending}
                    onChange={next => setPermissions(p => ({ ...p, contactOutreach: next }))}
                  />
                </div>

                {formError && (
                  <div className="flex items-start gap-2 mt-3">
                    <AlertCircle size={14} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
                    <p className="text-[12px] text-[#6B6B6B]">{formError}</p>
                  </div>
                )}

                <div className="mt-4 flex items-center gap-2">
                  <button type="submit" disabled={sending} className={cn(buttonVariants(), 'text-[12.5px] py-2 px-3.5 disabled:opacity-60')}>
                    {sending ? <><Loader2 size={14} className="animate-spin" />Sending…</> : <><Mail size={14} />Send invite</>}
                  </button>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => { setInviting(false); setFormError(null); }}
                    className={cn(buttonVariants({ variant: 'outline' }), 'text-[12.5px] py-2 px-3.5')}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* People who accepted. The owner isn't listed: this is the list of
                collaborators, and you are not a collaborator in your own
                workspace. */}
            {members.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9B9B8F] mb-2">
                  In this workspace
                </p>
                <div className="divide-y divide-[#F0EDE8]">
                  {members.map((member, i) => (
                    <div key={member.email ?? `member-${i}`} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-[#111111] truncate">{member.email ?? 'A teammate'}</p>
                        <p className="text-[11.5px] text-[#6B6B6B]">
                          {member.automation
                            ? <>Works on <span className="font-medium text-[#111111]">&ldquo;{member.automation.name}&rdquo;</span> only</>
                            : permissionSummary(member.permissions)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pending.length > 0 && (
              <div className={members.length > 0 ? 'mt-5' : ''}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9B9B8F] mb-2">
                  Invited, not joined yet
                </p>
                <div className="divide-y divide-[#F0EDE8]">
                  {pending.map(invitation => (
                    <div key={invitation.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-[#111111] truncate">{invitation.email}</p>
                        <p className="text-[11.5px] text-[#6B6B6B]">
                          {invitation.automation
                            ? <>Works on <span className="font-medium text-[#111111]">&ldquo;{invitation.automation.name}&rdquo;</span> only</>
                            : permissionSummary(invitation.permissions)}
                          {invitation.emailDelivery === 'failed' && (
                            <span className="text-[#B45309]"> · Couldn&apos;t be emailed — try inviting again</span>
                          )}
                        </p>
                      </div>
                      {ownerView && <button
                        type="button"
                        onClick={() => withdraw(invitation)}
                        disabled={revoking === invitation.id}
                        aria-label={`Withdraw the invite to ${invitation.email}`}
                        className={cn(buttonVariants({ variant: 'outline' }), 'text-[12px] py-1 px-2.5 flex-shrink-0 disabled:opacity-50')}
                      >
                        {revoking === invitation.id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <><X size={12} />Withdraw</>}
                      </button>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {settled.length > 0 && (
              <p className="mt-4 text-[11.5px] text-[#9B9B8F]">
                {settled.length} earlier invite{settled.length === 1 ? '' : 's'}{' '}
                {settled.length === 1 ? 'has' : 'have'} expired or been withdrawn.
              </p>
            )}

            {members.length === 0 && pending.length === 0 && !inviting && (
              <p className="text-[12px] text-[#6B6B6B]">
                {ownerView
                  ? <>You&apos;re the only one here. Invite someone when you want help running this workspace.</>
                  : <>Nobody else has joined this workspace yet.</>}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
