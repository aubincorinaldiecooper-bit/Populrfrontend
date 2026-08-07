import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import {
  LEAD_STAGES, NODE_LABEL, describeDuration,
  readAction, readCondition, readSend, readTrigger, readWait,
  type FlowNode,
} from '../../lib/flowSchema';
import { platformMeta } from '../../lib/platformMeta';
import KeywordInput from '../automation-wizard/KeywordInput';
import PostPicker from '../automation-wizard/PostPicker';
import type { ConnectedAccount, PlatformCapabilities, PostLibraryItem } from '../../lib/api';

/**
 * The contextual inspector.
 *
 * Only ever on screen while a step is selected — the brief's central rule, and
 * the difference between a canvas that breathes and one squeezed between two
 * permanent panels. Every control writes through on change; there is no Apply.
 *
 * It shows only what belongs to the selected step. Automation-wide settings
 * (name, account) live where they belong: the header, and the When step.
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

function Section({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-3 border-b border-[#F0EDE8] last:border-b-0">{children}</div>;
}

/** Duration editor that keeps value and unit in sync with a minutes number. */
function DurationField({
  minutes, onChange,
}: { minutes: number; onChange: (minutes: number) => void }) {
  const unit = minutes % 1440 === 0 && minutes >= 1440 ? 'days' : minutes % 60 === 0 && minutes >= 60 ? 'hours' : 'minutes';
  const factor = unit === 'days' ? 1440 : unit === 'hours' ? 60 : 1;
  const value = Math.max(1, Math.round(minutes / factor));

  return (
    <div className="flex gap-2">
      <input
        type="number"
        min={1}
        value={value}
        onChange={e => onChange(Math.max(1, Number(e.target.value) || 1) * factor)}
        className={`${FIELD} w-20`}
      />
      <select
        value={unit}
        onChange={e => {
          const next = e.target.value === 'days' ? 1440 : e.target.value === 'hours' ? 60 : 1;
          onChange(value * next);
        }}
        className={FIELD}
      >
        <option value="minutes">minutes</option>
        <option value="hours">hours</option>
        <option value="days">days</option>
      </select>
    </div>
  );
}

