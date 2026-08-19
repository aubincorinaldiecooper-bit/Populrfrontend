import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Copy, Loader2, Mail, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import Avatar from '../inbox/Avatar';
import { useApp } from '../../context/AppContext';
import { isOwnerView } from '../../lib/access';
import { displayName } from '../../lib/people';
import { queryKeys } from '../../lib/queryKeys';
import {
  fetchCollaborators,
  inviteTeammate,
  removeTeammate,
  updateTeammate,
  type Collaborator,
} from '../../lib/api';

/**
 * Sharing one automation.
 *
 * This replaces a panel that collected an email and nothing else. It sent a
 * grant that always meant edit — because view-only was not representable —
 * showed nothing about who was already on the automation, and offered no
 * link, so an email that bounced left no recovery but a second invitation.
 * Three half-features where people expect one surface.
 *
 * What it is now: choose what they get, send it or copy the link, and see
 * everybody who is already here with a way to change or withdraw them in
 * place. Owner-only, like every other way of granting access.
 *
 * A workspace member appears in the list and cannot be changed from here.
 * Their reach comes from a workspace-wide grant, so changing it on one
 * automation's share sheet would silently change every automation — the
 * backend withholds a handle for exactly those rows, and the absence is what
 * this reads.
 */

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The two things a canvas seat can be, in the words the email will use. */
const CHOICES = [
  { canEdit: true, label: 'Can edit', hint: 'Build and change this automation' },
  { canEdit: false, label: 'Can view', hint: 'Open it and see how it works' },
] as const;

