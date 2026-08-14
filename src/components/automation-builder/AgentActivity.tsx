import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import PairedRevolution from '../PairedRevolution';

/**
 * What Populr is doing, while it does it — and what it did, once it has.
 *
 * Composing takes a few seconds of someone else's computer thinking. A still
 * canvas and a spinner inside a button read as nothing happening, so this says
 * who is working. It replaced a full-canvas dimmed overlay: greying out the
 * automation to announce that the automation is being worked on hid the one
 * thing worth watching.
 *
 * There is no progress bar. The compose endpoint answers once, so a bar that
 * filled at a made-up rate would be a promise about a duration Populr doesn't
 * know. Elapsed seconds are the honest gauge — past a few, it says so, and a
 * slow build reads as slow rather than as broken.
 *
 * Afterwards it lists what actually changed, one line at a time, and gets out
 * of the way. Those lines come from the operations the server validated,
 * applied and saved — never from a proposal in flight — so nothing here can
 * claim a change that didn't happen.
 */

export interface AgentActivityProps {
  /** True while the request is out. */
  composing: boolean;
  /** First build on an empty canvas, versus changing something that exists. */
  building: boolean;
  /** What changed, once it has. Empty while composing. */
  lines: string[];
  /** Dismissed when the reveal has finished and been read. */
  onDone: () => void;
}

/** Between lines. Fast enough to feel like a list, slow enough to be one. */
const LINE_MS = 220;
/** How long the finished list stays before it gets out of the way. */
const LINGER_MS = 3200;

export default function AgentActivity({ composing, building, lines, onDone }: AgentActivityProps) {
  const reduceMotion = useReducedMotion();
  const [startedAt] = useState(() => Date.now());
  const [seconds, setSeconds] = useState(0);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!composing) return;
    const update = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [composing, startedAt]);

  // How much of the list is on screen. Someone who asked for reduced motion
  // gets all of it at once — the sequence is decoration, the list is the
  // information — which is a fact about the current state, not something to
  // set in an effect.
  const revealed = reduceMotion ? lines.length : shown;

  useEffect(() => {
    if (composing || reduceMotion || shown >= lines.length) return;
    const timer = setTimeout(() => setShown(n => n + 1), LINE_MS);
    return () => clearTimeout(timer);
  }, [composing, lines.length, shown, reduceMotion]);

  // Gone once it has been read. Not sticky: this is a report of something that
  // already finished, and the canvas behind it is the actual result.
  useEffect(() => {
    if (composing || !lines.length || revealed < lines.length) return;
    const timer = setTimeout(onDone, LINGER_MS);
    return () => clearTimeout(timer);
  }, [composing, lines.length, revealed, onDone]);

  const elapsed = seconds < 7
    ? null
    : seconds < 16
      ? `Still going — ${seconds}s`
      : `Nearly there — ${seconds}s. Automations with a few parts take longer.`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute left-4 bottom-5 z-20 w-[248px] rounded-xl border
        border-[#E8E4DF] bg-white/95 px-3.5 py-3 shadow-[0_4px_18px_rgba(17,17,17,0.07)]
        animate-in fade-in slide-in-from-bottom-1 duration-200"
    >
      <div className="flex items-center gap-2">
        {composing
          ? <PairedRevolution size="sm" className="shrink-0 text-[#111111]" />
          : <Check size={14} className="shrink-0 text-[#4D7C0F]" />}
        <p className="text-[12.5px] font-medium text-[#111111]">
          {composing
            ? (building ? 'Populr is building your automation' : 'Populr is making that change')
            : (building ? 'Populr built your automation' : 'Populr made that change')}
        </p>
      </div>

      {composing && elapsed && (
        <p className="mt-1 pl-6 text-[11px] text-[#8A857E]">{elapsed}</p>
      )}

      {!composing && lines.length > 0 && (
        <ul className="mt-2 space-y-1">
          {lines.slice(0, revealed).map((line, i) => (
            <li
              key={`${i}-${line}`}
              className="flex items-start gap-1.5 text-[11.5px] leading-snug text-[#6B6B6B]
                motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-1
                motion-safe:duration-200"
            >
              <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#C5FF3D]" />
              {line}
            </li>
          ))}
          {revealed >= lines.length && (
            <li className="pl-2.5 pt-0.5 text-[11.5px] font-medium text-[#111111]">Done</li>
          )}
        </ul>
      )}
    </div>
  );
}
