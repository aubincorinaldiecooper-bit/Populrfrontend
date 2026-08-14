import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ArrowUp, RotateCcw } from 'lucide-react';
import PairedRevolution from '../PairedRevolution';
import { readTrigger, triggerNodes, type FlowGraph } from '../../lib/flowSchema';
import { buildConversation, type PreviewItem } from '../../lib/previewConversation';
import type { FlowSimulationResult } from '../../lib/api';

/**
 * Preview: the automation as the person on the other end will meet it.
 *
 * This used to be "Test" — a channel toggle, a "They say" field and a Start
 * button, which is a QA tool's shape. A creator's question isn't "does step
 * four execute", it's "what is this like to receive", and the honest way to
 * answer that is to show the conversation.
 *
 * The creator plays the fan: what they type IS the trigger, and when the
 * automation asks "did they reply?" they answer it by replying, or by
 * declining to. Underneath it is the same simulation endpoint as before,
 * running the real executors with sending switched off — so what appears here
 * is produced by the code that will run live, and nothing leaves Populr.
 */

const FAN = '@yourfan';

export interface PreviewPanelProps {
  graph: FlowGraph;
  /** "Instagram" — names the surface the DM opens on. */
  platformLabel: string | null;
  running: boolean;
  onRun: (input: {
    channel: 'comment' | 'dm'; text: string; replied: boolean;
  }) => Promise<FlowSimulationResult | null>;
  onReset: () => void;
  onClose: () => void;
}