function AccessChoice({ value, onChange, disabled }: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="What they can do" className="mt-2 space-y-1.5">
      {CHOICES.map(choice => {
        const active = value === choice.canEdit;
        return (
          <button
            key={choice.label}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(choice.canEdit)}
            className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left
              transition-colors disabled:opacity-50
              ${active ? 'border-[#C5FF3D] bg-[#FBFFF0]' : 'border-[#E8E4DF] bg-white hover:border-[#D8D3CC]'}`}
          >
            <span
              aria-hidden
              className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border
                ${active ? 'border-[#C5FF3D] bg-[#C5FF3D]' : 'border-[#D8D3CC] bg-white'}`}
            >
              {active && <Check size={11} strokeWidth={3} className="text-[#111111]" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium text-[#111111]">{choice.label}</span>
              <span className="block text-[11.5px] text-[#6B6B6B]">{choice.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** One person already on this automation. */
function CollaboratorRow({ person: c, onChanged }: {
  person: Collaborator;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const name = displayName(c.person);

  const change = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2.5 py-2">
      <Avatar handle={c.person.email} name={c.person.name} avatarUrl={c.person.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] text-[#111111]">
          {name}
          {c.you && <span className="text-[#9B9B8F]"> · you</span>}
        </p>
        <p className="text-[11px] text-[#6B6B6B]">
          {c.role === 'owner'
            ? 'Owner'
            : c.handle
              ? c.canEdit ? 'Can edit' : 'Can view'
              : 'Can edit · from their workspace access'}
        </p>
      </div>

      {/* Only a canvas seat is managed here. The owner has no grant behind
          them, and a workspace member's reach is workspace-wide. */}
      {c.handle && (
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void change(() => updateTeammate(c.handle!, { canEdit: !c.canEdit }))}
            className="rounded-lg px-2 py-1 text-[11.5px] text-[#6B6B6B] hover:bg-[#F4F1EC]
              hover:text-[#111111] disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : c.canEdit ? 'Make view-only' : 'Let them edit'}
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label={`Remove ${name} from this automation`}
            onClick={() => void change(() => removeTeammate(c.handle!))}
            className="rounded-lg p-1.5 text-[#9B9B8F] hover:bg-[#F4F1EC] hover:text-[#111111] disabled:opacity-50"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function ShareAutomation({ flowId, flowName }: {
  flowId: string;
  flowName: string;
}) {
  const { workspaceAccess } = useApp();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [canEdit, setCanEdit] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: collaborators } = useQuery({
    queryKey: queryKeys.collaborators(flowId),
    queryFn: () => fetchCollaborators(flowId),
    enabled: open,
  });

  if (!isOwnerView(workspaceAccess)) return null;

  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.collaborators(flowId) });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      // A fresh opening starts a fresh invite, not the residue of the last.
      setSentTo(null);
      setLink(null);
      setError(null);
      setCopied(false);
    }
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL_SHAPE.test(address)) {
      setError("That doesn't look like an email address.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await inviteTeammate(
        address,
        { editAutomations: false, contactOutreach: false },
        flowId,
        { canEdit, message: note.trim() || undefined },
      );
      setSentTo(address);
      setLink(result.inviteUrl ?? null);
      setEmail('');
      setNote('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that invite.');
    } finally {
      setSending(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setError(null);
    } catch {
      // Some browsers refuse the clipboard without a gesture they recognise.
      // The link is on screen either way, so this is a missing convenience
      // rather than a missing capability — say nothing and let them select it.
      setError('Copy the link below instead.');
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 md:px-3 py-1.5
              text-[13px] font-medium text-[#111111] transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]
              ${open ? 'border-[#111111] bg-[#F7F5F2]' : 'border-[#E8E4DF] bg-white hover:border-[#D8D3CC]'}`}
          >
            <UserPlus size={14} /> <span className="hidden md:inline">Share</span>
          </button>
        }
      />
      <PopoverContent sideOffset={8} className="w-[330px] p-4" aria-label={`Share ${flowName}`}>
        <p className="text-[13px] font-semibold text-[#111111]">Share “{flowName}”</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-[#6B6B6B]">
          They&apos;ll reach this automation and nothing else in your workspace. Turning it on
          stays with you.
        </p>

        {/* Above the fork, because both sides of it can fail: a send that the
            server refused, and a clipboard the browser refused. Keeping this
            inside the form meant the second message was written to state that
            nothing on screen was rendering. */}
        {error && (
          <div className="mt-3 flex items-start gap-1.5">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0 text-[#DC2626]" />
            <p className="text-[11.5px] text-[#6B6B6B]">{error}</p>
          </div>
        )}

        {sentTo ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-[#C5FF3D] bg-[#FBFFF0] px-2.5 py-2">
              <Mail size={13} className="flex-shrink-0 text-[#3F5212]" />
              <p className="text-[12px] text-[#111111]">
                Invite sent to <span className="font-semibold">{sentTo}</span>.
              </p>
            </div>
            {link && (
              <>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-center text-[12.5px] py-2')}
                >
                  {copied ? <><Check size={13} />Link copied</> : <><Copy size={13} />Copy link</>}
                </button>
                {/* On screen as well as on the clipboard: a browser can refuse
                    the clipboard, and a link nobody can see is not a fallback. */}
                <p className="break-all rounded-lg bg-[#F7F5F2] px-2.5 py-2 text-[10.5px] text-[#6B6B6B]">
                  {link}
                </p>
              </>
            )}
            <button
              type="button"
              onClick={() => { setSentTo(null); setLink(null); setCopied(false); }}
              className="w-full text-[12px] text-[#6B6B6B] hover:text-[#111111]"
            >
              Invite someone else
            </button>
          </div>
        ) : (
          // noValidate: our own check speaks creator, the browser tooltip doesn't.
          <form onSubmit={send} noValidate className="mt-3">
            <label htmlFor="share-email" className="sr-only">Their email</label>
            <input
              id="share-email"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              placeholder="teammate@example.com"
              autoFocus
              disabled={sending}
              className="w-full text-[13px]"
            />

            <AccessChoice value={canEdit} onChange={setCanEdit} disabled={sending} />

            <label htmlFor="share-note" className="sr-only">A note, if you want one</label>
            <textarea
              id="share-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add a note — what should they look at?"
              rows={2}
              maxLength={500}
              disabled={sending}
              className="mt-2 w-full resize-none text-[12.5px]"
            />

            <button
              type="submit"
              disabled={sending}
              className={cn(buttonVariants(), 'mt-3 w-full justify-center text-[12.5px] py-2 disabled:opacity-60')}
            >
              {sending ? <><Loader2 size={13} className="animate-spin" />Sending…</> : <><Mail size={13} />Send invite</>}
            </button>
          </form>
        )}

        {collaborators && collaborators.length > 0 && (
          <div className="mt-4 border-t border-[#F0EDE8] pt-3">
            <p className="mb-1 font-label text-[10.5px] uppercase tracking-widest text-[#9B9B8F]">
              Who&apos;s on it
            </p>
            <div className="divide-y divide-[#F4F1EC]">
              {collaborators.map((c, i) => (
                <CollaboratorRow
                  key={c.handle ?? `${c.person.email ?? 'person'}-${i}`}
                  person={c}
                  onChanged={refresh}
                />
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
