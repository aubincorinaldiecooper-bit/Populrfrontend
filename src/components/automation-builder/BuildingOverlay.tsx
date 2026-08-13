import { useEffect, useState } from 'react';
import PairedRevolution from '../PairedRevolution';

/**
 * What the canvas shows while Populr is building the automation.
 *
 * Composing takes a few seconds — long enough that a still canvas and a
 * spinner inside a button read as nothing happening. This says who is working
 * and for how long, which is the honest version of progress here: the compose
 * endpoint answers once, so there is no percentage to report, and inventing a
 * bar that fills at a made-up rate would be a promise about a duration Populr
 * doesn't know.
 *
 * Elapsed time is the gauge instead. Past a few seconds it says so, so a slow
 * one reads as slow rather than as broken.
 */

export interface BuildingOverlayProps {
  /** First build on an empty canvas, versus changing something that exists. */
  building: boolean;
}

export default function BuildingOverlay({ building }: BuildingOverlayProps) {
  // Mounted exactly when composing starts and unmounted when it ends, so its
  // own mount time is the start — no clock to thread down from the page.
  const [startedAt] = useState(() => Date.now());
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const update = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const status =
    seconds < 7
      ? building ? 'Working out the steps…' : 'Working out the change…'
      : seconds < 16
        ? `Still going — ${seconds}s`
        : `Nearly there — ${seconds}s. Automations with a few parts take longer.`;

  return (
    // Over the canvas but never in the way: the inspector and the side panels
    // sit above it, and nothing here can swallow a click.
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none
      bg-[#F7F5F2]/70 animate-in fade-in duration-200">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3.5 rounded-2xl border border-[#E8E4DF] bg-white
          px-5 py-4 shadow-[0_10px_32px_rgba(17,17,17,0.10)]"
      >
        <PairedRevolution size="md" className="text-[#111111] shrink-0" />
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-[#111111]">
            {building ? 'Populr is building your automation' : 'Populr is making that change'}
          </p>
          <p className="mt-0.5 text-[11.5px] text-[#8A857E]">{status}</p>
        </div>
      </div>
    </div>
  );
}
