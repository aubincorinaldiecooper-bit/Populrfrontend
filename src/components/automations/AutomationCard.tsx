import { cardVariants } from '@/components/ui/card';
import { useEffect, useRef, useState } from 'react';
import {
  Zap, GitBranch, Pause, Play, MoreHorizontal, Pencil, Copy, Trash2, Loader2, AlertTriangle, Users,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import StatusPill from '../StatusPill';
import { platformMeta } from '../../lib/platformMeta';
import { timeAgo } from '../../lib/timeAgo';
import { displayName } from '../../lib/people';
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
  /** False for members and canvas collaborators: switching an automation on
   *  or off stays with the workspace owner, so the affordance isn't shown. */
  canToggle?: boolean;
  /** Rename/duplicate ride the "Edit automations" grant. */
  canEdit?: boolean;
  /** Deleting an automation stays with the owner. */
  canDelete?: boolean;
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
  flow, audience, onOpen, onToggleStatus, canToggle = true, canEdit = true, canDelete = true, onRename, onDuplicate, onDelete, onShowAudience,
  busy = false,
}: AutomationCardProps) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(flow.name);
  const [savingName, setSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) nameInputRef.current?.select();
  }, [renaming]);

  const startRename = () => {
    setDraftName(flow.name);
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
  const statusLabel = flow.status === 'live' ? 'live' : flow.status === 'paused' ? 'paused' : 'draft';
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
      className={`${cardVariants({ interactive: true })} p-4 cursor-pointer outline-none
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
              {/* A live automation the runtime would refuse to activate today
                  — its account disconnected, or a rule it predates. "Active"
                  alone would be the lie the creator discovers from a fan.
                  The chip names the state; opening the card, the builder's
                  bell explains and points at the step. */}
              {live && flow.problems && flow.problems.length > 0 && (
                <span
                  title={flow.problems[0]}
                  className="inline-flex items-center gap-1 rounded-full border border-[#F0D9A8]
                    bg-[#FEF7E6] px-2 py-0.5 text-[10px] font-medium text-[#7A5A12]"
                >
                  <AlertTriangle size={10} aria-hidden />
                  Needs attention
                  <span className="sr-only">: {flow.problems[0]}</span>
                </span>
              )}
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
          {canToggle && <button
            onClick={e => { e.stopPropagation(); onToggleStatus(); }}
            disabled={busy}
            className="p-2 rounded-lg text-[#6B6B6B] hover:bg-[#F4F1EC] hover:text-[#111111]
              transition-colors disabled:opacity-50"
            title={live ? 'Pause' : 'Activate'}
            aria-label={`${live ? 'Pause' : 'Activate'} ${flow.name}`}
          >
            {live ? <Pause size={15} /> : <Play size={15} />}
          </button>}

          {(canEdit || canDelete || canToggle) && (
            // The popup lives in a DOM portal, but React synthetic events
            // bubble through the REACT tree — so trigger and menu clicks
            // alike would reach the card's own open handler without this
            // stop at the boundary.
            <div onClick={e => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    aria-label={`More options for ${flow.name}`}
                    className="p-2 rounded-lg text-[#9B9B8F] hover:bg-[#F4F1EC] hover:text-[#111111]
                      transition-colors"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                }
              />
              <DropdownMenuContent aria-label={`${flow.name} options`} className="w-44">
                {canEdit && (
                  <DropdownMenuItem onClick={startRename}>
                    <Pencil size={14} className="text-[#6B6B6B]" />Rename
                  </DropdownMenuItem>
                )}
                {canEdit && (
                  <DropdownMenuItem onClick={onDuplicate}>
                    <Copy size={14} className="text-[#6B6B6B]" />Duplicate
                  </DropdownMenuItem>
                )}
                {canToggle && (
                  <DropdownMenuItem onClick={onToggleStatus}>
                    {live
                      ? <><Pause size={14} className="text-[#6B6B6B]" />Pause</>
                      : <><Play size={14} className="text-[#6B6B6B]" />Activate</>}
                  </DropdownMenuItem>
                )}
                {/* Still red — it is still deletion. Red inside a menu you
                    opened on purpose is a warning; red on the card was noise. */}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onClick={onDelete}>
                      <Trash2 size={14} />Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-[#F4F1EC] flex items-center gap-2 flex-wrap">
        {/* "Updated 4 minutes ago" stopped being enough the moment more than
            one person could do the updating. When we know who, the line says
            who — and when we don't, it says exactly what it always said
            rather than inventing an author. */}
        <span className="text-[10.5px] text-[#B5B0A5]">
          {flow.lastEditedBy
            ? <>Edited by {displayName(flow.lastEditedBy)} {timeAgo(flow.lastEditedAt ?? flow.updatedAt)}</>
            : <>Updated {timeAgo(flow.updatedAt)}</>}
        </span>
        {/* Shared, and with how many. 0 is "just you" and says nothing —
            a badge on every card in a solo workspace is decoration. */}
        {typeof flow.sharedWith === 'number' && flow.sharedWith > 0 && (
          <span className="inline-flex items-center gap-1 text-[10.5px] text-[#6B6B6B]">
            <Users size={11} className="text-[#9B9B8F]" />
            Shared with {flow.sharedWith} {flow.sharedWith === 1 ? 'other' : 'others'}
          </span>
        )}
      </div>
    </div>
  );
}
