import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Link2, Loader2, Paperclip, RefreshCw, Trash2, X } from 'lucide-react';
import {
  ACTION_OPTIONS, CONDITION_OPTIONS, LEAD_STAGES, NODE_LABEL, SEND_OPTIONS, TRIGGER_OPTIONS,
  describeDuration,
  readAction, readCondition, readSend, readTrigger, readWait,
  type FlowNode,
} from '../../lib/flowSchema';
import { platformMeta } from '../../lib/platformMeta';
import KeywordInput from '../automation-wizard/KeywordInput';
import PostPicker from '../automation-wizard/PostPicker';
import Select from './Select';
import TagCombobox from './TagCombobox';
import { declareOtherAccountsOnPlatform } from '../../lib/api';
import type { ConnectedAccount, PlatformCapabilities, PostLibraryItem } from '../../lib/api';

/**
 * The contextual step editor — a small card that appears AT the step, not a
 * panel beside the canvas.
 *
 * The design test it answers to: could someone click a step and immediately
 * understand what to change without being taught the interface? So each step
 * type leads with its one primary field, and everything optional hides behind
 * a light touch — "+ Add link" instead of an empty URL input, "More options"
 * instead of matching machinery. Every control still writes through on change;
 * there is no Apply, and closing the card changes nothing.
 *
 * The card itself is position-agnostic: FlowCanvas anchors it to the selected
 * node on wide screens (variant "anchored"), and the page mounts the same
 * content as a bottom sheet on narrow ones (variant "sheet").
 */

const FIELD =
  'w-full rounded-lg border border-[#E8E4DF] bg-white px-3 py-2 text-[13px] text-[#111111] ' +
  'placeholder:text-[#B0AAA2] focus:outline-none focus:ring-2 focus:ring-[#C5FF3D] focus:border-transparent';

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <span className="text-[12px] font-medium text-[#111111]">{children}</span>
      {hint && <p className="text-[11px] text-[#8A857E] mt-0.5 leading-snug">{hint}</p>}
    </div>
  );
}

/** `field` names the control a notification can point at (see BuilderQuestion). */
function Section({ children, field }: { children: React.ReactNode; field?: string }) {
  return (
    <div data-field={field} className="px-3.5 py-2.5 border-b border-[#F0EDE8] last:border-b-0">
      {children}
    </div>
  );
}

