import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, MapPin, RotateCcw, Trash2, X } from 'lucide-react';
import Avatar from '../inbox/Avatar';
import { displayName } from '../../lib/people';
import { shortAgo } from '../../lib/builderNotifications';
import type { CanvasComment, CommentThread } from '../../lib/api';

/**
 * One conversation, open beside the thing it is about.
 *
 * An overlay, never a column: it floats above the canvas so the automation
 * keeps its width and the AI keeps the right-hand side. Its side is chosen by
 * lib/notePlacement so it flips at viewport edges and dodges steps rather
 * than burying them.
 *
 * Resolve sits in the header rather than beside Reply, because resolving ends
 * the conversation — it is not one of the things you say in it.
 */

const MAX_LENGTH = 2000;

function Said({ comment, onDelete, busy }: {
  comment: CanvasComment;
  onDelete: (() => void) | null;
  busy: boolean;
}) {
  return (
    <div className="flex gap-2">
      <Avatar
        handle={comment.by.email}
        name={comment.by.name}
        avatarUrl={comment.by.avatarUrl}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5">
          <span className="truncate text-[12.5px] font-semibold text-[#111111]">
            {comment.you ? 'You' : displayName(comment.by)}
          </span>
          <span className="flex-shrink-0 text-[11px] text-[#9B9B8F]">{shortAgo(Date.parse(comment.at))}</span>
          {/* Taking words back is only ever offered to whoever said them. */}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              aria-label="Delete this note"
              className="ml-auto flex-shrink-0 rounded p-1 text-[#B0AAA2] hover:bg-[#F7F5F2]
                hover:text-[#111111] disabled:opacity-50"
            >
              <Trash2 size={12} />
            </button>
          )}
        </p>
        <p className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-[#111111]">
          {comment.body}
        </p>
      </div>
    </div>
  );
}

export default function NoteThread({
  thread,
  where,
  maySettle,
  onReply,
  onSettle,
  onDelete,
  onClose,
}: {
  thread: CommentThread;
  /** What this note is about, in the builder's own words. */
  where: string;
  maySettle: boolean;
  onReply: (body: string) => Promise<void>;
  onSettle: (resolved: boolean) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Escape closes, like every other overlay in the builder. Bound on the card
  // rather than the window so a thread inside a sheet doesn't close the sheet
  // too on the way past.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const el = box.current;
    el?.addEventListener('keydown', onKey);
    return () => el?.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={box}
      role="dialog"
      aria-label={`Note from ${thread.you ? 'you' : displayName(thread.by)} · ${where}`}
      className="w-[300px] overflow-hidden rounded-2xl border border-[#E8E4DF] bg-white
        shadow-[0_10px_34px_rgba(17,17,17,0.14)]"
    >
      <div className="flex items-center justify-between border-b border-[#F0EDE8] px-3 py-2">
        <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-[#6B6B6B]">
          <MapPin size={11} className="flex-shrink-0" />
          <span className="truncate">{where}</span>
        </span>
        <span className="flex flex-shrink-0 items-center gap-0.5">
          {/* Offered only to whoever raised it and the owner. Everyone else
              can reply — settling somebody else's point is not theirs. */}
          {maySettle && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(() => onSettle(!thread.resolved))}
              className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11.5px]
                text-[#6B6B6B] hover:bg-[#F7F5F2] hover:text-[#111111] disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" />
                : thread.resolved ? <RotateCcw size={12} /> : <Check size={12} />}
              {thread.resolved ? 'Reopen' : 'Resolve'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close this note"
            className="rounded-lg p-1 text-[#9B9B8F] hover:bg-[#F7F5F2] hover:text-[#111111]"
          >
            <X size={13} />
          </button>
        </span>
      </div>

      <div className="max-h-[280px] space-y-3 overflow-y-auto p-3">
        <Said
          comment={thread}
          busy={busy}
          onDelete={thread.you ? () => void act(() => onDelete(thread.id)) : null}
        />
        {thread.replies.length > 0 && (
          <div className="space-y-3 border-l border-[#F0EDE8] pl-2.5">
            {thread.replies.map(r => (
              <Said
                key={r.id}
                comment={r}
                busy={busy}
                onDelete={r.you ? () => void act(() => onDelete(r.id)) : null}
              />
            ))}
          </div>
        )}
        {thread.resolved && thread.resolvedBy && (
          <p className="text-[11px] text-[#9B9B8F]">
            Resolved by {thread.resolvedBy.name ?? displayName(thread.resolvedBy)}
          </p>
        )}
      </div>

      <form
        className="border-t border-[#F0EDE8] p-2.5"
        onSubmit={e => {
          e.preventDefault();
          const body = reply.trim();
          if (!body) return;
          void act(async () => {
            await onReply(body);
            setReply('');
          });
        }}
      >
        <label htmlFor={`reply-${thread.id}`} className="sr-only">Reply to this note</label>
        <textarea
          id={`reply-${thread.id}`}
          value={reply}
          onChange={e => setReply(e.target.value)}
          placeholder="Reply…"
          rows={2}
          maxLength={MAX_LENGTH}
          disabled={busy}
          className="w-full resize-none text-[12.5px]"
        />
        <div className="mt-1.5 flex justify-end">
          <button
            type="submit"
            disabled={busy || reply.trim().length === 0}
            className="rounded-lg bg-[#111111] px-2.5 py-1 text-[11.5px] font-medium text-white
              disabled:opacity-40"
          >
            Reply
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * The composer for a note that does not exist yet.
 *
 * Same silhouette as a thread, opening at the place just chosen, so leaving a
 * note and reading one feel like the same object rather than two features.
 */
export function NoteComposer({ where, onSubmit, onCancel }: {
  where: string;
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      role="dialog"
      aria-label={`New note · ${where}`}
      className="w-[300px] overflow-hidden rounded-2xl border border-[#E8E4DF] bg-white
        shadow-[0_10px_34px_rgba(17,17,17,0.14)]"
      onSubmit={e => {
        e.preventDefault();
        const text = body.trim();
        if (!text) return;
        setBusy(true);
        setError(null);
        onSubmit(text)
          .catch(err => setError(err instanceof Error ? err.message : "Couldn't leave that note."))
          .finally(() => setBusy(false));
      }}
    >
      <div className="flex items-center justify-between border-b border-[#F0EDE8] px-3 py-2">
        <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-[#6B6B6B]">
          <MapPin size={11} className="flex-shrink-0" />
          <span className="truncate">{where}</span>
        </span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel this note"
          className="rounded-lg p-1 text-[#9B9B8F] hover:bg-[#F7F5F2] hover:text-[#111111]"
        >
          <X size={13} />
        </button>
      </div>
      <div className="p-2.5">
        <label htmlFor="new-note" className="sr-only">Your note</label>
        <textarea
          id="new-note"
          value={body}
          onChange={e => { setBody(e.target.value); setError(null); }}
          placeholder="What about this?"
          rows={3}
          maxLength={MAX_LENGTH}
          autoFocus
          disabled={busy}
          className="w-full resize-none text-[12.5px]"
        />
        {error && <p className="mt-1.5 text-[11.5px] text-[#B45309]">{error}</p>}
        <div className="mt-2 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-2 py-1 text-[11.5px] text-[#6B6B6B] hover:text-[#111111]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || body.trim().length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#111111] px-2.5 py-1
              text-[11.5px] font-medium text-white disabled:opacity-40"
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            Leave note
          </button>
        </div>
      </div>
    </form>
  );
}
