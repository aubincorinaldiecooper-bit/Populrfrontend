import { useState } from 'react';
import { AlertCircle, Loader2, Mail, UserPlus, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { inviteTeammate } from '../../lib/api';
import { isOwnerView } from '../../lib/access';

/**
 * "Invite to this automation" — the builder-header entry point for canvas-
 * scoped invites. The person invited here can open and edit THIS automation
 * and nothing else in the workspace; turning it on stays with the owner.
 * Owner-only: inviting is never a grantable permission, so for members and
 * canvas collaborators the button simply isn't there.
 */

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function InviteToAutomationButton({ flowId, flowName }: {
  flowId: string;
  flowName: string;
}) {
  const { workspaceAccess } = useApp();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (!isOwnerView(workspaceAccess)) return null;

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
      await inviteTeammate(address, { editAutomations: false, contactOutreach: false }, flowId);
      setSentTo(address);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that invite.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setSentTo(null); setError(null); }}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 md:px-3 py-1.5
          text-[13px] font-medium text-[#111111] transition-colors
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]
          ${open ? 'border-[#111111] bg-[#F7F5F2]' : 'border-[#E8E4DF] bg-white hover:border-[#D8D3CC]'}`}
      >
        <UserPlus size={14} /> <span className="hidden md:inline">Invite</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[300px] rounded-xl border border-[#E8E4DF] bg-white p-4 shadow-[0_8px_24px_rgba(17,17,17,0.12)]">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-semibold text-[#111111]">Invite to this automation</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close the invite form"
              className="rounded p-0.5 text-[#9B9B8F] hover:text-[#111111]"
            >
              <X size={14} />
            </button>
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[#6B6B6B]">
            They&apos;ll be able to open and edit &ldquo;{flowName}&rdquo; — nothing else in your
            workspace. Turning it on stays with you.
          </p>

          {sentTo ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#FBFFF0] border border-[#C5FF3D] px-2.5 py-2">
              <Mail size={13} className="text-[#3F5212] flex-shrink-0" />
              <p className="text-[12px] text-[#111111]">
                Invite sent to <span className="font-semibold">{sentTo}</span>.
              </p>
            </div>
          ) : (
            // noValidate for the same reason as the Team page: our own check
            // speaks creator, the browser tooltip doesn't.
            <form onSubmit={send} noValidate className="mt-3">
              <label htmlFor="canvas-invite-email" className="sr-only">Their email</label>
              <input
                id="canvas-invite-email"
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null); }}
                placeholder="teammate@example.com"
                autoFocus
                disabled={sending}
                className="pop-search w-full text-[13px]"
              />
              {error && (
                <div className="mt-2 flex items-start gap-1.5">
                  <AlertCircle size={13} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
                  <p className="text-[11.5px] text-[#6B6B6B]">{error}</p>
                </div>
              )}
              <button
                type="submit"
                disabled={sending}
                className="pop-btn-primary mt-3 w-full justify-center text-[12.5px] py-2 disabled:opacity-60"
              >
                {sending
                  ? <><Loader2 size={13} className="animate-spin" />Sending…</>
                  : <><Mail size={13} />Send invite</>}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
