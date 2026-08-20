import { Card, cardVariants } from '@/components/ui/card';
import { Page } from '@/components/ui/page';
import { useCallback, useEffect, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AlertCircle, Check, Copy, Loader2, Mail, RefreshCw, Send, SlidersHorizontal, UserPlus, X,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useApp } from '../context/AppContext';
import { isOwnerView } from '../lib/access';
import {
  isBackendConfigured, fetchTeam, inviteTeammate, removeTeammate, resendInvitation,
  revokeInvitation, updateTeammate,
  type TeamInvitation, type TeamMember, type TeamPermissions, type TeamPerson,
} from '../lib/api';
import Avatar from '../components/inbox/Avatar';
import ConfirmDialog from '../components/app/ConfirmDialog';
import { contactLine, displayName } from '../lib/people';

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
  // The roster, as people. Kept separately from `members` — which is the same
  // collaborators keyed by the address they were invited at — because a
  // server that hasn't been redeployed yet sends only the latter, and a page
  // that renders nobody would be a worse answer than the old list.
  const [people, setPeople] = useState<TeamPerson[] | null>(null);
  const [removing, setRemoving] = useState<TeamPerson | null>(null);
  const [removingHandle, setRemovingHandle] = useState<string | null>(null);
  /**
   * A single action failed — a removal, a withdrawal.
   *
   * Deliberately not loadError, which is "the team couldn't be loaded" and
   * replaces the whole section with a retry. A removal that didn't go
   * through must leave the roster on screen: it is still the truth, and
   * blanking it would tell the owner nothing about who has access at the
   * exact moment they were trying to change it.
   */
  const [actionError, setActionError] = useState<string | null>(null);
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

  /**
   * Which teammate's permissions are open for editing, and which row is
   * mid-save.
   *
   * One row at a time: these are consequential switches, and two sets of them
   * open at once invites the wrong one being flipped.
   */
  const [editingHandle, setEditingHandle] = useState<string | null>(null);
  const [savingHandle, setSavingHandle] = useState<string | null>(null);

  /** A resend in flight, and how the last one turned out. */
  const [resending, setResending] = useState<string | null>(null);
  const [resent, setResent] = useState<
    { email: string; delivered: boolean; inviteUrl: string } | null
  >(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    fetchTeam()
      .then(team => {
        setInvitations(team.invitations);
        setMembers(team.members);
        setPeople(team.people ?? null);
      })
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
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not withdraw that invite.');
    } finally {
      setRevoking(null);
    }
  };

  /**
   * Change what somebody can do, without removing them first.
   *
   * The only way to correct a mistaken permission used to be removing the
   * person and inviting them again — which withdraws their invite, drops
   * their place in the workspace, and asks them to accept a second time
   * because you ticked the wrong box. The endpoint to do this in place has
   * existed all along; nothing called it.
   *
   * Optimistic, and rolled back exactly if the server refuses: a switch that
   * waits for a round trip before moving reads as broken, and one that stays
   * moved after a refusal is a lie about who can do what.
   */
  const changePermissions = async (
    target: TeamPerson,
    next: TeamPermissions,
    change: { editAutomations?: boolean; contactOutreach?: boolean; canEdit?: boolean },
  ) => {
    const handle = target.handle;
    if (!handle || savingHandle) return;
    const before = target.permissions;
    const put = (permissions: TeamPermissions) =>
      setPeople(prev => (prev ?? []).map(p => (p.handle === handle ? { ...p, permissions } : p)));

    put(next);
    setSavingHandle(handle);
    try {
      await updateTeammate(handle, change);
      setActionError(null);
    } catch (err) {
      put(before);
      setActionError(
        err instanceof Error ? err.message : "Couldn't change what they can do just now.",
      );
    } finally {
      setSavingHandle(null);
    }
  };

  /**
   * Send the invitation again — same person, same access, a fresh link.
   *
   * An invite that never arrives is common and was unrecoverable: the row
   * said "couldn't be emailed" and the only control beside it was Withdraw.
   * Reissuing rotates the token, so the old link stops working and there is
   * never more than one live invitation per person.
   */
  const resend = async (invitation: TeamInvitation) => {
    if (resending) return;
    setResending(invitation.id);
    setCopied(false);
    try {
      const result = await resendInvitation(invitation.id);
      setInvitations(prev => prev.map(i => (i.id === invitation.id ? result.invitation : i)));
      setResent({
        email: invitation.email,
        delivered: result.invitation.emailDelivery === 'sent',
        inviteUrl: result.inviteUrl,
      });
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't send that invite again.");
    } finally {
      setResending(null);
    }
  };

  const copyInviteLink = async () => {
    if (!resent) return;
    try {
      await navigator.clipboard.writeText(resent.inviteUrl);
      setCopied(true);
    } catch {
      // Some browsers refuse the clipboard without a gesture they recognise.
      // The link is on screen either way, so this is a missing convenience
      // rather than a missing capability.
      setActionError('Copy the link below instead.');
    }
  };

  const remove = async (target: TeamPerson) => {
    if (!target.handle) return;
    setRemovingHandle(target.handle);
    try {
      await removeTeammate(target.handle);
      setPeople(prev => (prev ?? []).filter(p => p.handle !== target.handle));
      // The older array keys on the invited address; a removal has to reach
      // it too or the fallback list would keep showing someone who is gone.
      setMembers(prev => prev.filter(m => m.email !== target.person.email));
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove them just now.');
    } finally {
      setRemovingHandle(null);
    }
  };

  const pending = invitations.filter(i => i.status === 'pending');
  const settled = invitations.filter(i => i.status === 'expired' || i.status === 'revoked');
  // Everyone but the person reading it, for the "you're the only one here"
  // question — an owner alone in their workspace is still one row long.
  const others = (people ?? []).filter(p => !p.you);
  const rosterEmpty = people ? others.length === 0 : members.length === 0;

  if (!backendConfigured) {
    return (
      <Page>
        <PageHeader title="Team" subtitle="Invite someone to help run this workspace." />
        <Card className="p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to its server yet</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Populr can&apos;t reach its server, so your team can&apos;t be loaded right now.
            </p>
          </div>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
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

      <section className={cn(cardVariants(), "p-6")} aria-label="Your team">
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
            {actionError && (
              <div className="mb-4 flex items-start gap-2 rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3 py-2.5">
                <AlertCircle size={14} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
                <p className="text-[12.5px] text-[#111111]">{actionError}</p>
              </div>
            )}

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

            {/* How the last resend went. Two outcomes, and the second is the
                one that matters: the invitation is live either way, so an
                email that didn't send is a delivery problem rather than a
                failed action — and the link is the way round it. */}
            {resent && resent.delivered && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-[#FBFFF0] border border-[#C5FF3D] px-3 py-2.5">
                <Mail size={14} className="text-[#3F5212] flex-shrink-0" />
                <p className="text-[12.5px] text-[#111111]">
                  Sent again to <span className="font-semibold">{resent.email}</span>. Their
                  earlier link stopped working.
                </p>
              </div>
            )}
            {resent && !resent.delivered && (
              <div className="mb-4 rounded-xl bg-[#FFF7ED] border border-[#FDBA74] px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <AlertCircle size={14} className="text-[#B45309] flex-shrink-0 mt-0.5" />
                  <p className="text-[12.5px] text-[#111111]">
                    The email to <span className="font-semibold">{resent.email}</span> still
                    couldn&apos;t be sent. The invite works — send them this link yourself.
                  </p>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyInviteLink()}
                    className={cn(buttonVariants({ variant: 'outline' }), 'text-[12px] py-1 px-2.5')}
                  >
                    {copied ? <><Check size={12} />Link copied</> : <><Copy size={12} />Copy link</>}
                  </button>
                </div>
                {/* On screen as well as on the clipboard: a browser can refuse
                    the clipboard, and a link nobody can see is not a fallback. */}
                <p className="mt-2 break-all rounded-lg bg-white/70 px-2.5 py-2 text-[10.5px] text-[#6B6B6B]">
                  {resent.inviteUrl}
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

            {/* Everyone in this workspace, the owner included. A roster that
                left out the person who built the place was a list of
                collaborators pretending to be a team. */}
            {people && people.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9B9B8F] mb-2">
                  In this workspace
                </p>
                <div className="divide-y divide-[#F0EDE8]">
                  {people.map(entry => {
                    const name = displayName(entry.person);
                    const secondary = contactLine(entry.person);
                    const open = editingHandle === entry.handle;
                    const saving = savingHandle === entry.handle;
                    return (
                      <div key={entry.handle ?? 'owner'} className="py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar
                            handle={entry.person.email}
                            name={entry.person.name}
                            avatarUrl={entry.person.avatarUrl}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] text-[#111111] truncate">
                              {name}
                              {entry.you && <span className="text-[#9B9B8F]"> · you</span>}
                            </p>
                            <p className="text-[11.5px] text-[#6B6B6B] truncate">
                              {entry.role === 'owner'
                                ? 'Owner · runs this workspace'
                                : entry.automation
                                  ? <>
                                      Works on <span className="font-medium text-[#111111]">&ldquo;{entry.automation.name}&rdquo;</span> only
                                      {/* Now that this is changeable, the row has
                                          to say which way it is set — a control
                                          whose current state is invisible is a
                                          guess with a switch attached. */}
                                      {entry.permissions.editAutomations ? ' · can edit' : ' · view only'}
                                    </>
                                  : permissionSummary(entry.permissions)}
                              {secondary && <span className="text-[#9B9B8F]"> · {secondary}</span>}
                            </p>
                          </div>
                          {/* Withdrawing access is the owner's, and there is
                              nothing to withdraw from the owner — which is why
                              the handle's absence is the condition rather than
                              a second check on the role. */}
                          {ownerView && entry.handle && (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditingHandle(open ? null : entry.handle)}
                                aria-expanded={open}
                                aria-label={`Change what ${name} can do`}
                                className={cn(
                                  buttonVariants({ variant: 'outline' }),
                                  'text-[12px] py-1 px-2.5 flex-shrink-0',
                                  open && 'border-[#111111]',
                                )}
                              >
                                <SlidersHorizontal size={12} />Change
                              </button>
                              <button
                                type="button"
                                onClick={() => setRemoving(entry)}
                                disabled={removingHandle === entry.handle}
                                aria-label={`Remove ${name} from this workspace`}
                                className={cn(buttonVariants({ variant: 'outline' }), 'text-[12px] py-1 px-2.5 flex-shrink-0 disabled:opacity-50')}
                              >
                                {removingHandle === entry.handle
                                  ? <Loader2 size={12} className="animate-spin" />
                                  : <><X size={12} />Remove</>}
                              </button>
                            </>
                          )}
                        </div>

                        {/* Each switch saves on its own. There is no Save
                            button because there is nothing to batch: one
                            toggle is one change, and a form that collected
                            them would add a step and a way to lose them. */}
                        {open && entry.handle && (
                          <div className="mt-2.5 ml-11 space-y-2">
                            {entry.automation ? (
                              <PermissionToggle
                                label="Edit this automation"
                                hint={`Off means they can open “${entry.automation.name}” and read it, but not change it.`}
                                checked={entry.permissions.editAutomations}
                                disabled={saving}
                                onChange={next => void changePermissions(
                                  entry,
                                  { ...entry.permissions, editAutomations: next },
                                  { canEdit: next },
                                )}
                              />
                            ) : (
                              <>
                                <PermissionToggle
                                  label="Edit automations"
                                  hint="Build and change automations. Turning them on stays with you."
                                  checked={entry.permissions.editAutomations}
                                  disabled={saving}
                                  onChange={next => void changePermissions(
                                    entry,
                                    { ...entry.permissions, editAutomations: next },
                                    { editAutomations: next },
                                  )}
                                />
                                <PermissionToggle
                                  label="Contact outreach"
                                  hint="Reply to people in the inbox on your behalf."
                                  checked={entry.permissions.contactOutreach}
                                  disabled={saving}
                                  onChange={next => void changePermissions(
                                    entry,
                                    { ...entry.permissions, contactOutreach: next },
                                    { contactOutreach: next },
                                  )}
                                />
                              </>
                            )}
                            <p className="text-[11px] text-[#9B9B8F]">
                              {saving ? 'Saving…' : 'Saved as you switch. They’re told what changed.'}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* The shape this list had before people had names — rendered only
                when the server hasn't sent the roster, so an old server and a
                new page still show a team rather than an empty page. */}
            {!people && members.length > 0 && (
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
              <div className={(people ?? members).length > 0 ? 'mt-5' : ''}>
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
                          {/* Points at the control beside it. This used to say
                              "try inviting again", which meant withdrawing them
                              and starting over — the dead end Resend removes. */}
                          {invitation.emailDelivery === 'failed' && (
                            <span className="text-[#B45309]"> · Couldn&apos;t be emailed — send it again</span>
                          )}
                        </p>
                      </div>
                      {ownerView && <button
                        type="button"
                        onClick={() => void resend(invitation)}
                        disabled={resending === invitation.id}
                        aria-label={`Send the invite to ${invitation.email} again`}
                        className={cn(buttonVariants({ variant: 'outline' }), 'text-[12px] py-1 px-2.5 flex-shrink-0 disabled:opacity-50')}
                      >
                        {resending === invitation.id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <><Send size={12} />Resend</>}
                      </button>}
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

            {rosterEmpty && pending.length === 0 && !inviting && (
              <p className="text-[12px] text-[#6B6B6B]">
                {ownerView
                  ? <>You&apos;re the only one here. Invite someone when you want help running this workspace.</>
                  : <>Nobody else has joined this workspace yet.</>}
              </p>
            )}
          </>
        )}
      </section>

      {/* Removing someone is not undoable from here — their invitation is
          withdrawn with their access, so getting them back means inviting
          them again. Worth one question. */}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={open => { if (!open) setRemoving(null); }}
        title={`Remove ${displayName(removing?.person)}?`}
        description={
          removing?.automation
            ? `They'll lose access to "${removing.automation.name}". Their invite link stops working, so you'd need to invite them again.`
            : `They'll lose access to this workspace. Their invite link stops working, so you'd need to invite them again.`
        }
        confirmLabel="Remove"
        onConfirm={() => { const target = removing; setRemoving(null); if (target) void remove(target); }}
      />
    </Page>
  );
}
