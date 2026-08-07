import { X, Sparkles, Undo2 } from 'lucide-react';
import type { HistoryEntry } from './useFlowBuilder';

/**
 * Recent changes, on request.
 *
 * Closed by default and never opened automatically — the canvas is the
 * dominant surface, and a transcript that appears after every request would
 * turn the builder into a chat window with a diagram attached. It exists for
 * the moment a creator asks "what did that last thing actually do?", which is
 * a question worth answering well and rarely.
 */

export interface HistoryDrawerProps {
  history: HistoryEntry[];
  canUndo: boolean;
  onUndo: () => void;
  onClose: () => void;
}

function timeAgo(at: number): string {
  const seconds = Math.floor((Date.now() - at) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default function HistoryDrawer({ history, canUndo, onUndo, onClose }: HistoryDrawerProps) {
  const entries = [...history].reverse();

  return (
    <aside
      className="absolute right-0 top-0 bottom-0 z-30 w-[340px] max-w-[90vw] bg-white
        border-l border-[#E8E4DF] shadow-[-4px_0_24px_rgba(17,17,17,0.06)]
        flex flex-col animate-in slide-in-from-right-2 fade-in duration-150"
      aria-label="Recent changes"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#F0EDE8]">
        <h2 className="text-[15px] font-semibold text-[#111111]">Recent changes</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 -mr-1.5 rounded-lg text-[#6B6B6B] hover:bg-[#F7F5F2] hover:text-[#111111]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
          aria-label="Close recent changes"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {entries.length === 0 ? (
          <p className="text-[12.5px] text-[#8A857E]">
            Nothing yet. Ask Populr to build or change something and it'll show up here.
          </p>
        ) : (
          <ol className="space-y-4">
            {entries.map((entry, i) => (
              <li key={`${entry.at}-${i}`}>
                <p className="text-[12.5px] leading-snug text-[#111111]">
                  <span className="text-[#6B6B6B]">You:</span> {entry.prompt}
                </p>
                <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-[#3F6212]">
                  <Sparkles size={12} className="mt-0.5 shrink-0" />
                  <span>{entry.summary}</span>
                </p>
                <p className="mt-1 text-[11px] text-[#B0AAA2]">
                  {timeAgo(entry.at)}
                  {entry.source === 'fallback' && ' · built without AI'}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {canUndo && (
        <footer className="px-4 py-3 border-t border-[#F0EDE8]">
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#111111]
              hover:text-[#4D7C0F] focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-[#C5FF3D] rounded px-1 py-0.5"
          >
            <Undo2 size={14} /> Undo the last change
          </button>
        </footer>
      )}
    </aside>
  );
}
