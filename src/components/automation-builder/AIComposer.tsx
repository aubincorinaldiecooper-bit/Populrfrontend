import { useEffect, useRef, useState } from 'react';
import { Sparkles, ArrowUp, Check, X, History, AlertCircle } from 'lucide-react';
import PairedRevolution from '../PairedRevolution';
import { NODE_LABEL, type FlowNode } from '../../lib/flowSchema';
import type { ChangeCard } from './useFlowBuilder';

/**
 * The AI composer — the primary way an automation gets built or changed.
 *
 * Floating, bottom-centre, one line tall until it needs to be more. It is not
 * a panel and not a chat: a permanently open conversation would compete with
 * the canvas for the creator's attention, and the canvas is the thing they are
 * actually working on. History exists, but behind a deliberate click.
 *
 * When a step is selected the composer says so and narrows its placeholder,
 * because "make this 3 days" means something different with a Wait selected
 * than with nothing selected — and the creator should be able to see which
 * they're about to get.
 */

const SUGGESTIONS = [
  'DM someone when they comment a keyword',
  'Reply when someone responds to my story',
  'Follow up if someone doesn\'t respond',
  'Capture an email before sending a link',
];

export interface AIComposerProps {
  selectedNode: FlowNode | null;
  composing: boolean;
  changeCard: ChangeCard | null;
  canUndo: boolean;
  aiConfigured: boolean;
  /** True when the canvas is empty — swaps in the centred first-run prompt. */
  empty: boolean;
  historyCount: number;
  /** Pixels of panel occupying the left edge, so the composer can stay clear
   *  of it instead of floating over the controls it covers. */
  insetLeft?: number;
  onSubmit: (prompt: string) => void;
  onUndo: () => void;
  onDismissCard: () => void;
  onOpenHistory: () => void;
}

export default function AIComposer({
  selectedNode, composing, changeCard, canUndo, aiConfigured, empty,
  historyCount, insetLeft = 0, onSubmit, onUndo, onDismissCard, onOpenHistory,
}: AIComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow with the content instead of scrolling inside two lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  // The change card is transient by design — it reports what happened and gets
  // out of the way. Undo stays reachable from the history drawer afterwards,
  // so dismissing this is never destructive.
  useEffect(() => {
    if (!changeCard) return;
    const timer = setTimeout(onDismissCard, 7000);
    return () => clearTimeout(timer);
  }, [changeCard, onDismissCard]);

  const submit = () => {
    const prompt = value.trim();
    if (!prompt || composing) return;
    setValue('');
    onSubmit(prompt);
  };

  // Three states, three sentences. The field is where the creator's attention
  // already is, so it says what is happening rather than leaving a disabled
  // box and a spinning button to be read as a stall.
  const placeholder = composing
    ? 'Populr is building…'
    : selectedNode
      ? 'Ask Populr to change this step…'
      : 'Ask Populr to build or change anything…';

  return (
    <div
      className="pointer-events-none absolute right-0 bottom-0 z-30 flex flex-col items-center
        px-4 pb-5 transition-[left] duration-150"
      // Below the inspector's own breakpoint the panel overlays the canvas
      // entirely, so shifting would push the composer off screen; there it
      // stays centred and the inspector's bottom padding does the work.
      style={{ left: typeof window !== 'undefined' && window.innerWidth < 640 ? 0 : insetLeft }}
    >
      {empty && !changeCard && (
        <div className="pointer-events-auto mb-5 text-center max-w-md">
          <h2 className="text-[22px] font-semibold text-[#111111] tracking-tight">
            What should happen?
          </h2>
          <p className="mt-1.5 text-[13px] text-[#6B6B6B]">
            Describe it in your own words. Populr builds the steps.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => { setValue(s); textareaRef.current?.focus(); }}
                className="rounded-full border border-[#E8E4DF] bg-white px-3 py-1.5 text-[12px]
                  text-[#6B6B6B] hover:border-[#C5FF3D] hover:text-[#111111] transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {changeCard && (
        <div
          className="pointer-events-auto mb-2.5 w-full max-w-[680px] rounded-xl border border-[#E8E4DF]
            bg-white px-3.5 py-2.5 shadow-[0_4px_16px_rgba(17,17,17,0.07)]
            flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-1 duration-200"
          role="status"
        >
          {changeCard.touchedNodeIds.length > 0
            ? <Check size={15} className="mt-0.5 shrink-0 text-[#4D7C0F]" />
            : <AlertCircle size={15} className="mt-0.5 shrink-0 text-[#8A857E]" />}
          <p className="flex-1 text-[12.5px] leading-snug text-[#111111]">{changeCard.summary}</p>
          {canUndo && changeCard.touchedNodeIds.length > 0 && (
            <button
              type="button"
              onClick={onUndo}
              className="shrink-0 text-[12px] font-medium text-[#111111] underline underline-offset-2
                hover:text-[#4D7C0F] focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-[#C5FF3D] rounded px-0.5"
            >
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={onOpenHistory}
            className="shrink-0 text-[12px] text-[#6B6B6B] hover:text-[#111111]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D] rounded px-0.5"
          >
            View changes
          </button>
          <button
            type="button"
            onClick={onDismissCard}
            className="shrink-0 -mr-1 p-0.5 rounded text-[#B0AAA2] hover:text-[#111111]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div
        className="pointer-events-auto w-full max-w-[680px] rounded-2xl border border-[#E8E4DF]
          bg-white shadow-[0_6px_24px_rgba(17,17,17,0.08)] transition-shadow
          focus-within:border-[#C5FF3D] focus-within:shadow-[0_6px_28px_rgba(17,17,17,0.10)]"
      >
        {selectedNode && (
          <div className="flex items-center gap-1.5 px-3.5 pt-2.5 -mb-0.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F4F2EE]
              px-2 py-0.5 text-[10.5px] font-medium text-[#6B6B6B]">
              Editing: {NODE_LABEL[selectedNode.type]}
            </span>
          </div>
        )}

        <div className="flex items-end gap-2 px-3 py-2.5">
          <Sparkles size={16} className="mb-1.5 shrink-0 text-[#8A857E]" />
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              // Enter sends; Shift+Enter is a newline. Matches every
              // conversational UI a creator has already learned.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={placeholder}
            disabled={composing}
            className="flex-1 resize-none bg-transparent py-1 text-[13.5px] leading-relaxed
              text-[#111111] placeholder:text-[#B0AAA2] focus:outline-none disabled:opacity-60"
            aria-label={placeholder}
          />

          {historyCount > 0 && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="mb-0.5 shrink-0 p-1.5 rounded-lg text-[#8A857E] hover:bg-[#F7F5F2]
                hover:text-[#111111] focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-[#C5FF3D]"
              aria-label="Show recent changes"
              title="Recent changes"
            >
              <History size={15} />
            </button>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!value.trim() || composing}
            className="mb-0.5 shrink-0 w-8 h-8 rounded-lg bg-[#111111] text-white flex items-center
              justify-center transition-opacity disabled:opacity-25 disabled:cursor-not-allowed
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]
              focus-visible:ring-offset-1"
            aria-label="Send"
          >
            {composing ? <PairedRevolution size="sm" /> : <ArrowUp size={15} />}
          </button>
        </div>
      </div>

      {!aiConfigured && (
        <p className="pointer-events-none mt-2 text-[11px] text-[#8A857E]">
          Populr understands common requests here; full AI composing isn't switched on for this workspace.
        </p>
      )}
    </div>
  );
}
