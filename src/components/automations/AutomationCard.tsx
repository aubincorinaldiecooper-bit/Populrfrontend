import { useEffect, useRef, useState } from 'react';
import {
  Zap, GitBranch, Pause, Play, MoreHorizontal, Pencil, Copy, Trash2, Loader2,
} from 'lucide-react';
import StatusPill from '../StatusPill';
import { platformMeta } from '../../lib/platformMeta';
import { timeAgo } from '../../lib/timeAgo';
import { describeFlow } from '../../lib/flowSummary';
import type { AutomationFlow } from '../../lib/api';

/**
 * One automation, on the list.
 *
 * The same card as before, re-weighted. What changed is what you read first:
 * name, then state, then what it does in plain English, then the facts that
 * distinguish two similar automations — platform, how many steps, and how many
 * people it has actually reached.
 *
 * State is legible before the label is read. A live automation gets a lime
 * icon container and sits very slightly off the page; a draft is neutral; a
 * paused one is muted and wears the pause it's in. The lime is a tint, not the
 * full accent — filling a card with the colour that means "activate" would
 * spend it on the automations that are already running.
 *
 * Delete moved into an overflow menu. A red icon sitting permanently beside
 * every automation gave the most destructive action the most visual weight on
 * a page a creator scans, and put it one mis-click from Pause.
 */

export interface AutomationCardProps {
  flow: AutomationFlow;
  /** Distinct people this automation has reached; null while unknown. */
  audience: number | null;
  onOpen: () => void;
  onToggleStatus: () => void;
  onRename: (name: string) => Promise<void>;
  onDuplicate: () => void;
  onDelete: () => void;
  onShowAudience: () => void;
  busy?: boolean;
}