export default function PreviewPanel({
  graph, platformLabel, running, onRun, onReset, onClose,
}: PreviewPanelProps) {
  const [draft, setDraft] = useState('');
  const [sentText, setSentText] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string | null>(null);
  /** They chose to let the reply window lapse rather than answer. */
  const [declinedReply, setDeclinedReply] = useState(false);
  const [result, setResult] = useState<FlowSimulationResult | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const trigger = triggerNodes(graph)[0] ?? null;
  const channel: 'comment' | 'dm' = trigger && readTrigger(trigger).kind === 'dm' ? 'dm' : 'comment';

  const conversation = useMemo(() => {
    if (!result || sentText === null) return { items: [] as PreviewItem[], awaitingReply: false };
    return buildConversation({
      graph,
      result,
      channel,
      triggerText: sentText,
      replyText,
      // Only hold the first time through. Once they've answered — either with
      // a reply or by declining one — the rest plays out.
      pauseAtReplyCheck: replyText === null && !declinedReply,
    });
  }, [graph, result, channel, sentText, replyText, declinedReply]);

  // The fan's own message shows the moment it's sent; waiting for the round
  // trip to render what they just typed would feel like a broken chat.
  const items: PreviewItem[] = result
    ? conversation.items
    : sentText !== null
      ? [{ id: 'trigger', kind: channel === 'comment' ? 'comment' : 'incoming', text: sentText }]
      : [];

  const awaitingReply = conversation.awaitingReply;
  const started = sentText !== null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [items.length, running]);

  useEffect(() => {
    if (!running) inputRef.current?.focus();
  }, [running]);

  const send = async () => {
    const text = draft.trim();
    if (!text || running || !trigger) return;
    setDraft('');

    if (awaitingReply) {
      setReplyText(text);
      setResult(await onRun({ channel, text: sentText ?? '', replied: true }));
      return;
    }

    // Anything typed after the automation has finished starts a fresh one —
    // the same way sending a new message to an account starts a new thread.
    setSentText(text);
    setReplyText(null);
    setDeclinedReply(false);
    setResult(null);
    setResult(await onRun({ channel, text, replied: false }));
  };

  const startOver = () => {
    setSentText(null);
    setReplyText(null);
    setDeclinedReply(false);
    setResult(null);
    setDraft('');
    onReset();
    inputRef.current?.focus();
  };

  const placeholder = awaitingReply
    ? `Reply as ${FAN}…`
    : !started && channel === 'comment'
      ? 'Comment as a fan…'
      : `Message ${FAN}…`;

  return (
    <aside
      className="flex h-full w-full flex-col bg-white"
      aria-label="Preview"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#F0EDE8]">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[#111111]">Preview</h2>
          {/* Small on purpose. It has to be true and findable, not loud — a
              banner across the top would undercut the thing being previewed. */}
          <p className="text-[11px] text-[#8A857E]">Nothing is sent</p>
        </div>
        <div className="flex items-center gap-1">
          {started && (
            <button
              type="button"
              onClick={startOver}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] text-[#6B6B6B]
                hover:bg-[#F7F5F2] hover:text-[#111111] focus-visible:outline-none
                focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
            >
              <RotateCcw size={12} /> Start over
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-lg text-[#6B6B6B] hover:bg-[#F7F5F2] hover:text-[#111111]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
            aria-label="Close preview"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-[#F0EDE8]">
        <span
          aria-hidden="true"
          className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E8E4DF] to-[#D8D3CC]"
        />
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-[#111111]">{FAN}</span>
          <span className="block text-[11px] text-[#8A857E]">Active now</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 bg-[#FCFBF9]">
        {!trigger && (
          <p className="text-[12.5px] text-[#8A857E]">
            Add a When step first — Populr needs to know what starts this.
          </p>
        )}

        {trigger && !started && (
          <p className="text-[12.5px] leading-snug text-[#8A857E]">
            {channel === 'comment'
              ? 'Write what a fan might comment, and watch what they’d get.'
              : 'Write what a fan might send you, and watch what they’d get.'}
          </p>
        )}

        {items.map((item, index) => (
          <Bubble
            key={item.id}
            item={item}
            index={index}
            platformLabel={platformLabel}
            openedDm={index > 0 && items[index - 1].kind === 'comment' && item.kind === 'outgoing'}
            delivered={item.kind === 'outgoing' && items[index + 1]?.kind !== 'outgoing'}
          />
        ))}

        {running && (
          <div className="flex items-center gap-2 text-[11.5px] text-[#8A857E]" role="status">
            <PairedRevolution size="sm" className="text-[#B0AAA2]" /> Working out what happens next…
          </div>
        )}

        {awaitingReply && !running && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setDeclinedReply(true)}
              className="text-[11.5px] text-[#8A857E] underline underline-offset-2 hover:text-[#111111]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D] rounded px-1"
            >
              Continue without reply
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[#F0EDE8] p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-[#E8E4DF] bg-white px-3 py-2
          focus-within:border-[#C5FF3D]">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            disabled={!trigger}
            placeholder={placeholder}
            aria-label={placeholder}
            className="flex-1 resize-none bg-transparent text-[13px] text-[#111111] leading-snug
              placeholder:text-[#B0AAA2] focus:outline-none max-h-24 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!draft.trim() || running || !trigger}
            aria-label="Send"
            className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full
              bg-[#111111] text-white disabled:opacity-30 focus-visible:outline-none
              focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
          >
            {running ? <PairedRevolution size="sm" /> : <ArrowUp size={13} />}
          </button>
        </div>
      </div>
    </aside>
  );
}

/**
 * One line of the conversation.
 *
 * The stagger is a CSS delay rather than a timer: the messages still arrive
 * one after another, but everything is in the document from the first paint,
 * so nothing depends on how long a creator waits — and reduced-motion
 * settings flatten it automatically (see index.css).
 */
function Bubble({
  item, index, platformLabel, openedDm, delivered,
}: {
  item: PreviewItem;
  index: number;
  platformLabel: string | null;
  openedDm: boolean;
  delivered: boolean;
}) {
  const enter = 'animate-in fade-in slide-in-from-bottom-1 duration-200';
  const delay = { animationDelay: `${Math.min(index, 8) * 90}ms` };

  if (item.kind === 'comment') {
    return (
      <div style={delay} className={enter}>
        <div className="rounded-xl border border-[#E8E4DF] bg-white px-3 py-2.5">
          <p className="text-[11px] text-[#8A857E]">{FAN} commented on your post</p>
          <p className="mt-1 text-[13px] text-[#111111] whitespace-pre-wrap break-words">“{item.text}”</p>
        </div>
      </div>
    );
  }

  if (item.kind === 'incoming') {
    return (
      <div style={delay} className={`${enter} flex justify-start`}>
        <p className="max-w-[80%] rounded-2xl rounded-bl-md border border-[#E8E4DF] bg-white px-3 py-2
          text-[13px] leading-snug text-[#111111] whitespace-pre-wrap break-words">
          {item.text}
        </p>
      </div>
    );
  }

  if (item.kind === 'outgoing') {
    return (
      <div style={delay} className={enter}>
        {openedDm && (
          <p className="mb-2.5 text-center text-[10.5px] uppercase tracking-wide text-[#B0AAA2]">
            {platformLabel ? `${platformLabel} DM` : 'Direct message'}
          </p>
        )}
        <div className="flex justify-end">
          <p className={`max-w-[80%] rounded-2xl rounded-br-md px-3 py-2 text-[13px] leading-snug
            whitespace-pre-wrap break-words
            ${item.problem ? 'bg-[#F3F1EE] text-[#6B6B6B]' : 'bg-[#111111] text-white'}`}>
            {item.text}
          </p>
        </div>
        {item.problem ? (
          <p className="mt-1 text-right text-[10.5px] text-[#B4432F]">{item.problem}</p>
        ) : delivered ? (
          <p className="mt-1 text-right text-[10.5px] text-[#B0AAA2]">Delivered</p>
        ) : null}
      </div>
    );
  }

  if (item.kind === 'public_reply') {
    return (
      <div style={delay} className={enter}>
        <div className={`rounded-xl border px-3 py-2.5
          ${item.problem ? 'border-[#E8E4DF] bg-[#F7F5F2]' : 'border-[#E8E4DF] bg-white'}`}>
          <p className="text-[11px] text-[#8A857E]">Public reply under the comment</p>
          <p className={`mt-1 text-[13px] whitespace-pre-wrap break-words
            ${item.problem ? 'text-[#6B6B6B]' : 'text-[#111111]'}`}>
            {item.text}
          </p>
          {item.problem && <p className="mt-1 text-[10.5px] text-[#B4432F]">{item.problem}</p>}
        </div>
      </div>
    );
  }

  if (item.kind === 'separator') {
    return (
      <div style={delay} className={`${enter} flex items-center gap-3 py-1`}>
        <span className="flex-1 h-px bg-[#E8E4DF]" />
        <span className="text-[10.5px] uppercase tracking-wide text-[#B0AAA2]">{item.text}</span>
        <span className="flex-1 h-px bg-[#E8E4DF]" />
      </div>
    );
  }

  if (item.kind === 'note') {
    return (
      <p style={delay} className={`${enter} text-center text-[11px] text-[#B0AAA2]`}>
        {item.text}
      </p>
    );
  }

  return (
    <div style={delay} className={`${enter} rounded-xl border border-[#F0D9A8] bg-[#FEF7E6] px-3 py-2.5`}>
      <p className="text-[12.5px] leading-snug text-[#7A5A12]">{item.text}</p>
    </div>
  );
}
