import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Check, Loader2, RefreshCw, Search, AlertCircle,
  MessageSquare, Send, MessagesSquare, Sparkles, Link2, Zap, Image as ImageIcon,
  User,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  createAutomation, updateAutomation, fetchCapabilities,
  fetchPostsLibrary, syncPostsLibrary, findMissingPost, fetchTestReply,
  ApiError,
} from '../lib/api';
import type {
  AutomationRecord, AutomationInput, AutomationMatchMode, AutomationReplyChannel,
  PlatformCapabilities, PostLibraryItem, TestReplyResult, ConnectedAccount,
} from '../lib/api';

// ── Design tokens (ported from the redesign system) ──────────────────
const card = 'bg-surface-container-lowest border border-outline-variant rounded-xl';
const inputBase =
  'w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 ' +
  'text-body-md text-on-surface placeholder:text-on-surface-variant/60 outline-none transition-colors';

const MATCH_MODES: { value: AutomationMatchMode; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'exact', label: 'Exact' },
  { value: 'starts_with', label: 'Starts with' },
];

const CHANNEL_ICON: Record<AutomationReplyChannel, typeof MessageSquare> = {
  comment: MessageSquare, dm: Send, both: MessagesSquare,
};
const CHANNEL_LABEL: Record<AutomationReplyChannel, string> = {
  comment: 'Public reply', dm: 'DM', both: 'Public reply + DM',
};

type StepKey = 'create' | 'post' | 'replies' | 'review';
const STEPS: { key: StepKey; label: string; icon: typeof Zap }[] = [
  { key: 'create', label: 'Create', icon: Zap },
  { key: 'post', label: 'Post', icon: ImageIcon },
  { key: 'replies', label: 'Replies', icon: MessageSquare },
  { key: 'review', label: 'Review', icon: Check },
];

// The wizard test-chat can't run when the reason maps to a real cause; these
// are honest, user-facing explanations for the fixed-reply fallback.
const TEST_FALLBACK_NOTE: Record<'not_configured' | 'ai_disabled' | 'error', string> = {
  not_configured: 'AI testing isn’t set up yet — showing the fixed reply you wrote.',
  ai_disabled: 'AI replies are turned off in Settings — showing the fixed reply you wrote.',
  error: 'Couldn’t reach the AI just now — showing the fixed reply you wrote.',
};

interface TestExchange {
  sample: string;
  status: 'loading' | 'done';
  result?: TestReplyResult;
}

// ── Reusable primitives (module scope — never declared during render) ──
function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <span className="flex items-baseline gap-2 mb-2">
      <span className="font-label text-label-sm uppercase text-on-surface-variant">{children}</span>
      {optional && <span className="font-body text-[11px] text-outline">Optional</span>}
    </span>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span className="flex items-center gap-1.5 mt-1.5 text-[13px] text-error">
      <AlertCircle size={13} /> {message}
    </span>
  );
}

function Segmented({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; icon?: React.ReactNode; disabled?: boolean }[];
}) {
  return (
    <div className="flex gap-1 p-1 bg-surface-container rounded-full">
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-body-md font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              active ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-surface-container-highest'}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        className={`inline-block h-5 w-5 rounded-full bg-surface-container-lowest shadow ${checked ? 'ml-[22px]' : 'ml-0.5'}`}
      />
    </button>
  );
}

