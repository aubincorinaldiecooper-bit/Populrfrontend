import { useEffect, useRef, useState } from 'react';
import { Sparkles, ArrowUp, PanelRightClose } from 'lucide-react';
import PairedRevolution from '../PairedRevolution';
import { NODE_LABEL, type FlowNode } from '../../lib/flowSchema';
import type { ChangeCard, HistoryEntry } from './useFlowBuilder';

/**
 * Ask Populr — the AI, as a collapsible side conversation.
 *
 * This used to be a floating composer parked over the bottom of the canvas:
 * always present, always costing attention, and one line tall so the
 * conversation it implied had nowhere to live. It is now a panel in the
 * builder's contextual side region, opened from a small launcher and closed
 * from its own header — available whenever the creator wants it, invisible
 * whenever they don't, and the canvas takes the width back the moment it
 * goes.
 *
 * The conversation is the builder's existing history, read as a chat: the
 * creator's request, then what Populr actually did, in its own words. Never
 * the operations themselves — those are machine language, and the canvas
 * already shows their effect.
 *
 * When a step is selected the panel says which one, because "make this
 * warmer" means something different with a Send selected than with nothing
 * selected — and the request is applied to that step, which is wiring that
 * already existed (compose sends the selection along).
 */

const SUGGESTIONS = [
  'DM someone when they comment a keyword',
  'Reply when someone responds to my story',
  'Follow up if someone doesn\'t respond',
  'Capture an email before sending a link',
];

export interface AIChatPanelProps {
  history: HistoryEntry[];
  composing: boolean;
  /** The latest request's outcome — carries the Undo affordance. */
  changeCard: ChangeCard | null;
  canUndo: boolean;
  aiConfigured: boolean;
  /** True when the canvas is empty — swaps in the first-run prompt. */
  empty: boolean;
  selectedNode: FlowNode | null;
  onSubmit: (prompt: string) => void;
  onUndo: () => void;
  onOpenHistory: () => void;
  onCollapse: () => void;
}

export default function AIChatPanel({
  history, composing, changeCard, canUndo, aiConfigured, empty, selectedNode,
  onSubmit, onUndo, onOpenHistory, onCollapse,
}: AIChatPanelProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Grow with the content instead of scrolling inside two lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [history.length, composing]);

  useEffect(() => {
    if (!composing) textareaRef.current?.focus();
  }, [composing]);

  const submit = () => {
    const prompt = value.trim();
    if (!prompt || composing) return;
    setValue('');
    onSubmit(prompt);
  };

  // Three states, three sentences — the same ones the composer always had,
  // so the field says what is happening rather than leaving a disabled box
  // and a spinning button to be read as a stall.
  const placeholder = composing
    ? 'Populr is building…'
    : selectedNode
      ? 'Ask Populr to change this step…'
      : 'Ask Populr to build or change anything…';

  return (
    <aside aria-label="Ask Populr" className="flex h-full w-full flex-col bg-white">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#F0EDE8]">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={15} className="shrink-0 text-[#8A857E]" aria-hidden />
          <h2 className="text-[15px] font-semibold text-[#111111]">Populr</h2>
          {composing && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[#8A857E]" role="status">
              <PairedRevolution size="sm" className="text-[#B0AAA2]" /> Working…
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onCollapse}
          title="Collapse chat"
          aria-label="Collapse AI"
          className="p-1.5 -mr-1.5 rounded-lg text-[#6B6B6B] hover:bg-[#F7F5F2] hover:text-[#111111]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
        >
          <PanelRightClose size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#FCFBF9]">
        {history.length === 0 && (
          empty ? (
            <div className="pt-6 text-center">
              <h3 className="text-[17px] font-semibold text-[#111111] tracking-tight">
                What should happen?
              </h3>
              <p className="mt-1.5 text-[12.5px] text-[#6B6B6B]">
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
          ) : (
            <p className="pt-2 text-[12.5px] leading-snug text-[#8A857E]">
              Ask for a change and it happens on the canvas — add a step, reword a message,
              retime a wait. Every reply is a real edit.
            </p>
          )
        )}

        {history.map((entry, index) => {
          const latest = index === history.length - 1;
          return (
            <div key={`${entry.at}-${index}`} className="space-y-2">
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[#111111] px-3 py-2
                  text-[13px] leading-snug text-white whitespace-pre-wrap break-words">
                  {entry.prompt}
                </p>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-[#E8E4DF] bg-white
                  px-3 py-2">
                  <p className="text-[13px] leading-snug text-[#111111] whitespace-pre-wrap break-words">
                    {entry.summary}
                  </p>
                  {/* The latest answer carries its own controls, the way the
                      old change card did — Undo while it's fresh, and the full
                      record behind a deliberate click. */}
                  {latest && changeCard && changeCard.touchedNodeIds.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-3">
                      {canUndo && (
                        <button
                          type="button"
                          onClick={onUndo}
                          className="text-[11.5px] font-medium text-[#111111] underline underline-offset-2
                            hover:text-[#4D7C0F] focus-visible:outline-none focus-visible:ring-2
                            focus-visible:ring-[#C5FF3D] rounded px-0.5"
                        >
                          Undo
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={onOpenHistory}
                        className="text-[11.5px] text-[#6B6B6B] hover:text-[#111111]
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]
                          rounded px-0.5"
                      >
                        View changes
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {composing && (
          <div className="flex items-center gap-2 text-[11.5px] text-[#8A857E]" role="status">
            <PairedRevolution size="sm" className="text-[#B0AAA2]" /> Populr is working on it…
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[#F0EDE8] p-3">
        {selectedNode && (
          <div className="mb-1.5 px-0.5">
            {/* Which step the next request lands on. Subtle on purpose: it is
                context, not a warning — deselect the step to talk about the
                whole automation again. */}
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F4F2EE]
              px-2 py-0.5 text-[10.5px] font-medium text-[#6B6B6B]">
              Editing: {NODE_LABEL[selectedNode.type]}
            </span>
          </div>
        )}

        <div className="flex items-end gap-2 rounded-2xl border border-[#E8E4DF] bg-white px-3 py-2
          focus-within:border-[#C5FF3D]">
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
            className="flex-1 resize-none bg-transparent py-0.5 text-[13px] leading-relaxed
              text-[#111111] placeholder:text-[#B0AAA2] focus:outline-none disabled:opacity-60"
            aria-label={placeholder}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim() || composing}
            aria-label="Send"
            className="mb-0.5 shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full
              bg-[#111111] text-white transition-opacity disabled:opacity-25
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
          >
            {composing ? <PairedRevolution size="sm" /> : <ArrowUp size={13} />}
          </button>
        </div>

        {!aiConfigured && (
          <p className="mt-1.5 text-[11px] text-[#8A857E]">
            Populr understands common requests here; full AI composing isn't switched on for this workspace.
          </p>
        )}
      </div>
    </aside>
  );
}
