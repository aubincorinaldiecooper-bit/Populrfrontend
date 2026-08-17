import { useState } from 'react';
import { Check, ChevronDown, Sparkles } from 'lucide-react';
import type { ComposerProgressEvent } from '../../lib/api';

/**
 * The agent building the proposal — the Beautiful UI "Thinking / Steps"
 * trace in Populr's clothes.
 *
 * Two honest states, no fake pacing:
 *
 *   working  — the request is in flight. The header shimmers ("Drafting your
 *              automation…") because real work is happening; no step rows are
 *              invented while we can't know them.
 *   settled  — the server answered with the real event sequence. The rows ARE
 *              those events (each drafted step, named for what it adds),
 *              revealed with a short stagger and left expandable under a
 *              "Drafted N steps" header.
 *
 * Everything shown comes from ComposerProgressEvent — the backend's actual
 * stages — never from a timer pretending to think.
 */
export default function BuildTrace({
  working,
  events,
}: {
  working: boolean;
  events: ComposerProgressEvent[] | null;
}) {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const rows = (events ?? []).filter(e => e.stage === 'drafting');
  const settled = !working && rows.length > 0;
  const expanded = manualExpanded ?? settled;

  if (!working && !settled) return null;

  return (
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <button
        type="button"
        aria-expanded={expanded}
        disabled={working}
        onClick={() => setManualExpanded(current => !(current ?? settled))}
        className="-mx-1.5 flex w-fit items-center gap-2 rounded-lg px-1.5 py-1 transition-colors duration-100 enabled:hover:bg-[#F4F2EE]"
      >
        <Sparkles size={14} className={working ? 'text-[#68635D]' : 'text-[#8A857E]'} />
        {working ? (
          <span
            className="bg-clip-text text-[12.5px] font-medium whitespace-nowrap text-transparent"
            style={{
              backgroundImage: 'linear-gradient(90deg, #8A857E 35%, #111111 50%, #8A857E 65%)',
              backgroundSize: '200% 100%',
              animation: 'pop-shimmer-text 1.4s linear infinite',
            }}
          >
            Drafting your automation…
          </span>
        ) : (
          <span className="text-[12.5px] font-medium whitespace-nowrap text-[#57524C]" style={{ animation: 'pop-fade-in 350ms ease-out both' }}>
            Drafted {rows.length} step{rows.length === 1 ? '' : 's'}
          </span>
        )}
        {settled && (
          <ChevronDown
            size={13}
            className="text-[#8A857E] transition-transform duration-300"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}
          />
        )}
      </button>

      {settled && (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-300"
          style={{
            gridTemplateRows: expanded ? '1fr' : '0fr',
            opacity: expanded ? 1 : 0,
            transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
          }}
        >
          <div className="overflow-hidden">
            <div className="relative mt-1 ml-[5px] pl-4">
              <span aria-hidden className="absolute top-0 bottom-1 left-[2px] w-px bg-[#E8E4DF]" />
              <div className="flex flex-col gap-0.5 py-1">
                {rows.map((event, i) => (
                  <div
                    key={event.id}
                    className="flex min-h-6 items-center gap-2 px-1 py-0.5"
                    style={{ animation: `pop-fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${Math.min(i * 90, 700)}ms both` }}
                  >
                    <Check size={13} className="shrink-0 text-[#5F8B18]" />
                    <span className="min-w-0 text-[12px] leading-snug text-[#57524C]">{event.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
