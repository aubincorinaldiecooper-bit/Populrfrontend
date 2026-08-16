import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface PopulrAIMessageProps {
  text: string;
  changes?: string[];
  canUndo?: boolean;
  onUndo?: () => void;
  onOpenHistory?: () => void;
}

/** A readable assistant answer, with graph details kept secondary. */
export default function PopulrAIMessage({ text, changes = [], canUndo, onUndo, onOpenHistory }: PopulrAIMessageProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
      <p className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.6] text-[#252321]">{text}</p>
      {changes.length > 0 && (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-[#68635D]"><Check size={12} className="text-[#5F8B18]" />{changes.length} change{changes.length === 1 ? '' : 's'}</p>
          <div className="mt-1 flex items-center gap-2 text-[11.5px]">
            <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="flex items-center gap-0.5 rounded text-[#57524C] hover:text-[#111111] focus-visible:ring-[#C5FF3D]">
              View changes <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {canUndo && <><span aria-hidden className="text-[#C7C2BB]">·</span><button type="button" onClick={onUndo} className="rounded text-[#57524C] hover:text-[#111111]">Undo</button></>}
            {onOpenHistory && <><span aria-hidden className="text-[#C7C2BB]">·</span><button type="button" onClick={onOpenHistory} className="rounded text-[#8A857E] hover:text-[#111111]">History</button></>}
          </div>
          {expanded && <ul className="mt-2 space-y-1.5 rounded-xl bg-[#F4F2EE] px-3 py-2.5">{changes.map((change, index) => <li key={`${index}-${change}`} className="flex gap-2 text-[11.5px] leading-snug text-[#625D57]"><Check size={11} className="mt-0.5 shrink-0 text-[#73951D]" />{change}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