function AccountAvatar({ account }: { account: ConnectedAccount }) {
  if (account.avatar_url) {
    return <img src={account.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-outline-variant" />;
  }
  return (
    <span className="w-9 h-9 rounded-full bg-surface-container-high border border-outline-variant flex items-center justify-center text-on-surface-variant">
      <User size={16} />
    </span>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-surface-variant last:border-b-0">
      <span className="font-label text-label-sm uppercase text-on-surface-variant pt-0.5">{label}</span>
      <span className="font-body text-body-md text-on-surface text-right max-w-[62%]">{children}</span>
    </div>
  );
}

function TestBubble({ exchange, fallbackReply }: { exchange: TestExchange; fallbackReply: string }) {
  return (
    <div className="space-y-2">
      {/* Sample the user typed */}
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-primary text-on-primary rounded-2xl rounded-br-md px-3.5 py-2 text-body-md">
          {exchange.sample}
        </div>
      </div>
      {/* AI's dry-run reply */}
      <div className="flex justify-start">
        <div className="max-w-[85%] w-full">
          {exchange.status === 'loading' ? (
            <div className="inline-flex items-center gap-2 bg-surface-container rounded-2xl rounded-bl-md px-3.5 py-2 text-body-md text-on-surface-variant">
              <Loader2 size={14} className="animate-spin" /> Thinking…
            </div>
          ) : exchange.result?.available ? (
            <div className="bg-surface-container rounded-2xl rounded-bl-md px-3.5 py-2.5">
              <p className="text-body-md text-on-surface whitespace-pre-wrap">
                {exchange.result.decision.replyText?.trim()
                  || 'No auto-reply here — the AI would hand this to you to answer.'}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="font-label text-[11px] uppercase px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant capitalize">
                  {exchange.result.decision.intent}
                </span>
                <span className="font-label text-[11px] uppercase px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">
                  {Math.round(exchange.result.decision.confidence * 100)}% sure
                </span>
                {exchange.result.decision.needsHuman ? (
                  <span className="font-label text-[11px] uppercase px-2 py-0.5 rounded-full bg-error-container text-on-error-container">
                    Needs you
                  </span>
                ) : exchange.result.decision.shouldAutoReply ? (
                  <span className="font-label text-[11px] uppercase px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container">
                    Auto-sends
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="bg-surface-container rounded-2xl rounded-bl-md px-3.5 py-2.5">
              <p className="text-body-md text-on-surface whitespace-pre-wrap">
                {fallbackReply.trim() || 'Write your reply first to preview it here.'}
              </p>
              {exchange.result && !exchange.result.available && (
                <p className="flex items-start gap-1.5 mt-2 text-[12px] text-on-surface-variant">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  {TEST_FALLBACK_NOTE[exchange.result.reason]}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function fieldStatus(message?: string) {
  return message;
}

export default function AutomationBuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast, accounts } = useApp();
  // Editing: AutomationsPage navigates here with the real, backend-shaped
  // record (never a mock) via router state.
  const editAuto = (location.state as { automation?: AutomationRecord } | null)?.automation ?? null;

  const connectedAccounts = useMemo(() => accounts.filter(a => a.status === 'connected'), [accounts]);

  // ── Form state (identical fields to the single-page builder) ──
  const [name, setName] = useState(editAuto?.name ?? '');
  const [accountId, setAccountId] = useState(editAuto?.account_id ?? '');
  const [postScope, setPostScope] = useState<'all' | 'specific'>(editAuto?.source_post_id ? 'specific' : 'all');
  const [sourcePostId, setSourcePostId] = useState<string | null>(editAuto?.source_post_id ?? null);
  const [keywordsText, setKeywordsText] = useState((editAuto?.keywords ?? []).join(', '));
  const [matchMode, setMatchMode] = useState<AutomationMatchMode>(editAuto?.match_mode ?? 'contains');
  const [replyChannel, setReplyChannel] = useState<AutomationReplyChannel>(editAuto?.reply_channel ?? 'comment');
  const [commentReplyBody, setCommentReplyBody] = useState(editAuto?.comment_reply_body ?? '');
  const [messageBody, setMessageBody] = useState(editAuto?.message_body ?? '');
  const [linkUrl, setLinkUrl] = useState(editAuto?.link_url ?? '');
  const [tagsText, setTagsText] = useState((editAuto?.tags ?? []).join(', '));
  const [scoreDelta, setScoreDelta] = useState(editAuto?.score_delta ?? 0);
  const [reviewFirst, setReviewFirst] = useState(!!(editAuto?.ai_enabled && editAuto?.ai_mode === 'suggest'));
  const [active, setActive] = useState(editAuto?.active ?? true);

  const [capabilities, setCapabilities] = useState<Record<string, PlatformCapabilities>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverProblems, setServerProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // ── Wizard navigation ──
  const [stepIndex, setStepIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const step = STEPS[stepIndex].key;

  // ── Real post picker ──
  const [libraryPosts, setLibraryPosts] = useState<PostLibraryItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsSyncing, setPostsSyncing] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [postSearch, setPostSearch] = useState('');
  const [showFindMissing, setShowFindMissing] = useState(false);
  const [missingUrl, setMissingUrl] = useState('');
  const [findingMissing, setFindingMissing] = useState(false);

  // ── AI test chat ──
  const [testInput, setTestInput] = useState('');
  const [testHistory, setTestHistory] = useState<TestExchange[]>([]);

  useEffect(() => {
    fetchCapabilities()
      .then(list => setCapabilities(Object.fromEntries(list.map(c => [c.platform, c]))))
      .catch(err => console.error('[automations] failed to load platform capabilities:', err));
  }, []);

  useEffect(() => {
    if (postScope !== 'specific' || !accountId) {
      // Clears stale options from a previous account/scope, not derived state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLibraryPosts([]);
      return;
    }
    let cancelled = false;
    setPostsLoading(true);
    setPostsError(null);
    fetchPostsLibrary({ accountId })
      .then(posts => { if (!cancelled) setLibraryPosts(posts); })
      .catch(err => { if (!cancelled) setPostsError(err instanceof Error ? err.message : 'Could not load your posts.'); })
      .finally(() => { if (!cancelled) setPostsLoading(false); });
    return () => { cancelled = true; };
  }, [postScope, accountId]);

  const selectedAccount = connectedAccounts.find(a => a.id === accountId) ?? null;
  const caps = selectedAccount ? capabilities[selectedAccount.platform] : undefined;
  const selectedPost = libraryPosts.find(p => p.id === sourcePostId) ?? null;

  // Capability gating — mirrors the backend's own matrix (GET /api/capabilities),
  // enforced again on save. Options render before caps load, but the server
  // has the final say.
  const commentAllowed = !caps || caps.supportsCommentReplies;
  const dmAllowed = !caps || caps.supportsDMs;

  // Derive whichever channel is actually supported so we never submit an
  // unsupported one — computed at render so it never fights a direct click.
  const effectiveReplyChannel: AutomationReplyChannel =
    replyChannel === 'comment' && !commentAllowed && dmAllowed ? 'dm'
    : replyChannel === 'dm' && !dmAllowed && commentAllowed ? 'comment'
    : replyChannel === 'both' && (!commentAllowed || !dmAllowed) ? (commentAllowed ? 'comment' : dmAllowed ? 'dm' : 'comment')
    : replyChannel;

  const wantsComment = effectiveReplyChannel === 'comment' || effectiveReplyChannel === 'both';
  const wantsDm = effectiveReplyChannel === 'dm' || effectiveReplyChannel === 'both';
  const fallbackReply = effectiveReplyChannel === 'dm' ? messageBody : commentReplyBody;

  const filteredPosts = useMemo(() => {
    const q = postSearch.trim().toLowerCase();
    if (!q) return libraryPosts;
    return libraryPosts.filter(p =>
      (p.caption ?? '').toLowerCase().includes(q) || p.external_post_id.toLowerCase().includes(q));
  }, [libraryPosts, postSearch]);

  // ── Post picker actions ──
  const handleSyncPosts = async () => {
    if (!accountId) return;
    setPostsSyncing(true);
    setPostsError(null);
    try {
      await syncPostsLibrary(accountId);
      setLibraryPosts(await fetchPostsLibrary({ accountId }));
    } catch (err) {
      setPostsError(err instanceof Error ? err.message : 'Could not sync your posts.');
    } finally {
      setPostsSyncing(false);
    }
  };

  const handleFindMissing = async () => {
    if (!accountId || !missingUrl.trim()) return;
    setFindingMissing(true);
    try {
      const { post } = await findMissingPost(accountId, missingUrl.trim());
      setLibraryPosts(prev => [post, ...prev.filter(p => p.id !== post.id)]);
      setSourcePostId(post.id);
      setShowFindMissing(false);
      setMissingUrl('');
      showToast('Post found and added', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not find that post.', 'error');
    } finally {
      setFindingMissing(false);
    }
  };

  // ── AI test chat ──
  const runTest = async () => {
    const sample = testInput.trim();
    if (!sample || !selectedAccount) return;
    const channel: 'comment' | 'dm' = effectiveReplyChannel === 'dm' ? 'dm' : 'comment';
    const idx = testHistory.length;
    setTestHistory(h => [...h, { sample, status: 'loading' }]);
    setTestInput('');
    try {
      const result = await fetchTestReply({
        platform: selectedAccount.platform,
        channel,
        messageText: sample,
        postCaption: postScope === 'specific' && selectedPost?.caption ? selectedPost.caption : null,
      });
      setTestHistory(h => h.map((e, i) => (i === idx ? { ...e, status: 'done', result } : e)));
    } catch {
      setTestHistory(h => h.map((e, i) => (i === idx ? { ...e, status: 'done', result: { available: false, reason: 'error' } } : e)));
    }
  };

  // ── Per-step validation ──
  const validateStep = (which: StepKey): Record<string, string> => {
    const e: Record<string, string> = {};
    if (which === 'create') {
      if (!name.trim()) e.name = 'Give this automation a name';
      if (!accountId) e.accountId = 'Choose a connected account';
    }
    if (which === 'post') {
      if (postScope === 'specific' && !sourcePostId) e.sourcePostId = 'Pick a post, or switch to All posts';
    }
    if (which === 'replies') {
      if (!keywordsText.trim()) e.keywords = 'Enter at least one trigger keyword';
      if (wantsComment && !commentReplyBody.trim()) e.commentReplyBody = 'Write the public reply';
      if (wantsDm && !messageBody.trim()) e.messageBody = 'Write the DM';
    }
    return e;
  };

  const goNext = () => {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setDir(1);
    setStepIndex(i => Math.min(i + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setDir(-1);
    setErrors({});
    setStepIndex(i => Math.max(i - 1, 0));
  };

  const handleSave = async () => {
    setServerProblems([]);
    // Re-run every gating step in case a value changed via the review summary.
    const allErrors = { ...validateStep('create'), ...validateStep('post'), ...validateStep('replies') };
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      // Jump back to the earliest step carrying an error.
      const firstBad = STEPS.findIndex(s => Object.keys(validateStep(s.key)).length > 0);
      if (firstBad >= 0) { setDir(-1); setStepIndex(firstBad); }
      return;
    }
    setSaving(true);
    try {
      const input: AutomationInput = {
        name: name.trim(),
        accountId,
        platform: selectedAccount!.platform,
        allPosts: postScope === 'all',
        sourcePostId: postScope === 'specific' && sourcePostId ? Number(sourcePostId) : null,
        keywords: keywordsText.split(',').map(k => k.trim()).filter(Boolean),
        matchMode,
        replyChannel: effectiveReplyChannel,
        commentReplyBody: wantsComment ? commentReplyBody.trim() : null,
        messageBody: wantsDm ? messageBody.trim() : null,
        linkUrl: linkUrl.trim() || null,
        tags: tagsText.split(',').map(t => t.trim()).filter(Boolean),
        scoreDelta: Number(scoreDelta) || 0,
        active,
        // "Review-first" reuses Smart Replies' suggest mode — the one real
        // backend concept for "draft it, but a human sends it".
        aiEnabled: reviewFirst,
        aiMode: reviewFirst ? 'suggest' : undefined,
      };
      if (editAuto) {
        await updateAutomation(editAuto.id, input);
        showToast('Automation updated', 'success');
      } else {
        await createAutomation(input);
        showToast('Automation created', 'success');
      }
      navigate('/automations');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'unsupported_on_platform') {
        setServerProblems(err.details ?? [err.message]);
        setDir(-1);
        setStepIndex(STEPS.length - 1);
      } else {
        showToast(err instanceof Error ? err.message : 'Could not save this automation.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const isLast = stepIndex === STEPS.length - 1;

  // ── Step content (a plain function returning JSX — not a nested component) ──
  const renderStep = () => {
    switch (step) {
      case 'create':
        return (
          <div className="space-y-7">
            <div>
              <FieldLabel>Automation name</FieldLabel>
              <input
                className={inputBase}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Free guide keyword"
              />
              <FieldError message={fieldStatus(errors.name)} />
            </div>

            <div>
              <FieldLabel>Connected account</FieldLabel>
              {connectedAccounts.length === 0 ? (
                <div className={`${card} p-5 text-center`}>
                  <p className="text-body-md text-on-surface">No connected accounts yet.</p>
                  <button onClick={() => navigate('/connections')} className="mt-2 text-body-md font-semibold text-primary underline">
                    Connect a channel first
                  </button>
                </div>
              ) : (
                <div className="grid gap-2">
                  {connectedAccounts.map(a => {
                    const selected = a.id === accountId;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => { setAccountId(a.id); setSourcePostId(null); }}
                        className={`flex items-center gap-3 w-full text-left rounded-xl border p-3 transition-colors ${
                          selected ? 'border-primary ring-1 ring-primary bg-surface-container-low' : 'border-outline-variant hover:bg-surface-container-low'
                        }`}
                      >
                        <AccountAvatar account={a} />
                        <div className="min-w-0 flex-1">
                          <p className="text-body-md font-semibold text-on-surface truncate">
                            {a.username ? `@${a.username}` : a.display_name ?? a.id}
                          </p>
                          <p className="font-label text-label-sm uppercase text-on-surface-variant capitalize">{a.platform}</p>
                        </div>
                        {selected && (
                          <span className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
                            <Check size={14} strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <FieldError message={fieldStatus(errors.accountId)} />
            </div>

            <div>
              <FieldLabel>Reply with</FieldLabel>
              {caps?.caveat && <p className="text-[13px] text-on-surface-variant -mt-1 mb-2">{caps.caveat}</p>}
              <Segmented
                value={effectiveReplyChannel}
                onChange={v => setReplyChannel(v as AutomationReplyChannel)}
                options={[
                  { value: 'comment', label: 'Public reply', icon: <MessageSquare size={15} />, disabled: !commentAllowed },
                  { value: 'dm', label: 'DM', icon: <Send size={15} />, disabled: !dmAllowed },
                  { value: 'both', label: 'Both', icon: <MessagesSquare size={15} />, disabled: !commentAllowed || !dmAllowed },
                ]}
              />
            </div>
          </div>
        );

      case 'post':
        return (
          <div className="space-y-6">
            <div>
              <FieldLabel>Which posts trigger this?</FieldLabel>
              <Segmented
                value={postScope}
                onChange={v => setPostScope(v as 'all' | 'specific')}
                options={[
                  { value: 'all', label: 'All posts' },
                  { value: 'specific', label: 'A specific post', disabled: !accountId },
                ]}
              />
              <p className="text-[13px] text-on-surface-variant mt-2">
                {postScope === 'all'
                  ? 'Populr watches every post on this account for your keywords.'
                  : 'Only the post you pick will trigger this automation.'}
              </p>
            </div>

            {postScope === 'specific' && accountId && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                    <input
                      className={`${inputBase} pl-9`}
                      value={postSearch}
                      onChange={e => setPostSearch(e.target.value)}
                      placeholder={postsLoading ? 'Loading your posts…' : 'Search your posts…'}
                      disabled={postsLoading}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSyncPosts}
                    disabled={postsSyncing}
                    title="Refresh your posts"
                    className="shrink-0 w-11 h-11 rounded-xl border border-outline-variant flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={postsSyncing ? 'animate-spin' : ''} />
                  </button>
                </div>

                {postsError && (
                  <p className="flex items-center gap-1.5 text-[13px] text-error"><AlertCircle size={13} /> {postsError}</p>
                )}

                {postsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-on-surface-variant">
                    <Loader2 size={18} className="animate-spin" /> Loading your posts…
                  </div>
                ) : filteredPosts.length === 0 ? (
                  <div className={`${card} p-6 text-center`}>
                    <ImageIcon size={22} className="text-on-surface-variant mx-auto mb-2" />
                    <p className="text-body-md text-on-surface">
                      {libraryPosts.length === 0 ? 'No posts synced yet.' : 'No posts match your search.'}
                    </p>
                    {libraryPosts.length === 0 && (
                      <p className="text-[13px] text-on-surface-variant mt-1">Try “Sync”, or paste a link below.</p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[340px] overflow-y-auto pr-1">
                    {filteredPosts.map(p => {
                      const selected = p.id === sourcePostId;
                      const caption = p.caption?.trim();
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSourcePostId(p.id)}
                          className={`flex items-center gap-3 text-left rounded-xl border p-2.5 transition-colors ${
                            selected ? 'border-primary ring-1 ring-primary bg-surface-container-low' : 'border-outline-variant hover:bg-surface-container-low'
                          }`}
                        >
                          {p.media_url ? (
                            <img src={p.media_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                          ) : (
                            <span className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0">
                              <ImageIcon size={18} />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-body-md text-on-surface truncate">
                              {caption || `Post ${p.external_post_id}`}
                            </p>
                            {p.published_at && (
                              <p className="font-label text-label-sm uppercase text-on-surface-variant">
                                {new Date(p.published_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </p>
                            )}
                          </div>
                          {selected && (
                            <span className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
                              <Check size={12} strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowFindMissing(v => !v)}
                  className="text-[13px] text-on-surface-variant hover:text-primary underline"
                >
                  Can’t find your post? Paste the link
                </button>
                {showFindMissing && (
                  <div className="flex items-center gap-2">
                    <input
                      className={inputBase}
                      value={missingUrl}
                      onChange={e => setMissingUrl(e.target.value)}
                      placeholder="https://instagram.com/p/…"
                    />
                    <button
                      type="button"
                      onClick={handleFindMissing}
                      disabled={findingMissing || !missingUrl.trim()}
                      className="shrink-0 inline-flex items-center gap-1.5 bg-primary text-on-primary rounded-xl px-4 py-3 text-body-md font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {findingMissing ? <Loader2 size={15} className="animate-spin" /> : 'Find'}
                    </button>
                  </div>
                )}
                <FieldError message={fieldStatus(errors.sourcePostId)} />
              </div>
            )}
          </div>
        );

      case 'replies':
        return (
          <div className="space-y-7">
            <div>
              <FieldLabel>Trigger keywords</FieldLabel>
              <input
                className={inputBase}
                value={keywordsText}
                onChange={e => setKeywordsText(e.target.value)}
                placeholder="link, guide, price"
              />
              <p className="text-[13px] text-on-surface-variant mt-1.5">Comma-separated. Matching is case-insensitive.</p>
              <FieldError message={fieldStatus(errors.keywords)} />
            </div>

            <div>
              <FieldLabel>Match mode</FieldLabel>
              <Segmented
                value={matchMode}
                onChange={v => setMatchMode(v as AutomationMatchMode)}
                options={MATCH_MODES.map(m => ({ value: m.value, label: m.label }))}
              />
            </div>

            {wantsComment && (
              <div>
                <FieldLabel>Public reply text</FieldLabel>
                <textarea
                  className={`${inputBase} min-h-[80px] resize-y`}
                  value={commentReplyBody}
                  onChange={e => setCommentReplyBody(e.target.value)}
                  placeholder="Thanks! Check your DMs 👋"
                  rows={2}
                />
                <FieldError message={fieldStatus(errors.commentReplyBody)} />
              </div>
            )}

            {wantsDm && (
              <div>
                <FieldLabel>DM text</FieldLabel>
                <textarea
                  className={`${inputBase} min-h-[96px] resize-y`}
                  value={messageBody}
                  onChange={e => setMessageBody(e.target.value)}
                  placeholder="Hey {{name}}! Here's the link you asked about: {{link}}"
                  rows={3}
                />
                <FieldError message={fieldStatus(errors.messageBody)} />
              </div>
            )}

            <div>
              <FieldLabel optional>Link</FieldLabel>
              <div className="relative">
                <Link2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  className={`${inputBase} pl-9`}
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  placeholder="https://your-link.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel optional>Tags</FieldLabel>
                <input
                  className={inputBase}
                  value={tagsText}
                  onChange={e => setTagsText(e.target.value)}
                  placeholder="lead_magnet, warm"
                />
              </div>
              <div>
                <FieldLabel optional>Score increase</FieldLabel>
                <input
                  type="number"
                  min={0}
                  className={inputBase}
                  value={scoreDelta}
                  onChange={e => setScoreDelta(Number(e.target.value))}
                />
              </div>
            </div>

            <div className={`${card} p-4 flex items-start justify-between gap-4`}>
              <div>
                <p className="text-body-md font-semibold text-on-surface">Review-first</p>
                <p className="text-[13px] text-on-surface-variant mt-0.5">Draft a reply for you to approve instead of sending it automatically.</p>
              </div>
              <Toggle checked={reviewFirst} onChange={setReviewFirst} label="Review-first" />
            </div>

            {/* ── Live AI test chat ── */}
            <div className={`${card} overflow-hidden`}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-variant bg-surface-container-low">
                <Sparkles size={16} className="text-on-surface" />
                <p className="text-body-md font-semibold text-on-surface">Test the reply</p>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-[13px] text-on-surface-variant">
                  Type a sample comment or DM and see exactly how Populr’s AI would respond — nothing is sent.
                </p>
                {testHistory.length > 0 && (
                  <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                    {testHistory.map((ex, i) => (
                      <TestBubble key={i} exchange={ex} fallbackReply={fallbackReply} />
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    className={inputBase}
                    value={testInput}
                    onChange={e => setTestInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runTest(); } }}
                    placeholder={selectedAccount ? 'e.g. do you have a discount?' : 'Pick an account first'}
                    disabled={!selectedAccount}
                  />
                  <button
                    type="button"
                    onClick={runTest}
                    disabled={!selectedAccount || !testInput.trim()}
                    className="shrink-0 inline-flex items-center gap-1.5 bg-primary text-on-primary rounded-xl px-4 py-3 text-body-md font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                  >
                    Test
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      case 'review':
        return (
          <div className="space-y-5">
            {serverProblems.length > 0 && (
              <div className="rounded-xl border border-error/40 bg-error-container/40 p-4">
                <p className="flex items-center gap-2 text-body-md font-semibold text-on-error-container">
                  <AlertCircle size={16} /> This automation can’t be saved as configured
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-0.5 text-[14px] text-on-error-container">
                  {serverProblems.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            )}

            <div className={`${card} px-5 py-1`}>
              <SummaryRow label="Name">{name.trim() || '—'}</SummaryRow>
              <SummaryRow label="Account">
                {selectedAccount
                  ? (selectedAccount.username ? `@${selectedAccount.username}` : selectedAccount.display_name ?? selectedAccount.id)
                  : '—'}
                {selectedAccount && <span className="text-on-surface-variant capitalize"> · {selectedAccount.platform}</span>}
              </SummaryRow>
              <SummaryRow label="Posts">
                {postScope === 'all'
                  ? 'All posts'
                  : selectedPost
                    ? (() => {
                        const cap = selectedPost.caption?.trim();
                        if (!cap) return `Post ${selectedPost.external_post_id}`;
                        return cap.length > 48 ? `${cap.slice(0, 48)}…` : cap;
                      })()
                    : 'A specific post'}
              </SummaryRow>
              <SummaryRow label="Keywords">
                {keywordsText.split(',').map(k => k.trim()).filter(Boolean).join(', ') || '—'}
              </SummaryRow>
              <SummaryRow label="Match">{MATCH_MODES.find(m => m.value === matchMode)?.label}</SummaryRow>
              <SummaryRow label="Reply with">
                <span className="inline-flex items-center gap-1.5 justify-end">
                  {(() => { const Icon = CHANNEL_ICON[effectiveReplyChannel]; return <Icon size={14} className="text-on-surface-variant" />; })()}
                  {CHANNEL_LABEL[effectiveReplyChannel]}
                </span>
              </SummaryRow>
              {wantsComment && commentReplyBody.trim() && (
                <SummaryRow label="Public reply">{commentReplyBody.trim()}</SummaryRow>
              )}
              {wantsDm && messageBody.trim() && (
                <SummaryRow label="DM">{messageBody.trim()}</SummaryRow>
              )}
              {linkUrl.trim() && <SummaryRow label="Link">{linkUrl.trim()}</SummaryRow>}
              {tagsText.split(',').map(t => t.trim()).filter(Boolean).length > 0 && (
                <SummaryRow label="Tags">{tagsText.split(',').map(t => t.trim()).filter(Boolean).join(', ')}</SummaryRow>
              )}
              {Number(scoreDelta) > 0 && <SummaryRow label="Score increase">+{Number(scoreDelta)}</SummaryRow>}
              <SummaryRow label="Sending">{reviewFirst ? 'Review-first (you approve)' : 'Automatic'}</SummaryRow>
            </div>

            <div className={`${card} p-4 flex items-start justify-between gap-4`}>
              <div>
                <p className="text-body-md font-semibold text-on-surface">Active</p>
                <p className="text-[13px] text-on-surface-variant mt-0.5">Paused automations record engagement but never send a reply.</p>
              </div>
              <Toggle checked={active} onChange={setActive} label="Active" />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-[760px] mx-auto px-container-padding-mobile md:px-container-padding-desktop py-8 md:py-10 pb-28">
        <button
          onClick={() => navigate('/automations')}
          className="inline-flex items-center gap-1.5 text-body-md font-medium text-on-surface-variant hover:text-primary transition-colors"
        >
          <ArrowLeft size={16} /> Back to automations
        </button>

        <div className="mt-5 mb-7">
          <h1 className="font-display text-headline-md md:text-display-lg-mobile text-on-surface">
            {editAuto ? 'Edit automation' : 'New automation'}
          </h1>
          <p className="font-body text-body-md text-on-surface-variant mt-1.5">
            When someone comments a keyword, Populr sends your approved reply, captures the contact, and tracks the conversation.
          </p>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => {
            const StepIcon = s.icon;
            const done = i < stepIndex;
            const current = i === stepIndex;
            return (
              <div key={s.key} className="flex items-center gap-2 flex-1 last:flex-none">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      current ? 'bg-primary text-on-primary'
                      : done ? 'bg-secondary-container text-on-secondary-container'
                      : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    {done ? <Check size={15} strokeWidth={3} /> : <StepIcon size={15} />}
                  </span>
                  <span className={`hidden sm:block text-body-md font-medium truncate ${current || done ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <span className={`flex-1 h-px min-w-4 ${done ? 'bg-secondary-fixed-dim' : 'bg-surface-variant'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step body */}
        <div className={`${card} p-5 sm:p-7`}>
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: dir * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -24 }}
              transition={{ duration: 0.24, ease: [0.24, 1, 0.4, 1] }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Sticky action bar */}
        <div className="sticky bottom-4 mt-6 flex items-center justify-between gap-3 rounded-full border border-outline-variant bg-surface-container-lowest/90 backdrop-blur px-3 py-2.5 shadow-card">
          <button
            onClick={stepIndex === 0 ? () => navigate('/automations') : goBack}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-body-md font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <ArrowLeft size={16} /> {stepIndex === 0 ? 'Cancel' : 'Back'}
          </button>

          <span className="font-label text-label-sm uppercase text-on-surface-variant hidden sm:block">
            Step {stepIndex + 1} of {STEPS.length}
          </span>

          {isLast ? (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-secondary-fixed text-on-secondary-fixed px-6 py-2.5 text-body-md font-semibold hover:bg-secondary-fixed-dim transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.5} />}
              {editAuto ? 'Update automation' : 'Create automation'}
            </button>
          ) : (
            <button
              onClick={goNext}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary text-on-primary px-6 py-2.5 text-body-md font-semibold hover:opacity-90 transition-opacity"
            >
              Continue <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
