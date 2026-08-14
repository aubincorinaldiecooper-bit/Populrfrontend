import { useState } from 'react';
import { X, Send, Check, Loader2, PenLine, Sparkles, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';
import Avatar from './Avatar';
import { platformMeta } from '../../lib/platformMeta';
import { useInboxQueue } from './useInboxQueue';
import { shortAgo } from '../../lib/timeAgo';
import type { InboxItem } from '../../lib/api';

/**
 * Inbox, without leaving what you were doing.
 *
 * The page still exists and still does long triage well. This is the other
 * half of the same thing: someone is talking to you while you're mid-build,
 * and the answer is usually one line. So it opens beside the canvas instead
 * of navigating away, shows who is waiting, and expands one conversation at
 * a time — replying is a focused act, not a spreadsheet.
 *
 * Same data, same endpoints, same send path as the page (useInboxQueue).
 * What differs is the shape: compact rows, and the roomier detail only for
 * the one you opened.
 *
 * It shows people the way the full Inbox does — a face, then their name —
 * because a creator recognising who is waiting should not depend on which
 * of the two surfaces they happen to be looking at. Anything longer than a
 * line belongs in the conversation, and every row offers the way there.
 */

export interface InboxDrawerProps {
  onClose: () => void;
  /** Called after a reply or a resolve, so a badge elsewhere can catch up. */
  onChanged?: () => void;
}

export default function InboxDrawer({ onClose, onChanged }: InboxDrawerProps) {
  const queue = useInboxQueue('needs_you');
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const openConversation = (item: InboxItem) => {
    const next = openId === item.id ? null : item.id;
    setOpenId(next);
    setDraft(next ? item.suggested_reply ?? '' : '');
  };

  const send = async (item: InboxItem, input: { text?: string; useSuggested?: boolean }) => {
    const ok = await queue.send(item, input);
    if (!ok) return;
    setOpenId(null);
    setDraft('');
    onChanged?.();
  };

  return (
    <aside
      className="flex h-full w-full flex-col bg-white"
      aria-label="Inbox"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#F0EDE8]">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[#111111]">Inbox</h2>
          <p className="text-[11px] text-[#8A857E]">People talking to you</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 -mr-1.5 rounded-lg text-[#6B6B6B] hover:bg-[#F7F5F2] hover:text-[#111111]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
          aria-label="Close inbox"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {queue.loading && (
          <p className="px-4 py-6 text-[12.5px] text-[#8A857E]">Loading conversations…</p>
        )}

        {!queue.loading && queue.error && (
          <div className="px-4 py-5">
            <p className="text-[12.5px] text-[#B4432F]">{queue.error}</p>
            <button
              type="button"
              onClick={queue.load}
              className="mt-2 text-[12px] font-medium text-[#111111] underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}

        {!queue.loading && !queue.error && queue.items.length === 0 && (
          <p className="px-4 py-6 text-[13px] text-[#8A857E]">
            Nobody's waiting on you right now.
          </p>
        )}

        {queue.items.map(item => {
          // Their name first, handle as the fallback — the same way the
          // conversation list names people.
          const person = item.contact_name?.trim()
            || (item.contact_handle ? `@${item.contact_handle}` : 'Someone');
          const open = openId === item.id;
          const busy = queue.sending === item.id;

          return (
            <div key={item.id} className={`border-b border-[#F4F1EC] ${open ? 'bg-[#FCFBF9]' : ''}`}>
              <button
                type="button"
                onClick={() => openConversation(item)}
                aria-expanded={open}
                className="flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors
                  hover:bg-[#FAF9F7] focus-visible:outline-none focus-visible:bg-[#FAF9F7]"
              >
                <Avatar
                  handle={item.contact_handle}
                  name={item.contact_name}
                  avatarUrl={item.contact_avatar_url}
                  platform={item.platform}
                  size="sm"
                  showPlatform
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[13px] font-medium text-[#111111] truncate">{person}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-[#B0AAA2]">
                      {shortAgo(item.created_at)}
                    </span>
                  </span>
                  <span className={`mt-0.5 block text-[12.5px] leading-snug text-[#6B6B6B]
                    ${open ? '' : 'line-clamp-2'}`}>
                    {item.message_text || `${platformMeta(item.platform).name} ${item.channel === 'dm' ? 'DM' : 'comment'}`}
                  </span>
                </span>
              </button>

              {open && (
                <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-1 duration-150">
                  {item.suggested_reply && (
                    <div className="rounded-xl bg-white border border-[#E8E4DF] px-3 py-2.5">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#8A857E]">
                        <Sparkles size={10} /> Suggested reply
                      </p>
                      <p className="mt-1 text-[12.5px] leading-snug text-[#111111]">{item.suggested_reply}</p>
                    </div>
                  )}

                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    rows={2}
                    aria-label={`Reply to ${person}`}
                    placeholder={`Reply to ${person}…`}
                    className="mt-2 w-full resize-y rounded-xl border border-[#E8E4DF] bg-white px-3 py-2
                      text-[13px] leading-snug text-[#111111] placeholder:text-[#B0AAA2]
                      focus:outline-none focus:ring-2 focus:ring-[#C5FF3D] focus:border-transparent"
                  />

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void send(item, { text: draft.trim() })}
                      disabled={!draft.trim() || busy}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#111111] px-3 py-1.5
                        text-[12px] font-medium text-white disabled:opacity-30
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
                    >
                      {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      Send
                    </button>
                    {item.suggested_reply && (
                      <button
                        type="button"
                        onClick={() => void send(item, { useSuggested: true })}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8E4DF]
                          bg-white px-2.5 py-1.5 text-[12px] text-[#111111] hover:border-[#D8D3CC]
                          disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2
                          focus-visible:ring-[#C5FF3D]"
                      >
                        <PenLine size={12} /> Send suggested
                      </button>
                    )}
                    {item.needs_reply && (
                      <button
                        type="button"
                        onClick={() => { void queue.resolve(item).then(() => onChanged?.()); }}
                        disabled={queue.resolving === item.id}
                        className="inline-flex items-center gap-1 text-[11.5px] text-[#8A857E]
                          hover:text-[#111111] disabled:opacity-50 focus-visible:outline-none
                          focus-visible:ring-2 focus-visible:ring-[#C5FF3D] rounded px-1"
                      >
                        {queue.resolving === item.id
                          ? <Loader2 size={11} className="animate-spin" />
                          : <Check size={11} />}
                        Mark handled
                      </button>
                    )}
                    {item.contact_id && (
                      // The drawer answers in one line. Anything longer is a
                      // conversation, and this is the door to it — the same
                      // person, opened in the full Inbox.
                      <Link
                        to={`/inbox?c=${item.contact_id}`}
                        onClick={onClose}
                        className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-[#8A857E]
                          hover:text-[#111111] focus-visible:outline-none focus-visible:ring-2
                          focus-visible:ring-[#C5FF3D] rounded px-1"
                      >
                        Open conversation <ArrowUpRight size={11} />
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* The page is still the place for a long session — this drawer is for
          the reply you can give without putting the build down. */}
      <Link
        to="/inbox"
        onClick={onClose}
        className="flex items-center justify-center gap-1.5 border-t border-[#F0EDE8] px-4 py-2.5
          text-[12px] text-[#6B6B6B] hover:text-[#111111] hover:bg-[#FAF9F7]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
      >
        Open full inbox <ArrowUpRight size={12} />
      </Link>
    </aside>
  );
}
