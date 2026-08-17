import { useEffect, useRef } from 'react';
import { ArrowUp } from 'lucide-react';
import PairedRevolution from '../PairedRevolution';

interface PopulrAIComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  working: boolean;
  contextLabel?: string;
  aiConfigured: boolean;
  /** Bumped to pull focus into the input (Change something). */
  focusSignal?: number;
}

/** Populr's intentionally small, responsive prompt bar. */
export default function PopulrAIComposer({
  value, onChange, onSubmit, working, contextLabel, aiConfigured, focusSignal,
}: PopulrAIComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const placeholder = working
    ? 'Populr is building…'
    : contextLabel
      ? 'Ask Populr to change this step…'
      : 'Ask Populr to build or change anything…';

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [value]);

  useEffect(() => { if (!working) ref.current?.focus(); }, [working]);
  // "Change something" on a draft puts the creator straight back in the
  // conversation — the input is where the revising happens.
  useEffect(() => { if (focusSignal) ref.current?.focus(); }, [focusSignal]);

  return (
    <div className="border-t border-[#F0EDE8] bg-white p-3">
      {contextLabel && (
        <p className="mb-2 px-1 text-[11px] font-medium text-[#111111]">{`Editing: ${contextLabel}`}</p>
      )}
      <div className="rounded-2xl border border-[#DEDAD4] bg-white p-2.5 shadow-[0_3px_14px_rgba(17,17,17,0.05)] transition focus-within:border-[#B8EF35] focus-within:shadow-[0_4px_18px_rgba(17,17,17,0.08)]">
        <textarea
          ref={ref}
          value={value}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          rows={1}
          placeholder={placeholder}
          disabled={working}
          aria-label={placeholder}
          className="block w-full resize-none bg-transparent px-1 pb-2 text-[13.5px] leading-relaxed text-[#111111] placeholder:text-[#A39E97] focus:outline-none focus:ring-0 disabled:opacity-60"
        />
        <div className="flex justify-end">
          <button type="button" onClick={onSubmit} disabled={!value.trim() || working} aria-label="Send"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#111111] text-white transition hover:bg-[#292929] disabled:opacity-25 focus-visible:ring-[#C5FF3D]">
            {working ? <PairedRevolution size="sm" /> : <ArrowUp size={15} />}
          </button>
        </div>
      </div>
      {!aiConfigured && <p className="mt-1.5 px-1 text-[11px] text-[#8A857E]">Populr understands common requests. Full AI composing isn't turned on here yet.</p>}
    </div>
  );
}
