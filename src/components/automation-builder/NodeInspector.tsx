import { useEffect, useRef, useState } from 'react';
import { X, Trash2, RefreshCw, Loader2 } from 'lucide-react';
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
 * The contextual inspector.
 *
 * Only ever on screen while a step is selected — the brief's central rule, and
 * the difference between a canvas that breathes and one squeezed between two
 * permanent panels. Every control writes through on change; there is no Apply.
 *
 * Every dropdown here is the builder's own (see Select): a native select shows
 * an OS-styled menu that matches nothing else in Populr, and can't carry the
 * one-line explanation that makes a choice like "Move them to a stage" mean
 * something the first time you meet it.
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
    <div data-field={field} className="px-4 py-3 border-b border-[#F0EDE8] last:border-b-0">
      {children}
    </div>
  );
}

type Unit = 'minutes' | 'hours' | 'days';
const UNIT_MINUTES: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440 };

/**
 * Duration editor.
 *
 * The number is held as text while being edited. The previous version coerced
 * an empty field back to 1 on every keystroke, so pressing backspace snapped
 * the value to "1" and typing "30" was impossible — you could never get the
 * field into the intermediate empty state that typing a new number requires.
 * Nothing is committed until the text parses to a usable number.
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
  // Compared against the PROP's previous value, not against what this field
  // last wrote. Tracking our own writes meant that any time the parent didn't
  // echo the value straight back — a clamp, a rejected edit, a parent that
  // batches — the field decided it was stale and reset itself mid-word.
  // Watching the prop means the text is only ever replaced when the flow
  // genuinely changed underneath (an undo, an AI edit).
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
          // Digits only, but an empty string is allowed through — that's the
          // state you have to pass through to replace the number.
          const next = e.target.value.replace(/[^\d]/g, '');
          setText(next);
          commit(next, unit);
        }}
        onBlur={() => {
          // Leaving the field empty would show nothing while the flow still
          // holds a value; restore what's actually stored.
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

export interface NodeInspectorProps {
  node: FlowNode;
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

export default function NodeInspector({
  node, accounts, posts, postsLoading, capabilities, workspaceTags, problems, question = null,
  onChange, onDelete, onClose, onRefreshPosts,
}: NodeInspectorProps) {
  const [pickingPost, setPickingPost] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  // Arriving from a notification should land on the control that answers it,
  // not at the top of a panel the creator then has to read through.
  useEffect(() => {
    if (!question?.field) return;
    const section = panelRef.current?.querySelector<HTMLElement>(`[data-field="${question.field}"]`);
    if (!section) return;
    section.scrollIntoView({ block: 'nearest' });
    section.querySelector<HTMLElement>('input, textarea, [role="combobox"], button')?.focus();
  }, [question]);

  return (
    <aside
      ref={panelRef}
      // Sizing and entrance belong to the contextual region that owns this
      // slot (see AutomationBuilderPage), not to each panel — otherwise every
      // panel has its own opinion about how wide the right side is.
      className="flex h-full w-full flex-col bg-white"
      aria-label={`${NODE_LABEL[node.type]} settings`}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#F0EDE8]">
        <h2 className="text-[15px] font-semibold text-[#111111]">{NODE_LABEL[node.type]}</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 -mr-1.5 rounded-lg text-[#6B6B6B] hover:bg-[#F7F5F2] hover:text-[#111111]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
          aria-label="Close settings"
        >
          <X size={16} />
        </button>
      </header>

      {/* The composer floats over the canvas; the padding here keeps the last
          control clear of it rather than hidden underneath. */}
      <div className="flex-1 overflow-y-auto pb-28">
        {/* The question in Populr's own words, sitting on the step it belongs
            to. The notification feed is only an index into these — this is
            where the answer actually happens. */}
        {question && (
          <div
            role="status"
            className="mx-4 mt-3 rounded-xl rounded-tl-sm border border-[#E4EFC4] bg-[#F9FFE9] px-3 py-2.5"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#4D7C0F]">Populr asks</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-[#111111]">{question.title}</p>
          </div>
        )}

        {problems.length > 0 && (
          <div className="mx-4 mt-3 rounded-lg bg-[#FFF7ED] border border-[#F5D9B8] px-3 py-2">
            {problems.map(p => (
              <p key={p} className="text-[11.5px] leading-snug text-[#9A3412]">{p}</p>
            ))}
          </div>
        )}

        {node.type === 'trigger' && (
          <TriggerInspector
            node={node} accounts={accounts} posts={posts} postsLoading={postsLoading}
            capabilities={capabilities} onChange={onChange}
            pickingPost={pickingPost} setPickingPost={setPickingPost}
            onRefreshPosts={onRefreshPosts}
          />
        )}
        {node.type === 'condition' && (
          <ConditionInspector node={node} workspaceTags={workspaceTags} onChange={onChange} />
        )}
        {node.type === 'send' && (
          <SendInspector node={node} capabilities={capabilities} onChange={onChange} />
        )}
        {node.type === 'wait' && (
          <Section field="duration">
            <Label hint="Nothing happens during this pause — the next step runs when it's over.">
              Wait for
            </Label>
            <DurationField
              minutes={readWait(node).minutes}
              onChange={minutes => onChange({ kind: 'duration', minutes })}
            />
          </Section>
        )}
        {node.type === 'action' && (
          <ActionInspector node={node} workspaceTags={workspaceTags} onChange={onChange} />
        )}
      </div>

      {node.type !== 'trigger' && (
        <footer className="px-4 py-3 border-t border-[#F0EDE8] bg-white">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-[#B91C1C]
              hover:text-[#7F1D1D] focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-[#C5FF3D] rounded px-1 py-0.5"
          >
            <Trash2 size={14} /> Remove this step
          </button>
        </footer>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------

/**
 * "Some of these aren't mine."
 *
 * A post is offered as this account's for one of two reasons: the synced
 * payload named the account, or nothing named it and the workspace has never
 * had a second account on this platform, so there was nothing else it could
 * be. The second is an inference, and it is wrong precisely when the second
 * account's record no longer exists — the case a creator sees as "this is
 * showing my other Instagram's posts". No re-sync can correct it, because the
 * evidence it would reason from is what's missing.
 *
 * So the notice appears only when at least one offered post rests on that
 * inference, and it asks the one question only the creator can answer.
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

function TriggerInspector({
  node, accounts, posts, postsLoading, capabilities, onChange,
  pickingPost, setPickingPost, onRefreshPosts,
}: {
  node: FlowNode;
  accounts: ConnectedAccount[];
  posts: PostLibraryItem[];
  postsLoading: boolean;
  capabilities: PlatformCapabilities | null;
  onChange: (patch: Record<string, unknown>) => void;
  pickingPost: boolean;
  setPickingPost: (v: boolean) => void;
  onRefreshPosts: (accountId: string) => void;
}) {
  const cfg = readTrigger(node);
  const account = accounts.find(a => a.id === cfg.accountId) ?? null;
  const selectedPost = posts.find(p => String(p.id) === cfg.postId) ?? null;

  // Only connected accounts are offered: an automation on a disconnected
  // account cannot run, so listing it is an invitation to build something
  // dead. The one exception is the account this flow is ALREADY bound to —
  // hiding that would make the picker deny a binding that still exists, so
  // it stays listed (annotated) until the creator picks something else.
  const selectable = accounts.filter(
    a => a.status === 'connected' || a.id === cfg.accountId,
  );

  return (
    <>
      <Section field="account">
        <Label hint="Only this account's posts and DMs will trigger the automation.">Account</Label>
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
            onChange({
              accountId: next?.id ?? null,
              platform: next?.platform ?? null,
              postId: null,
            });
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

      <Section>
        <Label>Trigger</Label>
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

      {cfg.kind === 'comment' && (
        <Section field="post">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] font-medium text-[#111111]">Post or reel</span>
            {cfg.accountId && (
              <button
                type="button"
                onClick={() => onRefreshPosts(cfg.accountId!)}
                disabled={postsLoading}
                className="inline-flex items-center gap-1 text-[11px] text-[#6B6B6B]
                  hover:text-[#111111] disabled:opacity-50 focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-[#C5FF3D] rounded px-1"
              >
                {postsLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                Refresh
              </button>
            )}
          </div>

          <div className="flex gap-2 mb-2">
            {(['one', 'all'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => onChange({ allPosts: mode === 'all', ...(mode === 'all' ? { postId: null } : {}) })}
                className={`flex-1 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors
                  ${(mode === 'all') === cfg.allPosts
                    ? 'border-[#C5FF3D] bg-[#F9FFE9] text-[#111111] font-medium'
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
                  ? <img src={selectedPost.media_url} alt="" className="w-10 h-10 rounded object-cover" />
                  : <div className="w-10 h-10 rounded bg-[#F0EDE8]" />}
                <span className="flex-1 min-w-0">
                  <span className="block text-[11.5px] text-[#6B6B6B] leading-tight line-clamp-2">
                    {selectedPost.caption?.trim() || 'Selected post'}
                  </span>
                  {selectedPost.account_username && (
                    <span className="block text-[10.5px] text-[#B0AAA2] mt-0.5">
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
                No synced posts for @{account?.username ?? 'this account'} yet — try Refresh.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto -mx-1 px-1">
                {/* The wizard's picker, reused as-is — it already handles
                    search, sort and the single-selection state. */}
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
            {/* Outside the branches above on purpose. A trigger already bound
                to an unconfirmed post shows only its selected-post card —
                which is exactly the state a creator lands in when the wrong
                account's post was picked — and selecting one closes the
                picker immediately. Mounting the warning only alongside the
                list would hide it in both. */}
            <UnprovenPostsNotice
              posts={posts}
              accountId={cfg.accountId}
              username={account?.username ?? null}
              onDeclared={declaredFor => {
                // A post the creator has just told us isn't theirs must not
                // stay bound to the trigger — the automation would watch a
                // post on an account this flow can't see, and fail silently.
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

      <Section field="keywords">
        <Label hint="Leave empty and choose “Any message” to react to everything.">Keywords</Label>
        <KeywordInput
          keywords={cfg.keywords}
          onChange={(keywords: string[]) => onChange({ keywords })}
        />
        <div className="mt-2">
          <Select
            value={cfg.matchMode}
            ariaLabel="Keyword matching"
            options={[
              { value: 'contains', label: 'Contains the keyword', description: 'Anywhere in their message.' },
              { value: 'exact', label: 'Is exactly the keyword', description: 'The whole message and nothing else.' },
              { value: 'any', label: 'Any message', description: 'Ignore keywords and react to everything.' },
            ]}
            onChange={matchMode => onChange({ matchMode })}
          />
        </div>
      </Section>

      {/* "Allow multiple triggers" used to live here. It asked a creator to
          decide something they have no way to judge before their automation
          has ever run, and the answer that isn't a mistake is always the same
          one: somebody already halfway through a conversation should not be
          started on it again from the top. That is the rule now — one active
          run per person per automation — so there is nothing to ask. */}
    </>
  );
}

function ConditionInspector({
  node, workspaceTags, onChange,
}: { node: FlowNode; workspaceTags: string[]; onChange: (patch: Record<string, unknown>) => void }) {
  const cfg = readCondition(node);

  return (
    <>
      <Section>
        <Label hint="Yes and No leave this step as separate paths on the canvas.">Check</Label>
        <Select
          value={cfg.kind}
          ariaLabel="What to check"
          options={CONDITION_OPTIONS.map(o => ({ value: o.value, label: o.label, description: o.description }))}
          onChange={kind => onChange({ kind })}
        />
      </Section>

      {cfg.kind === 'text_contains' && (
        <Section field="keywords">
          <Label>Their message contains</Label>
          <KeywordInput keywords={cfg.keywords} onChange={(keywords: string[]) => onChange({ keywords })} />
          <div className="mt-2">
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
          </div>
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
          <Label hint="Put a Wait step before this one to give them time to reply.">When to check</Label>
          <Select
            value={cfg.withinMinutes > 0 ? 'window' : 'now'}
            ariaLabel="When to check"
            options={[
              {
                value: 'now',
                label: 'Check straight away',
                description: 'Looks at whether they\'ve replied by the time this step runs.',
              },
              {
                value: 'window',
                label: 'Keep listening for a while',
                description: 'Holds the automation open, and takes No if the time runs out.',
              },
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
        </Section>
      )}
    </>
  );
}

function SendInspector({
  node, capabilities, onChange,
}: { node: FlowNode; capabilities: PlatformCapabilities | null; onChange: (patch: Record<string, unknown>) => void }) {
  const cfg = readSend(node);
  const name = capabilities ? platformMeta(capabilities.platform).name : 'This platform';

  return (
    <>
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

      <Section field="text">
        <Label hint="Use {first_name} to greet them by name.">Message</Label>
        <textarea
          value={cfg.text}
          onChange={e => onChange({ text: e.target.value })}
          rows={4}
          placeholder="Here's the guide 👇"
          className={`${FIELD} resize-y min-h-[84px]`}
        />
      </Section>

      <Section field="link">
        <Label hint="Populr swaps this for a tracked link so you can see who clicked.">Link</Label>
        <input
          type="url"
          value={cfg.linkUrl ?? ''}
          onChange={e => onChange({ linkUrl: e.target.value || null })}
          placeholder="https://…"
          className={FIELD}
        />
        {cfg.linkUrl && !/^https?:\/\//i.test(cfg.linkUrl.trim()) && (
          <p className="mt-1.5 text-[11px] text-[#B45309]">
            Needs to start with http:// or https://
          </p>
        )}
      </Section>

      {cfg.kind === 'dm' && capabilities?.supportsDMImages && (
        <Section>
          <Label>Attachment</Label>
          <input
            type="url"
            value={cfg.mediaUrl ?? ''}
            onChange={e => onChange({ mediaUrl: e.target.value || null })}
            placeholder="https://… (image or video)"
            className={FIELD}
          />
        </Section>
      )}
    </>
  );
}

function ActionInspector({
  node, workspaceTags, onChange,
}: { node: FlowNode; workspaceTags: string[]; onChange: (patch: Record<string, unknown>) => void }) {
  const cfg = readAction(node);

  return (
    <>
      <Section>
        <Label hint="This happens in Populr — nothing is sent to them.">Then do</Label>
        <Select
          value={cfg.kind}
          ariaLabel="What to do"
          options={ACTION_OPTIONS.map(o => ({ value: o.value, label: o.label, description: o.description }))}
          onChange={kind => onChange({ kind })}
        />
      </Section>

      {(cfg.kind === 'add_tag' || cfg.kind === 'remove_tag') && (
        <Section field="tag">
          <Label hint="Tags group people in Contacts so you can find them later.">Tag</Label>
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
          <Label hint="Automations only ever move someone forward, never back.">Stage</Label>
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