/** Icon container per state — the part that reads before any words do. */
function StateIcon({ status }: { status: AutomationFlow['status'] }) {
  if (status === 'live') {
    return (
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
        bg-[#EDFBCD] border border-[#DDF5A8]">
        <Zap size={18} className="text-[#111111]" />
      </div>
    );
  }
  if (status === 'paused') {
    return (
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
        bg-[#F4F1EC] border border-[#E8E4DF]">
        <Pause size={17} className="text-[#9B9B8F]" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
      bg-[#FAFAF8] border border-[#EFECE6]">
      <GitBranch size={18} className="text-[#6B6B6B]" />
    </div>
  );
}

export default function AutomationCard({
  flow, audience, onOpen, onToggleStatus, onRename, onDuplicate, onDelete, onShowAudience,
  busy = false,
}: AutomationCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(flow.name);
  const [savingName, setSavingName] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Same menu behaviour as the account menu in the sidebar: click away to
  // dismiss, Escape hands focus back to what opened it rather than dropping it.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenuOpen(false);
      menuTriggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (renaming) nameInputRef.current?.select();
  }, [renaming]);

  const startRename = () => {
    setDraftName(flow.name);
    setMenuOpen(false);
    setRenaming(true);
  };

  const commitRename = async () => {
    const next = draftName.trim();
    setRenaming(false);
    // An empty name isn't a rename, and neither is the name it already has.
    if (!next || next === flow.name) return;
    setSavingName(true);
    try {
      await onRename(next);
    } finally {
      setSavingName(false);
    }
  };

  const summary = describeFlow(flow.graph);
  const steps = flow.graph.nodes.length;
  const statusLabel = flow.status === 'live' ? 'active' : flow.status === 'paused' ? 'paused' : 'draft';
  const live = flow.status === 'live';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${flow.name}`}
      onClick={() => { if (!renaming) onOpen(); }}
      onKeyDown={e => {
        if (renaming) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}
      className={`pop-card p-4 pop-card-lift cursor-pointer outline-none
        focus-visible:ring-2 focus-visible:ring-chartreuse focus-visible:ring-offset-2
        focus-visible:ring-offset-cream
        ${live ? 'shadow-[0_1px_3px_rgba(17,17,17,0.05)]' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <StateIcon status={flow.status} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {renaming ? (
                <input
                  ref={nameInputRef}
                  value={draftName}
                  aria-label={`Rename ${flow.name}`}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setDraftName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === 'Enter') { e.preventDefault(); void commitRename(); }
                    if (e.key === 'Escape') { e.preventDefault(); setRenaming(false); }
                  }}
                  className="font-geist font-semibold text-[14px] text-[#111111] bg-white
                    border border-[#E8E4DF] rounded-lg px-2 py-0.5 focus:border-chartreuse
                    focus:ring-2 focus:ring-chartreuse/20 outline-none"
                />
              ) : (
                <h3 className="font-geist font-semibold text-[14px] text-[#111111] truncate">
                  {flow.name}
                </h3>
              )}
              {savingName && <Loader2 size={12} className="animate-spin text-[#9B9B8F]" />}
              <StatusPill status={statusLabel} className="text-[10px]" />
            </div>

            {/* What it does, as two lines of English rather than a parts list. */}
            <p className="text-[12px] text-[#4A4A4A] mt-1 leading-[1.45]">{summary.when}</p>
            {summary.then && (
              <p className="text-[12px] text-[#6B6B6B] leading-[1.45]">→ {summary.then}</p>
            )}

            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[#9B9B8F] flex-wrap">
              {/* Display name, not the internal id — `twitter` must read as "X". */}
              <span>{flow.platform ? platformMeta(flow.platform).name : 'No channel yet'}</span>
              {steps > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span>{steps} step{steps === 1 ? '' : 's'}</span>
                </>
              )}
              {/* Nothing at all when the count is unknown. The backend leaves
                  the field off if it couldn't take the count, and "No one yet"
                  in that gap would be a claim rather than a silence. */}
              {audience !== null && (
                <>
                  <span aria-hidden>·</span>
                  {audience > 0 ? (
                    // The audience is the point of the automation, so it's the
                    // one piece of metadata you can act on: it opens the people
                    // it reached rather than only reporting how many.
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); onShowAudience(); }}
                      aria-label={`${audience} ${audience === 1 ? 'person' : 'people'} reached by ${flow.name}`}
                      className="text-[#6B6B6B] font-medium rounded hover:text-[#111111] hover:underline
                        underline-offset-2 focus-visible:outline-none focus-visible:ring-2
                        focus-visible:ring-chartreuse"
                    >
                      {audience} {audience === 1 ? 'person' : 'people'}
                    </button>
                  ) : (
                    <span>No one yet</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onToggleStatus(); }}
            disabled={busy}
            className="p-2 rounded-lg text-[#6B6B6B] hover:bg-[#F4F1EC] hover:text-[#111111]
              transition-colors disabled:opacity-50"
            title={live ? 'Pause' : 'Activate'}
            aria-label={`${live ? 'Pause' : 'Activate'} ${flow.name}`}
          >
            {live ? <Pause size={15} /> : <Play size={15} />}
          </button>

          <div ref={menuRef} className="relative">
            <button
              ref={menuTriggerRef}
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
              aria-label={`More options for ${flow.name}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="p-2 rounded-lg text-[#9B9B8F] hover:bg-[#F4F1EC] hover:text-[#111111]
                transition-colors"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                aria-label={`${flow.name} options`}
                onClick={e => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 w-44 bg-white border border-[#E8E4DF]
                  rounded-xl shadow-lg overflow-hidden py-1 z-20"
              >
                <button
                  role="menuitem"
                  onClick={startRename}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px]
                    text-[#111111] hover:bg-[#FAFAF8] transition-colors"
                >
                  <Pencil size={14} className="text-[#6B6B6B]" />Rename
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onDuplicate(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px]
                    text-[#111111] hover:bg-[#FAFAF8] transition-colors"
                >
                  <Copy size={14} className="text-[#6B6B6B]" />Duplicate
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onToggleStatus(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px]
                    text-[#111111] hover:bg-[#FAFAF8] transition-colors"
                >
                  {live
                    ? <><Pause size={14} className="text-[#6B6B6B]" />Pause</>
                    : <><Play size={14} className="text-[#6B6B6B]" />Activate</>}
                </button>
                {/* Still red — it is still deletion. Red inside a menu you
                    opened on purpose is a warning; red on the card was noise. */}
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onDelete(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px]
                    text-[#DC2626] hover:bg-[#FEF2F2] transition-colors border-t border-[#F0EEEA]"
                >
                  <Trash2 size={14} />Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-[#F4F1EC]">
        <span className="text-[10.5px] text-[#B5B0A5]">Updated {timeAgo(flow.updatedAt)}</span>
      </div>
    </div>
  );
}
