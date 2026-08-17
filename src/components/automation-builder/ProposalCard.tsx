import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { FlowProposal } from '../../lib/api';

/**
 * "Here is what I'm about to build" — the human confirmation gate, in the
 * Beautiful UI recommendation-card shape: the card holds its form, the plan
 * reads as a checklist, assumptions sit above the footer, and the footer
 * carries the two choices. Build this is the only way the draft reaches the
 * canvas; Change something keeps the conversation on the draft.
 *
 * Every checklist line comes from the server's plan, which is derived from
 * the proposed operations — the card cannot claim a step the draft doesn't
 * contain.
 */
export default function ProposalCard({
  proposal,
  committing,
  error,
  onConfirm,
  onRevise,
  onDiscard,
}: {
  proposal: FlowProposal;
  committing: boolean;
  error: string | null;
  onConfirm: () => void;
  onRevise: () => void;
  onDiscard: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div
      className="w-full overflow-hidden rounded-2xl border border-[#E8E4DF] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]"
      style={{ animation: 'pop-fade-up 350ms cubic-bezier(0.23,1,0.32,1) both' }}
    >
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Ready for you</p>
            <p className="mt-0.5 text-[12px] text-[#68635D]">
              {proposal.revision > 1 ? "Here's the updated draft:" : "Here's the flow I drafted:"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Discard this draft"
            onClick={onDiscard}
            disabled={committing}
            className="shrink-0 rounded-md p-1 text-[#8A857E] transition-colors duration-100 hover:bg-[#F4F2EE] hover:text-[#111111]"
          >
            <X size={14} />
          </button>
        </div>

        <ul className="mt-2.5 flex flex-col gap-1">
          {proposal.plan.map((item, i) => (
            <li
              key={item.id}
              className="flex items-start gap-2 text-[12.5px] leading-snug text-[#302D2A]"
              style={{ animation: `pop-fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${Math.min(i * 70, 560)}ms both` }}
            >
              <Check size={13} className="mt-0.5 shrink-0 text-[#73951D]" />
              {item.label}
            </li>
          ))}
        </ul>

        {proposal.assumptions.length > 0 && (
          <div className="mt-3 rounded-xl bg-[#F4F2EE] px-3 py-2.5">
            <p className="text-[10.5px] font-medium uppercase tracking-wide text-[#8A857E]">
              Assumption{proposal.assumptions.length === 1 ? '' : 's'}
            </p>
            {proposal.assumptions.map(assumption => (
              <p key={assumption} className="mt-1 text-[12px] leading-snug text-[#57524C]">
                {assumption}
              </p>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-xl bg-[#FBEFEA] px-3 py-2.5 text-[12px] leading-snug text-[#8C4A2F]" role="alert">
            {error} Nothing was changed.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#F0EDE8] bg-[#FCFBF9] px-4 py-2.5">
        {/* The label may wrap in a narrow panel; the buttons never may. */}
        <span className="min-w-0 text-[11.5px] leading-snug text-[#8A857E]">Nothing is on the canvas yet.</span>
        <span className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onRevise}
            disabled={committing}
            className="h-7 whitespace-nowrap rounded-lg border border-[#E8E4DF] bg-white px-2.5 text-[12px] font-medium text-[#111111] transition-[background-color,transform] duration-100 hover:bg-[#F4F2EE] active:scale-[0.96] disabled:opacity-50"
          >
            Change something
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmed(true);
              onConfirm();
            }}
            disabled={committing}
            className={`h-7 whitespace-nowrap rounded-lg px-3 text-[12px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition-[background-color,transform] duration-150 active:scale-[0.96] disabled:opacity-70 ${
              confirmed && committing ? 'bg-[#5F8B18]' : 'bg-[#111111] hover:bg-[#2A2A2A]'
            }`}
          >
            {committing ? 'Building…' : 'Build this'}
          </button>
        </span>
      </div>
    </div>
  );
}