/** "+ Add link" — the shape optional things take until they're wanted. */
function AddChip({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E4DF] bg-white
        px-2.5 py-1 text-[11.5px] font-medium text-[#57524C] transition-colors
        hover:border-[#C5FF3D] hover:text-[#111111]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
    >
      {icon} {label}
    </button>
  );
}

/** "More options" — one quiet door per section, never a settings page. */
function MoreOptions({ open, onToggle, children }: {
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded text-[11.5px] font-medium text-[#8A857E]
          hover:text-[#111111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
      >
        More options
        <ChevronDown size={12} className="transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

type Unit = 'minutes' | 'hours' | 'days';
const UNIT_MINUTES: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440 };

/**
 * Duration editor. The number is held as text while being edited so backspace
 * can pass through the empty state — nothing commits until the text parses.
 * The text only resets when the PROP moves underneath (an undo, an AI edit),
 * never in response to our own writes.
 */
function DurationField({
  minutes, onChange, minMinutes = 1,
}: { minutes: number; onChange: (minutes: number) => void; minMinutes?: number }) {
  const derivedUnit: Unit =
    minutes >= 1440 && minutes % 1440 === 0 ? 'days'
    : minutes >= 60 && minutes % 60 === 0 ? 'hours'
    : 'minutes';

  const [unit, setUnit] = useState<Unit>(derivedUnit);
  const [text, setText] = useState(String(Math.max(1, Math.round(minutes / UNIT_MINUTES[derivedUnit]))));
  const [prevMinutes, setPrevMinutes] = useState(minutes);

  if (minutes !== prevMinutes) {
    setPrevMinutes(minutes);
    setUnit(derivedUnit);
    setText(String(Math.max(1, Math.round(minutes / UNIT_MINUTES[derivedUnit]))));
  }

  const commit = (nextText: string, nextUnit: Unit) => {
    const parsed = Number(nextText);
    if (!nextText.trim() || !Number.isFinite(parsed) || parsed <= 0) return;
    onChange(Math.max(minMinutes, Math.round(parsed) * UNIT_MINUTES[nextUnit]));
  };

  return (
    <div className="flex gap-2">
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={e => {
          const next = e.target.value.replace(/[^\d]/g, '');
          setText(next);
          commit(next, unit);
        }}
        onBlur={() => {
          if (!text.trim()) setText(String(Math.max(1, Math.round(minutes / UNIT_MINUTES[unit]))));
        }}
        aria-label="Duration"
        className={`${FIELD} w-20`}
      />
      <Select<Unit>
        value={unit}
        ariaLabel="Duration unit"
        options={[
          { value: 'minutes', label: 'minutes' },
          { value: 'hours', label: 'hours' },
          { value: 'days', label: 'days' },
        ]}
        onChange={next => { setUnit(next); commit(text, next); }}
        className="flex-1"
      />
    </div>
  );
}

/** What Populr is asking about this step, arrived at from a notification. */
export interface BuilderQuestion {
  title: string;
  /** Which Section answers it — scrolled to and focused when it opens. */
  field: string | null;
}

export interface NodeEditorCardProps {
  node: FlowNode;
  /** "anchored" floats at the node on the canvas; "sheet" fills a bottom sheet. */
  variant: 'anchored' | 'sheet';
  accounts: ConnectedAccount[];
  posts: PostLibraryItem[];
  postsLoading: boolean;
  capabilities: PlatformCapabilities | null;
  workspaceTags: string[];
  problems: string[];
  question?: BuilderQuestion | null;
  onChange: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onClose: () => void;
  onRefreshPosts: (accountId: string) => void;
}

export default function NodeEditorCard({
  node, variant, accounts, posts, postsLoading, capabilities, workspaceTags, problems,
  question = null, onChange, onDelete, onClose, onRefreshPosts,
}: NodeEditorCardProps) {
  const cardRef = useRef<HTMLElement>(null);

  // Arriving from a notification lands on the control that answers it.
  useEffect(() => {
    if (!question?.field) return;
    const section = cardRef.current?.querySelector<HTMLElement>(`[data-field="${question.field}"]`);
    if (!section) return;
    section.scrollIntoView({ block: 'nearest' });
    section.querySelector<HTMLElement>('input, textarea, [role="combobox"], button')?.focus();
  }, [question]);

  return (
    <aside
      ref={cardRef}
      aria-label={`${NODE_LABEL[node.type]} settings`}
      onKeyDown={e => {
        if (e.key !== 'Escape') return;
        // An open dropdown owns its own Escape — closing the whole card out
        // from under a creator picking an option would be a trap door.
        const target = e.target as HTMLElement;
        if (target.getAttribute('aria-expanded') === 'true') return;
        e.stopPropagation();
        onClose();
      }}
      className={
        variant === 'anchored'
          ? `flex w-[312px] flex-col overflow-hidden rounded-2xl border border-[#E8E4DF] bg-white
             shadow-[0_12px_32px_rgba(17,17,17,0.12)] motion-safe:animate-in motion-safe:fade-in
             motion-safe:zoom-in-95 motion-safe:duration-150`
          : 'flex w-full flex-col bg-white'
      }
    >
      <header className="flex items-center justify-between border-b border-[#F0EDE8] px-3.5 py-2.5">
        <h2 className="text-[13.5px] font-semibold text-[#111111]">{NODE_LABEL[node.type]}</h2>
        <div className="flex items-center gap-0.5">
          {node.type !== 'trigger' && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Remove this step"
              className="rounded-lg p-1.5 text-[#8A857E] hover:bg-[#FDF1EF] hover:text-[#B91C1C]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-lg p-1.5 -mr-1 text-[#6B6B6B] hover:bg-[#F7F5F2] hover:text-[#111111]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      <div
        className={`overscroll-contain overflow-y-auto ${
          variant === 'anchored' ? 'max-h-[min(430px,58vh)]' : 'max-h-[62dvh]'
        }`}
      >
        {question && (
          <div
            role="status"
            className="mx-3.5 mt-2.5 rounded-xl rounded-tl-sm border border-[#E4EFC4] bg-[#F9FFE9] px-3 py-2"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#4D7C0F]">Populr asks</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-[#111111]">{question.title}</p>
          </div>
        )}

        {problems.length > 0 && (
          <div className="mx-3.5 mt-2.5 rounded-lg border border-[#F5D9B8] bg-[#FFF7ED] px-3 py-2">
            {problems.map(p => (
              <p key={p} className="text-[11.5px] leading-snug text-[#9A3412]">{p}</p>
            ))}
          </div>
        )}

        {node.type === 'send' && (
          <SendEditor node={node} capabilities={capabilities} question={question} onChange={onChange} />
        )}
        {node.type === 'wait' && (
          <Section field="duration">
            <Label>Wait for</Label>
            <DurationField
              minutes={readWait(node).minutes}
              onChange={minutes => onChange({ kind: 'duration', minutes })}
            />
          </Section>
        )}
        {node.type === 'condition' && (
          <ConditionEditor node={node} workspaceTags={workspaceTags} onChange={onChange} />
        )}
        {node.type === 'action' && (
          <ActionEditor node={node} workspaceTags={workspaceTags} onChange={onChange} />
        )}
        {node.type === 'trigger' && (
          <TriggerEditor
            node={node} accounts={accounts} posts={posts} postsLoading={postsLoading}
            capabilities={capabilities} onChange={onChange} onRefreshPosts={onRefreshPosts}
          />
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Message — the message first; everything else is a chip away
// ---------------------------------------------------------------------------

function SendEditor({
  node, capabilities, question, onChange,
}: {
  node: FlowNode;
  capabilities: PlatformCapabilities | null;
  question: BuilderQuestion | null;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const cfg = readSend(node);
  const name = capabilities ? platformMeta(capabilities.platform).name : 'This platform';
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Revealed by the chip, or already carrying a value. Once revealed the field
  // stays until closed — hiding it the moment its value empties would pull the
  // input out from under someone mid-edit.
  const [showLink, setShowLink] = useState(Boolean(cfg.linkUrl));
  const [showMedia, setShowMedia] = useState(Boolean(cfg.mediaUrl));

  // Writing the message IS the task — the cursor should already be there.
  // Unless a notification is steering focus somewhere specific.
  useEffect(() => {
    if (!question) textRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on mount only
  }, []);

  const canAttach = cfg.kind === 'dm' && capabilities?.supportsDMImages;

  // Only worth asking when there's a choice — see the platform matrix. The
  // section stays visible when the step is set to something the platform
  // refuses, so the warning under it has somewhere to live.
  const onlyOneWayToSend =
    capabilities !== null &&
    capabilities.supportsDMs &&
    !capabilities.supportsCommentReplies &&
    cfg.kind === 'dm';

  return (
    <>
      {/* The card's header already says "Message" — repeating it as a field
          label would be the form talking to itself. The textarea IS the step. */}
      <Section field="text">
        <textarea
          ref={textRef}
          value={cfg.text}
          onChange={e => onChange({ text: e.target.value })}
          rows={3}
          placeholder="Here's the guide 👇"
          aria-label="Message"
          className={`${FIELD} resize-y min-h-[72px]`}
        />
        <p className="mt-1 text-[11px] leading-snug text-[#8A857E]">
          Use {'{first_name}'} to greet them by name.
        </p>

        {(!(showLink || cfg.linkUrl) || (canAttach && !(showMedia || cfg.mediaUrl))) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!(showLink || cfg.linkUrl) && (
              <AddChip icon={<Link2 size={12} />} label="Add link" onClick={() => setShowLink(true)} />
            )}
            {canAttach && !(showMedia || cfg.mediaUrl) && (
              <AddChip icon={<Paperclip size={12} />} label="Add attachment" onClick={() => setShowMedia(true)} />
            )}
          </div>
        )}
      </Section>

      {(showLink || cfg.linkUrl) && (
        <Section field="link">
          <div className="flex items-center justify-between">
            <Label hint="Becomes a tracked link, so you can see who tapped.">Link</Label>
            <button
              type="button"
              aria-label="Remove link"
              onClick={() => { onChange({ linkUrl: null }); setShowLink(false); }}
              className="rounded p-1 -mt-1 text-[#8A857E] hover:text-[#B91C1C]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
            >
              <X size={13} />
            </button>
          </div>
          <input
            type="url"
            value={cfg.linkUrl ?? ''}
            onChange={e => onChange({ linkUrl: e.target.value || null })}
            placeholder="https://…"
            aria-label="Link"
            autoFocus={!cfg.linkUrl}
            className={FIELD}
          />
          {cfg.linkUrl && !/^https?:\/\//i.test(cfg.linkUrl.trim()) && (
            <p className="mt-1.5 text-[11px] text-[#B45309]">Needs to start with http:// or https://</p>
          )}
        </Section>
      )}

      {canAttach && (showMedia || cfg.mediaUrl) && (
        <Section>
          <div className="flex items-center justify-between">
            <Label>Attachment</Label>
            <button
              type="button"
              aria-label="Remove attachment"
              onClick={() => { onChange({ mediaUrl: null }); setShowMedia(false); }}
              className="rounded p-1 -mt-1 text-[#8A857E] hover:text-[#B91C1C]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
            >
              <X size={13} />
            </button>
          </div>
          <input
            type="url"
            value={cfg.mediaUrl ?? ''}
            onChange={e => onChange({ mediaUrl: e.target.value || null })}
            placeholder="https://… (image or video)"
            aria-label="Attachment"
            autoFocus={!cfg.mediaUrl}
            className={FIELD}
          />
        </Section>
      )}

      {!onlyOneWayToSend && (
        <Section>
          <Label>Send as</Label>
          <Select
            value={cfg.kind}
            ariaLabel="Send as"
            options={SEND_OPTIONS.map(o => ({ value: o.value, label: o.label, description: o.description }))}
            onChange={kind => onChange({ kind })}
          />
          {cfg.kind === 'dm' && capabilities && !capabilities.supportsCommentToDM && (
            <p className="mt-1.5 text-[11px] text-[#B45309]">
              {name} won't let an automation DM someone because they commented.
            </p>
          )}
          {cfg.kind === 'comment_reply' && capabilities && !capabilities.supportsCommentReplies && (
            <p className="mt-1.5 text-[11px] text-[#B45309]">{name} doesn't support public replies.</p>
          )}
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// If — what are we checking, and what counts as Yes
// ---------------------------------------------------------------------------

function ConditionEditor({
  node, workspaceTags, onChange,
}: { node: FlowNode; workspaceTags: string[]; onChange: (patch: Record<string, unknown>) => void }) {
  const cfg = readCondition(node);
  // Auto-open when the stored config uses the option — hiding an active
  // setting behind a closed door would make the card lie about what this
  // step does. Synced against the PROP, not only read at mount: an outside
  // edit (an AI build, an undo) can make the option active while this card
  // stays mounted, and the door must open with it. Never forced closed —
  // a creator who opened it keeps it open.
  const matchActive = cfg.matchMode !== 'contains';
  const [moreMatch, setMoreMatch] = useState(matchActive);
  const [prevMatchActive, setPrevMatchActive] = useState(matchActive);
  if (matchActive !== prevMatchActive) {
    setPrevMatchActive(matchActive);
    if (matchActive) setMoreMatch(true);
  }
  const timingActive = cfg.withinMinutes > 0;
  const [moreTiming, setMoreTiming] = useState(timingActive);
  const [prevTimingActive, setPrevTimingActive] = useState(timingActive);
  if (timingActive !== prevTimingActive) {
    setPrevTimingActive(timingActive);
    if (timingActive) setMoreTiming(true);
  }

  return (
    <>
      <Section>
        <Label>Check</Label>
        <Select
          value={cfg.kind}
          ariaLabel="What to check"
          options={CONDITION_OPTIONS.map(o => ({ value: o.value, label: o.label, description: o.description }))}
          onChange={kind => onChange({ kind })}
        />
      </Section>

      {cfg.kind === 'text_contains' && (
        <Section field="keywords">
          <Label>If they say…</Label>
          <KeywordInput
            keywords={cfg.keywords}
            onChange={(keywords: string[]) => onChange({ keywords })}
            hint="Any capitalisation, anywhere in their reply."
          />
          <MoreOptions open={moreMatch} onToggle={() => setMoreMatch(o => !o)}>
            <Select
              value={cfg.matchMode}
              ariaLabel="Matching"
              options={[
                { value: 'contains', label: 'Contains' },
                { value: 'exact', label: 'Is exactly' },
                { value: 'any', label: 'Anything' },
              ]}
              onChange={matchMode => onChange({ matchMode })}
            />
          </MoreOptions>
        </Section>
      )}

      {cfg.kind === 'has_tag' && (
        <Section field="tag">
          <Label>Tag</Label>
          <TagCombobox
            value={cfg.tag}
            tags={workspaceTags}
            onChange={tag => onChange({ tag })}
            ariaLabel="Tag to check for"
          />
        </Section>
      )}

      {cfg.kind === 'replied' && (
        <Section>
          {/* The canvas already shows Yes and No leaving this step — the card
              doesn't need to say anything until someone wants the timing. */}
          <MoreOptions open={moreTiming} onToggle={() => setMoreTiming(o => !o)}>
            <Label>When to check</Label>
            <Select
              value={cfg.withinMinutes > 0 ? 'window' : 'now'}
              ariaLabel="When to check"
              options={[
                { value: 'now', label: 'Check straight away', description: 'Whether they\'ve replied by this step.' },
                { value: 'window', label: 'Keep listening for a while', description: 'Waits, and takes No if time runs out.' },
              ]}
              onChange={mode => onChange({ withinMinutes: mode === 'window' ? 1440 : 0 })}
            />
            {cfg.withinMinutes > 0 && (
              <div className="mt-2">
                <DurationField
                  minutes={cfg.withinMinutes}
                  onChange={withinMinutes => onChange({ withinMinutes })}
                />
                <p className="mt-1.5 text-[11px] text-[#8A857E] leading-snug">
                  Waits up to {describeDuration(cfg.withinMinutes)} for a reply, then takes No.
                </p>
              </div>
            )}
          </MoreOptions>
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Do something — the action and its one value
// ---------------------------------------------------------------------------

function ActionEditor({
  node, workspaceTags, onChange,
}: { node: FlowNode; workspaceTags: string[]; onChange: (patch: Record<string, unknown>) => void }) {
  const cfg = readAction(node);

  return (
    <>
      {/* No label: the header says "Do something" — the select's value
          ("Add a tag") is the answer, not a second question. */}
      <Section>
        <Select
          value={cfg.kind}
          ariaLabel="What to do"
          options={ACTION_OPTIONS.map(o => ({ value: o.value, label: o.label, description: o.description }))}
          onChange={kind => onChange({ kind })}
        />
      </Section>

      {(cfg.kind === 'add_tag' || cfg.kind === 'remove_tag') && (
        <Section field="tag">
          <Label>{cfg.kind === 'add_tag' ? 'Add tag' : 'Remove tag'}</Label>
          <TagCombobox
            value={cfg.tag}
            tags={workspaceTags}
            onChange={tag => onChange({ tag })}
            ariaLabel="Tag"
          />
        </Section>
      )}

      {cfg.kind === 'set_stage' && (
        <Section field="stage">
          <Label hint="Automations only move someone forward, never back.">Set stage</Label>
          <Select
            value={cfg.stage ?? ''}
            placeholder="Choose a stage…"
            ariaLabel="Stage"
            options={LEAD_STAGES.map(s => ({
              value: s,
              label: s.charAt(0).toUpperCase() + s.slice(1),
              description: {
                cold: 'Hasn\'t engaged much yet.',
                interested: 'Showed some interest.',
                warm: 'Engaged and worth following up.',
                hot: 'Ready to hear from you personally.',
                converted: 'Became a customer or signed up.',
              }[s],
            }))}
            onChange={stage => onChange({ stage })}
          />
        </Section>
      )}

      {cfg.kind === 'notify_creator' && (
        <Section>
          <Label hint="They'll appear in Needs Reply with this note.">Note to yourself</Label>
          <input
            value={cfg.note ?? ''}
            onChange={e => onChange({ note: e.target.value || null })}
            placeholder="Warm lead from the guide automation"
            className={FIELD}
          />
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// When — the essentials; the post picker unfolds in place when asked
// ---------------------------------------------------------------------------

/**
 * "Some of these aren't mine." Shown only when an offered post rests on the
 * sole-account inference — the one case a re-sync can't correct — and asks
 * the one question only the creator can answer.
 */
function UnprovenPostsNotice({
  posts, accountId, username, onDeclared,
}: {
  posts: PostLibraryItem[];
  accountId: string | null;
  username: string | null;
  onDeclared: (accountId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unproven = posts.filter(p => p.ownership_basis === 'sole_account_inference');

  if (!accountId || unproven.length === 0) return null;

  const handle = username ? `@${username}` : 'this account';

  return (
    <div className="mt-2 rounded-lg border border-[#E8E4DF] bg-[#FAF9F7] p-2.5">
      <p className="text-[11px] leading-snug text-[#6B665F]">
        {unproven.length === posts.length
          ? `We couldn't confirm these posts were published by ${handle}.`
          : `${unproven.length} of these posts couldn't be confirmed as ${handle}'s.`}{' '}
        They're shown because this workspace has no record of another account on this platform.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await declareOtherAccountsOnPlatform(accountId);
            onDeclared(accountId);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save that.');
          } finally {
            setBusy(false);
          }
        }}
        className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] font-medium
          text-[#111111] underline underline-offset-2 disabled:opacity-50"
      >
        {busy && <Loader2 size={11} className="animate-spin" />}
        I have another account on this platform — hide unconfirmed posts
      </button>
      {error && <p className="mt-1 text-[11px] text-[#B4432F]">{error}</p>}
    </div>
  );
}

function TriggerEditor({
  node, accounts, posts, postsLoading, capabilities, onChange, onRefreshPosts,
}: {
  node: FlowNode;
  accounts: ConnectedAccount[];
  posts: PostLibraryItem[];
  postsLoading: boolean;
  capabilities: PlatformCapabilities | null;
  onChange: (patch: Record<string, unknown>) => void;
  onRefreshPosts: (accountId: string) => void;
}) {
  const cfg = readTrigger(node);
  const account = accounts.find(a => a.id === cfg.accountId) ?? null;
  const selectedPost = posts.find(p => String(p.id) === cfg.postId) ?? null;
  const [pickingPost, setPickingPost] = useState(false);
  // Non-default matching is worth surfacing — and kept in sync with the
  // PROP, so an outside edit that makes it non-default while the card is
  // mounted opens the door too (see ConditionEditor for the pattern).
  const matchActive = cfg.matchMode === 'exact' || (cfg.matchMode === 'any' && cfg.keywords.length > 0);
  const [moreMatch, setMoreMatch] = useState(matchActive);
  const [prevMatchActive, setPrevMatchActive] = useState(matchActive);
  if (matchActive !== prevMatchActive) {
    setPrevMatchActive(matchActive);
    if (matchActive) setMoreMatch(true);
  }

  // Only connected accounts are offered — plus the one this flow is already
  // bound to, annotated, so the picker never denies a binding that exists.
  const selectable = accounts.filter(a => a.status === 'connected' || a.id === cfg.accountId);

  const keywordHint =
    cfg.kind === 'comment'
      ? 'Any capitalisation, anywhere in their comment. Leave empty to react to every comment.'
      : 'Any capitalisation, anywhere in their message. Leave empty to react to every DM.';

  return (
    <>
      <Section field="account">
        <Label>Account</Label>
        <Select
          value={cfg.accountId ?? ''}
          placeholder="Choose an account…"
          ariaLabel="Account"
          options={selectable.map(a => ({
            value: a.id,
            label: `@${a.username ?? a.display_name ?? a.id}`,
            description: platformMeta(a.platform).name,
            note: a.status !== 'connected' ? '· needs reconnecting' : undefined,
          }))}
          onChange={id => {
            const next = accounts.find(a => a.id === id);
            // Switching account invalidates the chosen post — a post id from
            // one account watched on another would silently never match.
            onChange({ accountId: next?.id ?? null, platform: next?.platform ?? null, postId: null });
          }}
        />
        {account && account.status !== 'connected' && (
          <p className="mt-1.5 text-[11px] text-[#B45309]">
            This account needs reconnecting before the automation can run.
          </p>
        )}
        {selectable.length === 0 && (
          <p className="mt-1.5 text-[11px] text-[#8A857E]">
            No connected accounts. Reconnect one under Channels first.
          </p>
        )}
      </Section>

      {/* No label: the card's header says "When", and the select's own value
          ("Someone comments on a post") is the rest of the sentence. */}
      <Section>
        <Select
          value={cfg.kind}
          ariaLabel="Trigger"
          options={TRIGGER_OPTIONS.map(o => ({ value: o.value, label: o.label, description: o.description }))}
          onChange={kind => onChange({ kind })}
        />
        {cfg.kind === 'comment' && capabilities && !capabilities.supportsComments && (
          <p className="mt-1.5 text-[11px] text-[#B45309]">
            {platformMeta(capabilities.platform).name} doesn't report comments.
          </p>
        )}
      </Section>

      <Section field="keywords">
        <Label>Keywords</Label>
        <KeywordInput
          keywords={cfg.keywords}
          onChange={(keywords: string[]) => onChange({ keywords })}
          hint={keywordHint}
        />
        <MoreOptions open={moreMatch} onToggle={() => setMoreMatch(o => !o)}>
          <Select
            value={cfg.matchMode}
            ariaLabel="Keyword matching"
            options={[
              { value: 'contains', label: 'Contains the keyword', description: 'Anywhere in what they typed.' },
              { value: 'exact', label: 'Is exactly the keyword', description: 'The whole thing and nothing else.' },
              { value: 'any', label: 'Any message', description: 'Ignore keywords and react to everything.' },
            ]}
            onChange={matchMode => onChange({ matchMode })}
          />
        </MoreOptions>
      </Section>

      {cfg.kind === 'comment' && (
        <Section field="post">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[12px] font-medium text-[#111111]">Post</span>
            {cfg.accountId && (pickingPost || !cfg.allPosts) && (
              <button
                type="button"
                onClick={() => onRefreshPosts(cfg.accountId!)}
                disabled={postsLoading}
                className="inline-flex items-center gap-1 rounded px-1 text-[11px] text-[#6B6B6B]
                  hover:text-[#111111] disabled:opacity-50 focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
              >
                {postsLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                Refresh
              </button>
            )}
          </div>

          <div className="mb-2 flex gap-2">
            {(['all', 'one'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  if (mode === 'all') {
                    onChange({ allPosts: true, postId: null });
                    setPickingPost(false);
                  } else {
                    onChange({ allPosts: false });
                    if (!selectedPost) setPickingPost(true);
                  }
                }}
                className={`flex-1 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors
                  ${(mode === 'all') === cfg.allPosts
                    ? 'border-[#C5FF3D] bg-[#F9FFE9] font-medium text-[#111111]'
                    : 'border-[#E8E4DF] text-[#6B6B6B] hover:border-[#D8D3CC]'}`}
              >
                {mode === 'all' ? 'Any post' : 'One post'}
              </button>
            ))}
          </div>

          {!cfg.allPosts && (
            <>
              {selectedPost && !pickingPost ? (
                <div className="flex items-center gap-2 rounded-lg border border-[#E8E4DF] p-2">
                  {selectedPost.media_url
                    ? <img src={selectedPost.media_url} alt="" className="h-10 w-10 rounded object-cover" />
                    : <div className="h-10 w-10 rounded bg-[#F0EDE8]" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11.5px] leading-tight text-[#6B6B6B] line-clamp-2">
                      {selectedPost.caption?.trim() || 'Selected post'}
                    </span>
                    {selectedPost.account_username && (
                      <span className="mt-0.5 block text-[10.5px] text-[#B0AAA2]">
                        @{selectedPost.account_username}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickingPost(true)}
                    className="text-[11.5px] font-medium text-[#111111] underline underline-offset-2"
                  >
                    Change
                  </button>
                </div>
              ) : !cfg.accountId ? (
                <p className="text-[11.5px] text-[#8A857E]">Choose an account first.</p>
              ) : postsLoading ? (
                <p className="flex items-center gap-1.5 text-[11.5px] text-[#8A857E]">
                  <Loader2 size={12} className="animate-spin" /> Loading posts…
                </p>
              ) : posts.length === 0 ? (
                <p className="text-[11.5px] text-[#8A857E]">
                  No posts for @{account?.username ?? 'this account'} yet — try Refresh.
                </p>
              ) : (
                // The picker unfolds INSIDE the card — the card grows into a
                // scrollable area rather than opening a second surface.
                <div className="-mx-1 max-h-56 overflow-y-auto px-1">
                  <PostPicker
                    posts={posts}
                    selectedId={cfg.postId}
                    onSelect={post => {
                      onChange({ postId: String(post.id), allPosts: false });
                      setPickingPost(false);
                    }}
                  />
                </div>
              )}
              {/* Outside the branches above on purpose: a trigger already
                  bound to an unconfirmed post shows only its summary card,
                  and that's exactly the state the warning exists for. */}
              <UnprovenPostsNotice
                posts={posts}
                accountId={cfg.accountId}
                username={account?.username ?? null}
                onDeclared={declaredFor => {
                  if (selectedPost?.ownership_basis === 'sole_account_inference') {
                    onChange({ postId: null });
                    setPickingPost(true);
                  }
                  onRefreshPosts(declaredFor);
                }}
              />
            </>
          )}
        </Section>
      )}
    </>
  );
}
