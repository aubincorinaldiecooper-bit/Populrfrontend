import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Send, Loader2, Zap } from 'lucide-react';
import Avatar from './Avatar';
import { platformMeta } from '../../lib/platformMeta';
import { timeAgo } from '../../lib/timeAgo';
import type { ContactDetail, ContactMessage } from '../../lib/api';

/**
 * The conversation — the primary experience on this page.
 *
 * Bubbles rather than rows, because this is a conversation with a person and
 * the previous list-of-records framing made it read as case notes. Inbound
 * takes a soft neutral surface, outbound takes Populr's charcoal: the same
 * two-weight distinction the rest of the product uses for "them" and "you",
 * and no new colour is introduced to say it.
 *
 * The identity block at the top is a button, which is the whole point of this
 * pass — the person you are talking to is one click from who they are. It
 * opens Populr's own Contact, not their Instagram; the external profile is a
 * deliberate second action inside the panel, where it can be labelled.
 */

export interface ConversationThreadProps {
  detail: ContactDetail;
  loading: boolean;
  sending: boolean;
  /** True while the contact panel is open, so the header can show it pressed. */
  contactOpen: boolean;
  onOpenContact: () => void;
  onSend: (text: string) => Promise<boolean>;
  /** Null when this thread has nothing to reply through. */
  replyTarget: string | null;
}

/** A message, plus whether it was Populr's automation talking. */
interface Turn {
  message: ContactMessage;
  /** The automation that sent it, when one did. */
  automation: string | null;
}

/**
 * Delivery, only where the provider actually told us.
 *
 * `sent` is our own record of having handed the message over and says nothing
 * about arrival, so it shows nothing. Anything else would be a status invented
 * to fill a gap, which is worse than an empty space.
 */
function deliveryLabel(status: string): string | null {
  if (status === 'delivered') return 'Delivered';
  if (status === 'read') return 'Seen';
  if (status === 'failed') return 'Not delivered';
  return null;
}

function MessageBubble({ turn, name }: { turn: Turn; name: string }) {
  const { message } = turn;
  const outbound = message.direction === 'outbound';
  const delivery = outbound ? deliveryLabel(message.status) : null;

  return (
    <li className={`flex flex-col ${outbound ? 'items-end' : 'items-start'}`}>
      {turn.automation && (
        // The automation participated. Said quietly, once, above the message
        // it sent — not as an execution log with run ids in it.
        <span className="flex items-center gap-1 mb-1 px-1 text-[10.5px] text-[#8A857E]">
          <Zap size={10} className="text-[#8A857E]" />
          Populr · {turn.automation}
        </span>
      )}
      <div
        className={`max-w-[76%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-[1.45]
          whitespace-pre-wrap break-words
          ${outbound
            ? 'bg-[#111111] text-white rounded-br-md'
            : 'bg-[#F4F1EC] text-[#111111] rounded-bl-md'}`}
      >
        {message.text?.trim() || (message.media_url ? 'Sent an attachment' : '—')}
      </div>
      <span className="mt-1 px-1 text-[10.5px] text-[#9B9B8F]">
        {timeAgo(message.created_at)}
        {delivery && <span className="ml-1.5">· {delivery}</span>}
        {!outbound && <span className="sr-only"> from {name}</span>}
      </span>
    </li>
  );
}

export default function ConversationThread({
  detail, loading, sending, contactOpen, onOpenContact, onSend, replyTarget,
}: ConversationThreadProps) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const contact = detail.contact;
  const display = contact.name?.trim() || `@${contact.handle ?? 'someone'}`;

  // Oldest at the top, like every conversation anyone has ever read. The API
  // returns newest first because that is what a timeline wants.
  const turns: Turn[] = useMemo(() => {
    const automationById = new Map(detail.automations.map(a => [a.id, a.name]));
    return [...detail.messages]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(message => ({
        message,
        automation: message.direction === 'outbound' && message.source_automation_id
          ? automationById.get(message.source_automation_id) ?? 'an automation'
          : null,
      }));
  }, [detail.messages, detail.automations]);

  // Land at the newest message, the way opening a chat does. Instant, not
  // animated: the brief asks for restraint, and a scroll animation on every
  // conversation you click is the opposite of that.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [contact.id, turns.length]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const ok = await onSend(text);
    if (ok) setDraft('');
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      {/* ------------------------------------------------------------ header */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-[#EFECE6]">
        <button
          type="button"
          onClick={onOpenContact}
          aria-expanded={contactOpen}
          aria-label={`About ${display}`}
          className={`group flex items-center gap-2.5 min-w-0 rounded-xl px-2 py-1 -mx-2
            transition-colors focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-chartreuse
            ${contactOpen ? 'bg-[#F4F1EC]' : 'hover:bg-[#FAF9F7]'}`}
        >
          <Avatar
            handle={contact.handle} name={contact.name} avatarUrl={contact.avatar_url}
            platform={contact.platform} size="md"
          />
          <span className="min-w-0 text-left">
            <span className="block truncate text-[14px] font-semibold text-[#111111]">
              {display}
            </span>
            <span className="block text-[11.5px] text-[#8A857E]">
              {platformMeta(contact.platform).name}
            </span>
          </span>
          <ChevronRight
            size={16}
            className={`shrink-0 text-[#B0AAA2] transition-transform group-hover:text-[#6B6B6B]
              ${contactOpen ? 'rotate-90' : ''}`}
          />
        </button>
      </div>

      {/* ---------------------------------------------------------- messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="text-[12.5px] text-[#8A857E]">Loading the conversation…</p>
        ) : turns.length === 0 ? (
          <p className="text-[12.5px] text-[#8A857E]">No messages on this conversation yet.</p>
        ) : (
          <ul className="flex flex-col gap-3.5">
            {turns.map(turn => (
              <MessageBubble key={turn.message.id} turn={turn} name={display} />
            ))}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      {/* ---------------------------------------------------------- composer */}
      <div className="shrink-0 border-t border-[#EFECE6] px-3 py-3">
        {replyTarget === null ? (
          <p className="px-1 text-[11.5px] text-[#8A857E]">
            There's nothing to reply to here yet — Populr replies in the thread their
            last message came from.
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                // Enter sends, Shift+Enter is a newline — the convention every
                // messaging product has already taught the creator.
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); }
              }}
              rows={1}
              placeholder={`Message ${display}…`}
              aria-label={`Message ${display}`}
              disabled={sending}
              className="flex-1 resize-none bg-[#FAF9F7] border border-[#EFECE6] rounded-2xl
                px-3.5 py-2.5 text-[13.5px] leading-snug placeholder:text-[#B0AAA2]
                focus:outline-none focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20
                transition-colors disabled:opacity-60"
            />
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim() || sending}
              aria-label="Send"
              className="shrink-0 mb-0.5 h-9 w-9 rounded-full bg-[#111111] text-white
                flex items-center justify-center transition-opacity disabled:opacity-25
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chartreuse
                focus-visible:ring-offset-1"
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
