import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useApp } from '../context/AppContext';
import {
  createAutomation, updateAutomation, fetchCapabilities,
  ApiError,
} from '../lib/api';
import type {
  AutomationRecord, AutomationInput, AutomationMatchMode, AutomationReplyChannel,
  PlatformCapabilities,
} from '../lib/api';
import {
  ChevronLeft, Check, AlertTriangle, Loader2,
} from 'lucide-react';

const MATCH_MODES: { value: AutomationMatchMode; label: string }[] = [
  { value: 'contains', label: 'Contains the keyword' },
  { value: 'exact', label: 'Matches exactly' },
  { value: 'starts_with', label: 'Starts with the keyword' },
];

export default function AutomationBuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast, accounts } = useApp();
  // Editing: AutomationsPage navigates here with the real, backend-shaped
  // record (never the old mock Automation type) via router state.
  const editAuto = (location.state as { automation?: AutomationRecord } | null)?.automation ?? null;

  const connectedAccounts = useMemo(() => accounts.filter(a => a.status === 'connected'), [accounts]);

  const [name, setName] = useState(editAuto?.name ?? '');
  const [accountId, setAccountId] = useState(editAuto?.account_id ?? '');
  const [postScope, setPostScope] = useState<'all' | 'specific'>(editAuto?.source_post_id ? 'specific' : 'all');
  const [sourcePostId, setSourcePostId] = useState(editAuto?.source_post_id ?? '');
  const [keywordsText, setKeywordsText] = useState((editAuto?.keywords ?? []).join(', '));
  const [matchMode, setMatchMode] = useState<AutomationMatchMode>(editAuto?.match_mode ?? 'contains');
  const [replyChannel, setReplyChannel] = useState<AutomationReplyChannel>(editAuto?.reply_channel ?? 'comment');
  const [commentReplyBody, setCommentReplyBody] = useState(editAuto?.comment_reply_body ?? '');
  const [messageBody, setMessageBody] = useState(editAuto?.message_body ?? '');
  const [linkUrl, setLinkUrl] = useState(editAuto?.link_url ?? '');
  const [tagsText, setTagsText] = useState((editAuto?.tags ?? []).join(', '));
  const [scoreDelta, setScoreDelta] = useState(editAuto?.score_delta ?? 0);
  const [reviewFirst, setReviewFirst] = useState(editAuto?.ai_enabled && editAuto?.ai_mode === 'suggest');
  const [active, setActive] = useState(editAuto?.active ?? true);

  const [capabilities, setCapabilities] = useState<Record<string, PlatformCapabilities>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverProblems, setServerProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCapabilities()
      .then(list => setCapabilities(Object.fromEntries(list.map(c => [c.platform, c]))))
      .catch(err => console.error('[automations] failed to load platform capabilities:', err));
  }, []);

  const selectedAccount = connectedAccounts.find(a => a.id === accountId) ?? null;
  const caps = selectedAccount ? capabilities[selectedAccount.platform] : undefined;

  // Never invented client-side: whether comment replies / DMs are even
  // offered as options is driven entirely by the same capability matrix
  // the backend enforces on save (GET /api/capabilities). If capabilities
  // haven't loaded yet, options are shown but the backend still has the
  // final say when the form is submitted.
  const commentAllowed = !caps || caps.supportsCommentReplies;
  const dmAllowed = !caps || caps.supportsDMs;

  // If the stored preference becomes unavailable (account changed, or
  // capabilities just loaded), derive whichever channel is actually
  // supported for display and save rather than silently submitting one
  // that isn't — computed at render time so it never fights a user's direct
  // click with a stale correction from the previous render.
  const effectiveReplyChannel: AutomationReplyChannel =
    replyChannel === 'comment' && !commentAllowed && dmAllowed ? 'dm'
    : replyChannel === 'dm' && !dmAllowed && commentAllowed ? 'comment'
    : replyChannel === 'both' && (!commentAllowed || !dmAllowed) ? (commentAllowed ? 'comment' : dmAllowed ? 'dm' : 'comment')
    : replyChannel;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Enter an automation name';
    if (!accountId) e.accountId = 'Select a connected account';
    if (!keywordsText.trim()) e.keywords = 'Enter at least one trigger keyword';
    if (postScope === 'specific' && !String(sourcePostId).trim()) e.sourcePostId = 'Enter the post ID, or switch to All posts';
    if ((effectiveReplyChannel === 'comment' || effectiveReplyChannel === 'both') && !commentReplyBody.trim()) {
      e.commentReplyBody = 'Enter the public reply text';
    }
    if ((effectiveReplyChannel === 'dm' || effectiveReplyChannel === 'both') && !messageBody.trim()) {
      e.messageBody = 'Enter the DM text';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    setServerProblems([]);
    if (!validate()) return;
    setSaving(true);
    try {
      const input: AutomationInput = {
        name: name.trim(),
        accountId,
        platform: selectedAccount!.platform,
        allPosts: postScope === 'all',
        sourcePostId: postScope === 'specific' ? Number(sourcePostId) : null,
        keywords: keywordsText.split(',').map(k => k.trim()).filter(Boolean),
        matchMode,
        replyChannel: effectiveReplyChannel,
        commentReplyBody: (effectiveReplyChannel === 'comment' || effectiveReplyChannel === 'both') ? commentReplyBody.trim() : null,
        messageBody: (effectiveReplyChannel === 'dm' || effectiveReplyChannel === 'both') ? messageBody.trim() : null,
        linkUrl: linkUrl.trim() || null,
        tags: tagsText.split(',').map(t => t.trim()).filter(Boolean),
        scoreDelta: Number(scoreDelta) || 0,
        active,
        // "Review-first" reuses Smart Replies' suggest mode — the one real
        // backend concept for "draft it, but a human sends it" — rather
        // than a client-invented review gate the engine doesn't implement.
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
        // The backend's own capability-matrix rejection — its message list
        // is safe, Populr-authored text (see automations.ts capabilityProblems),
        // never a raw provider error.
        setServerProblems(err.details ?? [err.message]);
      } else {
        showToast(err instanceof Error ? err.message : 'Could not save this automation.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pop-page max-w-[640px]">
      <button onClick={() => navigate('/automations')} className="pop-btn-ghost mb-5">
        <ChevronLeft size={16} />Back to automations
      </button>

      <h1 className="pop-section-heading mb-1">{editAuto ? 'Edit automation' : 'Create automation'}</h1>
      <p className="pop-body mb-6">
        When someone comments a keyword on Instagram, Populr sends an approved reply, saves them as a contact, and tracks the conversation.
      </p>

      {serverProblems.length > 0 && (
        <div className="bg-[#FEE2E2] border border-[#FCA5A5] rounded-xl p-4 mb-5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
          <div className="text-[13px] text-[#991B1B] space-y-1">
            {serverProblems.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="text-[12px] font-medium text-[#111111] mb-1 block">Automation name</label>
          {errors.name && <p className="text-[11px] text-coral mb-1 flex items-center gap-1"><AlertTriangle size={10} />{errors.name}</p>}
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g., Free guide keyword"
            className={`pop-input w-full ${errors.name ? 'border-coral' : ''}`} />
        </div>

        <div>
          <label className="text-[12px] font-medium text-[#111111] mb-1 block">Connected account</label>
          {errors.accountId && <p className="text-[11px] text-coral mb-1 flex items-center gap-1"><AlertTriangle size={10} />{errors.accountId}</p>}
          {connectedAccounts.length === 0 ? (
            <p className="text-[12px] text-[#6B6B6B]">
              No connected accounts yet. <button onClick={() => navigate('/connections')} className="underline">Connect one</button> first.
            </p>
          ) : (
            <select value={accountId} onChange={e => setAccountId(e.target.value)}
              className={`pop-input w-full ${errors.accountId ? 'border-coral' : ''}`}>
              <option value="">Select an account…</option>
              {connectedAccounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.platform} — {a.username ? `@${a.username}` : a.display_name ?? a.id}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="text-[12px] font-medium text-[#111111] mb-1 block">Which posts</label>
          <div className="flex gap-2">
            <button onClick={() => setPostScope('all')}
              className={`flex-1 border rounded-lg px-3 py-2 text-[12px] font-medium transition-all ${postScope === 'all' ? 'border-[#111111] bg-[#FAFAF8] text-[#111111]' : 'border-[#E8E4DF] text-[#6B6B6B]'}`}>
              All posts
            </button>
            <button onClick={() => setPostScope('specific')}
              className={`flex-1 border rounded-lg px-3 py-2 text-[12px] font-medium transition-all ${postScope === 'specific' ? 'border-[#111111] bg-[#FAFAF8] text-[#111111]' : 'border-[#E8E4DF] text-[#6B6B6B]'}`}>
              Specific post
            </button>
          </div>
          {postScope === 'specific' && (
            <div className="mt-2">
              {errors.sourcePostId && <p className="text-[11px] text-coral mb-1 flex items-center gap-1"><AlertTriangle size={10} />{errors.sourcePostId}</p>}
              <input type="text" value={sourcePostId} onChange={e => setSourcePostId(e.target.value)}
                placeholder="Post ID"
                className={`pop-input w-full ${errors.sourcePostId ? 'border-coral' : ''}`} />
            </div>
          )}
        </div>

        <div>
          <label className="text-[12px] font-medium text-[#111111] mb-1 block">Trigger keywords</label>
          {errors.keywords && <p className="text-[11px] text-coral mb-1 flex items-center gap-1"><AlertTriangle size={10} />{errors.keywords}</p>}
          <input type="text" value={keywordsText} onChange={e => setKeywordsText(e.target.value)}
            placeholder="link, guide, price"
            className={`pop-input w-full ${errors.keywords ? 'border-coral' : ''}`} />
          <p className="text-[11px] text-[#9B9B8F] mt-1">Comma-separated. Matching is case-insensitive.</p>
        </div>

        <div>
          <label className="text-[12px] font-medium text-[#111111] mb-1 block">Match mode</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {MATCH_MODES.map(m => (
              <button key={m.value} onClick={() => setMatchMode(m.value)}
                className={`border rounded-lg px-3 py-2 text-[11px] font-medium text-left transition-all ${matchMode === m.value ? 'border-[#111111] bg-[#FAFAF8] text-[#111111]' : 'border-[#E8E4DF] text-[#6B6B6B]'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[12px] font-medium text-[#111111] mb-1 block">Reply with</label>
          {caps?.caveat && (
            <p className="text-[11px] text-[#9B9B8F] mb-2 leading-relaxed">{caps.caveat}</p>
          )}
          <div className="flex gap-2">
            <button onClick={() => commentAllowed && setReplyChannel('comment')} disabled={!commentAllowed}
              className={`flex-1 border rounded-lg px-3 py-2 text-[12px] font-medium transition-all ${effectiveReplyChannel === 'comment' ? 'border-[#111111] bg-[#FAFAF8] text-[#111111]' : 'border-[#E8E4DF] text-[#6B6B6B]'} ${!commentAllowed ? 'opacity-40 cursor-not-allowed' : ''}`}>
              Public reply
            </button>
            <button onClick={() => dmAllowed && setReplyChannel('dm')} disabled={!dmAllowed}
              className={`flex-1 border rounded-lg px-3 py-2 text-[12px] font-medium transition-all ${effectiveReplyChannel === 'dm' ? 'border-[#111111] bg-[#FAFAF8] text-[#111111]' : 'border-[#E8E4DF] text-[#6B6B6B]'} ${!dmAllowed ? 'opacity-40 cursor-not-allowed' : ''}`}>
              DM
            </button>
            <button onClick={() => commentAllowed && dmAllowed && setReplyChannel('both')} disabled={!commentAllowed || !dmAllowed}
              className={`flex-1 border rounded-lg px-3 py-2 text-[12px] font-medium transition-all ${effectiveReplyChannel === 'both' ? 'border-[#111111] bg-[#FAFAF8] text-[#111111]' : 'border-[#E8E4DF] text-[#6B6B6B]'} ${(!commentAllowed || !dmAllowed) ? 'opacity-40 cursor-not-allowed' : ''}`}>
              Both
            </button>
          </div>
        </div>

        {(effectiveReplyChannel === 'comment' || effectiveReplyChannel === 'both') && (
          <div>
            <label className="text-[12px] font-medium text-[#111111] mb-1 block">Public reply text</label>
            {errors.commentReplyBody && <p className="text-[11px] text-coral mb-1 flex items-center gap-1"><AlertTriangle size={10} />{errors.commentReplyBody}</p>}
            <textarea value={commentReplyBody} onChange={e => setCommentReplyBody(e.target.value)}
              placeholder="Thanks! Check your DMs 👋"
              className={`pop-input w-full h-16 resize-none ${errors.commentReplyBody ? 'border-coral' : ''}`} />
          </div>
        )}

        {(effectiveReplyChannel === 'dm' || effectiveReplyChannel === 'both') && (
          <div>
            <label className="text-[12px] font-medium text-[#111111] mb-1 block">DM text</label>
            {errors.messageBody && <p className="text-[11px] text-coral mb-1 flex items-center gap-1"><AlertTriangle size={10} />{errors.messageBody}</p>}
            <textarea value={messageBody} onChange={e => setMessageBody(e.target.value)}
              placeholder="Hey {{name}}! Here's the link you asked about: {{link}}"
              className={`pop-input w-full h-20 resize-none ${errors.messageBody ? 'border-coral' : ''}`} />
          </div>
        )}

        <div>
          <label className="text-[12px] font-medium text-[#111111] mb-1 block">Link (optional)</label>
          <input type="text" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
            placeholder="https://your-link.com" className="pop-input w-full" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[12px] font-medium text-[#111111] mb-1 block">Tags (optional)</label>
            <input type="text" value={tagsText} onChange={e => setTagsText(e.target.value)}
              placeholder="lead_magnet, warm" className="pop-input w-full" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-[#111111] mb-1 block">Score increase (optional)</label>
            <input type="number" value={scoreDelta} onChange={e => setScoreDelta(Number(e.target.value))}
              className="pop-input w-full" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between py-2 border-b border-[#E8E4DF]">
            <div>
              <span className="text-[13px] text-[#111111]">Review-first</span>
              <p className="text-[11px] text-[#6B6B6B]">Draft a reply for you to approve instead of sending it automatically.</p>
            </div>
            <button onClick={() => setReviewFirst(v => !v)}
              className={`w-10 h-6 rounded-full relative transition-all flex-shrink-0 ${reviewFirst ? 'bg-chartreuse' : 'bg-[#E8E4DF]'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${reviewFirst ? 'right-1' : 'left-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-[#E8E4DF]">
            <div>
              <span className="text-[13px] text-[#111111]">Active</span>
              <p className="text-[11px] text-[#6B6B6B]">Paused automations record engagement but never send a reply.</p>
            </div>
            <button onClick={() => setActive(v => !v)}
              className={`w-10 h-6 rounded-full relative transition-all flex-shrink-0 ${active ? 'bg-chartreuse' : 'bg-[#E8E4DF]'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${active ? 'right-1' : 'left-1'}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-3 pt-2 pb-8">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-chartreuse text-[#111111] rounded-[10px] py-2.5 text-[13px] font-semibold hover:bg-chartreuse-hover transition-all flex items-center justify-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Saving…' : editAuto ? 'Update automation' : 'Save automation'}
          </button>
        </div>
      </div>
    </div>
  );
}