export interface NodeInspectorProps {
  node: FlowNode;
  accounts: ConnectedAccount[];
  posts: PostLibraryItem[];
  capabilities: PlatformCapabilities | null;
  workspaceTags: string[];
  problems: string[];
  onChange: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function NodeInspector({
  node, accounts, posts, capabilities, workspaceTags, problems, onChange, onDelete, onClose,
}: NodeInspectorProps) {
  // Reset per selected step by the `key` the builder gives this component —
  // selecting a different step remounts the inspector, so the picker can't
  // stay open over a step that isn't the one it belongs to.
  const [pickingPost, setPickingPost] = useState(false);

  return (
    <aside
      className="absolute left-0 top-0 bottom-0 z-20 w-[300px] max-w-[85vw] bg-white
        border-r border-[#E8E4DF] shadow-[4px_0_24px_rgba(17,17,17,0.05)]
        flex flex-col animate-in slide-in-from-left-2 fade-in duration-150"
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

      <div className="flex-1 overflow-y-auto">
        {problems.length > 0 && (
          <div className="mx-4 mt-3 rounded-lg bg-[#FFF7ED] border border-[#F5D9B8] px-3 py-2">
            {problems.map(p => (
              <p key={p} className="text-[11.5px] leading-snug text-[#9A3412]">{p}</p>
            ))}
          </div>
        )}

        {node.type === 'trigger' && (
          <TriggerInspector
            node={node} accounts={accounts} posts={posts} capabilities={capabilities}
            onChange={onChange}
            pickingPost={pickingPost} setPickingPost={setPickingPost}
          />
        )}
        {node.type === 'condition' && (
          <ConditionInspector node={node} workspaceTags={workspaceTags} onChange={onChange} />
        )}
        {node.type === 'send' && (
          <SendInspector node={node} capabilities={capabilities} onChange={onChange} />
        )}
        {node.type === 'wait' && (
          <Section>
            <Label hint="How long Populr pauses before the next step.">Wait for</Label>
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
        <footer className="px-4 py-3 border-t border-[#F0EDE8]">
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

function TriggerInspector({
  node, accounts, posts, capabilities, onChange, pickingPost, setPickingPost,
}: {
  node: FlowNode;
  accounts: ConnectedAccount[];
  posts: PostLibraryItem[];
  capabilities: PlatformCapabilities | null;
  onChange: (patch: Record<string, unknown>) => void;
  pickingPost: boolean;
  setPickingPost: (v: boolean) => void;
}) {
  const cfg = readTrigger(node);
  const account = accounts.find(a => a.id === cfg.accountId) ?? null;
  const accountPosts = posts.filter(p => p.account_id === cfg.accountId);
  const selectedPost = accountPosts.find(p => String(p.id) === cfg.postId) ?? null;

  return (
    <>
      <Section>
        <Label>Account</Label>
        <select
          value={cfg.accountId ?? ''}
          onChange={e => {
            const next = accounts.find(a => a.id === e.target.value);
            // Switching account invalidates the chosen post — a post id from
            // one account watched on another would silently never match.
            onChange({
              accountId: next?.id ?? null,
              platform: next?.platform ?? null,
              postId: null,
            });
          }}
          className={FIELD}
        >
          <option value="">Choose an account…</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>
              {platformMeta(a.platform).name} · @{a.username ?? a.display_name ?? a.id}
            </option>
          ))}
        </select>
        {account && account.status !== 'connected' && (
          <p className="mt-1.5 text-[11px] text-[#B45309]">
            This account needs reconnecting before the automation can run.
          </p>
        )}
      </Section>

      <Section>
        <Label>Trigger</Label>
        <select
          value={cfg.kind}
          onChange={e => onChange({ kind: e.target.value })}
          className={FIELD}
        >
          <option value="comment">Someone comments on a post</option>
          <option value="dm">Someone sends a DM</option>
        </select>
        {cfg.kind === 'comment' && capabilities && !capabilities.supportsComments && (
          <p className="mt-1.5 text-[11px] text-[#B45309]">
            {platformMeta(capabilities.platform).name} doesn't report comments.
          </p>
        )}
      </Section>

      {cfg.kind === 'comment' && (
        <Section>
          <Label>Post or reel</Label>
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
            selectedPost && !pickingPost ? (
              <div className="flex items-center gap-2 rounded-lg border border-[#E8E4DF] p-2">
                {selectedPost.media_url
                  ? <img src={selectedPost.media_url} alt="" className="w-10 h-10 rounded object-cover" />
                  : <div className="w-10 h-10 rounded bg-[#F0EDE8]" />}
                <span className="flex-1 text-[11.5px] text-[#6B6B6B] leading-tight line-clamp-2">
                  {selectedPost.caption?.trim() || 'Selected post'}
                </span>
                <button
                  type="button"
                  onClick={() => setPickingPost(true)}
                  className="text-[11.5px] font-medium text-[#111111] underline underline-offset-2"
                >
                  Change
                </button>
              </div>
            ) : accountPosts.length === 0 ? (
              <p className="text-[11.5px] text-[#8A857E]">
                {cfg.accountId
                  ? 'No synced posts for this account yet.'
                  : 'Choose an account first.'}
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto -mx-1 px-1">
                {/* The wizard's picker, reused as-is — it already handles
                    search, sort and the single-selection state, and the
                    builder gains nothing by having a second one. */}
                <PostPicker
                  posts={accountPosts}
                  selectedId={cfg.postId}
                  onSelect={post => {
                    onChange({ postId: String(post.id), allPosts: false });
                    setPickingPost(false);
                  }}
                />
              </div>
            )
          )}
        </Section>
      )}

      <Section>
        <Label hint="Leave empty and choose “Any message” to react to everything.">Keywords</Label>
        <KeywordInput
          keywords={cfg.keywords}
          onChange={(keywords: string[]) => onChange({ keywords })}
        />
        <select
          value={cfg.matchMode}
          onChange={e => onChange({ matchMode: e.target.value })}
          className={`${FIELD} mt-2`}
        >
          <option value="contains">Contains the keyword</option>
          <option value="exact">Is exactly the keyword</option>
          <option value="any">Any message</option>
        </select>
      </Section>

      <Section>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={cfg.allowMultipleRuns}
            onChange={e => onChange({ allowMultipleRuns: e.target.checked })}
            className="mt-0.5 w-4 h-4 rounded border-[#D8D3CC] text-[#111111] focus:ring-[#C5FF3D]"
          />
          <span>
            <span className="block text-[12px] font-medium text-[#111111]">Allow multiple triggers</span>
            <span className="block text-[11px] text-[#8A857E] leading-snug mt-0.5">
              Off, someone already partway through this automation won't start it again.
            </span>
          </span>
        </label>
      </Section>
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
        <Label>Check</Label>
        <select value={cfg.kind} onChange={e => onChange({ kind: e.target.value })} className={FIELD}>
          <option value="text_contains">What they said</option>
          <option value="replied">Whether they replied</option>
          <option value="has_tag">Whether they have a tag</option>
        </select>
      </Section>

      {cfg.kind === 'text_contains' && (
        <Section>
          <Label>Their message contains</Label>
          <KeywordInput keywords={cfg.keywords} onChange={(keywords: string[]) => onChange({ keywords })} />
          <select
            value={cfg.matchMode}
            onChange={e => onChange({ matchMode: e.target.value })}
            className={`${FIELD} mt-2`}
          >
            <option value="contains">Contains</option>
            <option value="exact">Is exactly</option>
            <option value="any">Anything</option>
          </select>
        </Section>
      )}

      {cfg.kind === 'has_tag' && (
        <Section>
          <Label>Tag</Label>
          <input
            list="workspace-tags"
            value={cfg.tag ?? ''}
            onChange={e => onChange({ tag: e.target.value })}
            placeholder="warm_lead"
            className={FIELD}
          />
          <datalist id="workspace-tags">
            {workspaceTags.map(t => <option key={t} value={t} />)}
          </datalist>
        </Section>
      )}

      {cfg.kind === 'replied' && (
        <Section>
          <Label hint="Answered as soon as this step is reached — put a Wait before it to give them time.">
            When to check
          </Label>
          <select
            value={cfg.withinMinutes > 0 ? 'window' : 'now'}
            onChange={e => onChange({ withinMinutes: e.target.value === 'window' ? 1440 : 0 })}
            className={FIELD}
          >
            <option value="now">Check now</option>
            <option value="window">Keep listening for a while</option>
          </select>
          {cfg.withinMinutes > 0 && (
            <div className="mt-2">
              <DurationField
                minutes={cfg.withinMinutes}
                onChange={withinMinutes => onChange({ withinMinutes })}
              />
              <p className="mt-1.5 text-[11px] text-[#8A857E] leading-snug">
                Holds this automation open for {describeDuration(cfg.withinMinutes)}, then takes No.
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
        <select value={cfg.kind} onChange={e => onChange({ kind: e.target.value })} className={FIELD}>
          <option value="dm">A direct message</option>
          <option value="comment_reply">A public reply</option>
        </select>
        {cfg.kind === 'dm' && capabilities && !capabilities.supportsCommentToDM && (
          <p className="mt-1.5 text-[11px] text-[#B45309]">
            {name} won't let an automation DM someone because they commented.
          </p>
        )}
        {cfg.kind === 'comment_reply' && capabilities && !capabilities.supportsCommentReplies && (
          <p className="mt-1.5 text-[11px] text-[#B45309]">{name} doesn't support public replies.</p>
        )}
      </Section>

      <Section>
        <Label hint="Use {first_name} to greet them by name.">Message</Label>
        <textarea
          value={cfg.text}
          onChange={e => onChange({ text: e.target.value })}
          rows={4}
          placeholder="Here's the guide 👇"
          className={`${FIELD} resize-y min-h-[84px]`}
        />
      </Section>

      <Section>
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
        <Label>Do</Label>
        <select value={cfg.kind} onChange={e => onChange({ kind: e.target.value })} className={FIELD}>
          <option value="add_tag">Add a tag</option>
          <option value="remove_tag">Remove a tag</option>
          <option value="set_stage">Set their stage</option>
          <option value="notify_creator">Notify me</option>
        </select>
      </Section>

      {(cfg.kind === 'add_tag' || cfg.kind === 'remove_tag') && (
        <Section>
          <Label>Tag</Label>
          <input
            list="workspace-tags-action"
            value={cfg.tag ?? ''}
            onChange={e => onChange({ tag: e.target.value })}
            placeholder="warm_lead"
            className={FIELD}
          />
          <datalist id="workspace-tags-action">
            {workspaceTags.map(t => <option key={t} value={t} />)}
          </datalist>
        </Section>
      )}

      {cfg.kind === 'set_stage' && (
        <Section>
          <Label hint="Automations only ever move a lead forward.">Stage</Label>
          <select value={cfg.stage ?? ''} onChange={e => onChange({ stage: e.target.value })} className={FIELD}>
            <option value="">Choose a stage…</option>
            {LEAD_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Section>
      )}

      {cfg.kind === 'notify_creator' && (
        <Section>
          <Label hint="They'll appear in Needs Reply with this note.">Note</Label>
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
