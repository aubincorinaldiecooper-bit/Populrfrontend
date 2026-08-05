import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, RefreshCw, Inbox as InboxIcon, Send, Check, Loader2, Sparkles, PenLine,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/PageHeader';
import PlatformDot from '../components/PlatformDot';
import { ListSkeleton } from '../components/Skeleton';
import {
  isBackendConfigured, fetchInbox, sendInboxReply, setInboxNeedsReply, ApiError,
} from '../lib/api';
import type { InboxItem } from '../lib/api';

/**
 * The conversations queue — the surface the backend has fed all along.
 * Items land here when the AI sends a holding reply for a question the
 * automation's instructions don't cover, when an escalation keyword or the
 * AI routes something to a human, or when a reply is parked for review.
 * This page closes that loop: read the message, send the AI's draft with
 * one tap or write your own, in-channel.
 */

const PAGE_SIZE = 30;

/** Why this conversation needs the creator, in the creator's language. */
const REASON_LABEL: Record<string, string> = {
  no_rule_matched: 'No automation matched',
  ai_handoff: 'AI asked for you',
  ai_needs_review: 'Draft ready for review',
  escalation_keyword: 'Sensitive keyword',
  automation_failed: 'Automation failed',
  unsupported_action: "Couldn't send automatically",
  user_replied: 'They replied',
  score_threshold: 'Hot lead',
  manual: 'Flagged by you',
};

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

type Tab = 'needs_you' | 'all';

export default function InboxPage() {
  const { showToast } = useApp();
  const backendConfigured = isBackendConfigured();

  const [tab, setTab] = useState<Tab>('needs_you');
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(backendConfigured);
  const [loadingMore, setLoadingMore] = useState(false);
  // The API returns no total, so "is there more?" is inferred: a full page
  // implies there may be another one behind it.
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Monotonic request id: only the newest in-flight fetch may write state.
  // Without it, switching tabs while a slow request is in flight lets the
  // older response land last and show the previous tab's queue under the
  // newly selected one. Same pattern as ContactsPage.
  const requestSeq = useRef(0);

  // Which item has its composer open, and its draft text. One at a time —
  // replying is a focused act, not a spreadsheet.
  const [composerFor, setComposerFor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const runFetch = useCallback(async ({ offset, append }: { offset: number; append: boolean }) => {
    if (!backendConfigured) return;
    const seq = ++requestSeq.current;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetchInbox({
        needsReply: tab === 'needs_you' ? true : undefined,
        limit: PAGE_SIZE,
        offset,
      });
      if (seq !== requestSeq.current) return; // superseded by a newer fetch
      setItems(prev => (append ? [...prev, ...res.items] : res.items));
      setHasMore(res.items.length === PAGE_SIZE);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      const msg = err instanceof Error ? err.message : 'Could not load your inbox.';
      if (append) showToast(msg, 'error');
      else setError(msg);
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [backendConfigured, tab, showToast]);

  const load = useCallback(() => runFetch({ offset: 0, append: false }), [runFetch]);
  const loadMore = useCallback(
    () => runFetch({ offset: items.length, append: true }),
    [runFetch, items.length],
  );

  useEffect(() => {
    // Data fetch from the backend, not derived state — see ContactsPage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const send = async (item: InboxItem, input: { text?: string; useSuggested?: boolean }) => {
    setSending(item.id);
    try {
      const result = await sendInboxReply(item.id, input);
      showToast(`Reply sent on ${result.channel === 'dm' ? 'DM' : 'the comment thread'}.`, 'success');
      setComposerFor(null);
      setDraft('');
      load();
    } catch (err) {
      // 422 means the platform genuinely can't carry this reply — say that,
      // not a generic failure.
      const msg = err instanceof ApiError && err.code === 'not_supported_on_platform'
        ? err.message
        : err instanceof Error ? err.message : 'Could not send this reply.';
      showToast(msg, 'error');
    } finally {
      setSending(null);
    }
  };

  const resolve = async (item: InboxItem) => {
    setResolving(item.id);
    try {
      await setInboxNeedsReply(item.id, false);
      showToast('Marked handled', 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update this conversation.', 'error');
    } finally {
      setResolving(null);
    }
  };

  if (!backendConfigured) {
    return (
      <div className="pop-page max-w-[760px]">
        <PageHeader title="Inbox" subtitle="Conversations that need you, with AI drafts ready to send." />
        <div className="pop-card p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to a backend yet</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Populr can&apos;t reach its server, so your conversations can&apos;t be loaded right now.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pop-page max-w-[760px]">
      <PageHeader
        title="Inbox"
        subtitle="Conversations that need you, with AI drafts ready to send."
        action={
          <button onClick={load} disabled={loading} className="pop-btn-ghost text-[12px] py-1.5 px-3 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh
          </button>
        }
      />

      <div className="flex gap-1 mb-5">
        {([['needs_you', 'Needs you'], ['all', 'All conversations']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all ${tab === key ? 'bg-[#111111] text-white' : 'text-[#6B6B6B] hover:bg-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <ListSkeleton count={4} label="Loading your conversations" />}

      {!loading && error && (
        <div className="pop-card p-4 flex items-center gap-3">
          <AlertCircle size={16} className="text-[#DC2626] flex-shrink-0" />
          <p className="text-[13px] text-[#111111] flex-1">{error}</p>
          <button onClick={load} className="pop-btn-tertiary text-[12px] py-1.5 px-3">Retry</button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="pop-card p-8 text-center">
          <InboxIcon size={24} className="text-[#9B9B8F] mx-auto mb-3" />
          <p className="text-[14px] font-bold text-[#111111]">
            {tab === 'needs_you' ? "You're all caught up" : 'No conversations yet'}
          </p>
          <p className="text-[12px] text-[#6B6B6B] mt-1.5 max-w-sm mx-auto">
            {tab === 'needs_you'
              ? 'Nothing needs a personal reply right now. Questions your automations can’t answer land here with an AI draft ready to go.'
              : 'Conversations appear here once your automations start talking to people.'}
          </p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="space-y-3">
          {items.map(item => {
            const personLabel = item.contact_handle ? `@${item.contact_handle}` : item.contact_name || 'Unknown person';
            const reason = item.needs_reply_reason ? REASON_LABEL[item.needs_reply_reason] ?? item.needs_reply_reason : null;
            const composing = composerFor === item.id;
            const busy = sending === item.id;
            return (
              <div key={item.id} className="pop-card p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-[#111111]">{personLabel}</span>
                  <PlatformDot platform={item.platform} size={7} />
                  <span className="text-[11px] text-[#9B9B8F] capitalize">{item.platform} {item.channel === 'dm' ? 'DM' : 'comment'}</span>
                  <span className="text-[11px] text-[#9B9B8F]">· {timeAgo(item.created_at)}</span>
                  {item.needs_reply && reason && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FFF3E0] text-[#D97706] ml-auto">
                      {reason}
                    </span>
                  )}
                </div>

                {item.message_text && (
                  <p className="text-[13px] text-[#111111] mt-2 leading-relaxed">&ldquo;{item.message_text}&rdquo;</p>
                )}
                {item.post_caption && (
                  <p className="text-[11px] text-[#9B9B8F] mt-1 line-clamp-1">On: {item.post_caption}</p>
                )}

                {/* The AI's parked draft: one tap sends it exactly as written
                    (the backend's useSuggested path), or edit it first. */}
                {item.suggested_reply && !composing && (
                  <div className="mt-3 bg-[#FAFAF8] rounded-xl p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9B9B8F] mb-1 flex items-center gap-1">
                      <Sparkles size={11} /> Suggested reply
                    </p>
                    <p className="text-[13px] text-[#111111] leading-relaxed">{item.suggested_reply}</p>
                  </div>
                )}

                {composing ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      rows={3}
                      autoFocus
                      aria-label={`Reply to ${personLabel}`}
                      placeholder="Write your reply..."
                      className="w-full bg-white border border-[#E8E4DF] rounded-xl px-3.5 py-2.5 text-[13px] placeholder:text-[#9B9B8F] outline-none focus-visible:ring-2 focus-visible:ring-chartreuse/40 resize-y"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => send(item, { text: draft.trim() })}
                        disabled={!draft.trim() || busy}
                        className="pop-btn-primary text-[12px] py-1.5 px-3 disabled:opacity-40"
                      >
                        {busy ? <><Loader2 size={13} className="animate-spin" />Sending…</> : <><Send size={13} />Send</>}
                      </button>
                      <button
                        onClick={() => { setComposerFor(null); setDraft(''); }}
                        disabled={busy}
                        className="pop-btn-ghost text-[12px] py-1.5 px-3 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {item.suggested_reply && (
                      <button
                        onClick={() => send(item, { useSuggested: true })}
                        disabled={busy}
                        className="pop-btn-primary text-[12px] py-1.5 px-3 disabled:opacity-50"
                      >
                        {busy ? <><Loader2 size={13} className="animate-spin" />Sending…</> : <><Send size={13} />Send suggested reply</>}
                      </button>
                    )}
                    <button
                      onClick={() => { setComposerFor(item.id); setDraft(item.suggested_reply ?? ''); }}
                      className="pop-btn-tertiary text-[12px] py-1.5 px-3"
                    >
                      <PenLine size={13} />{item.suggested_reply ? 'Edit & send' : 'Reply'}
                    </button>
                    {item.needs_reply && (
                      <button
                        onClick={() => resolve(item)}
                        disabled={resolving === item.id}
                        className="pop-btn-ghost text-[12px] py-1.5 px-3 disabled:opacity-50"
                      >
                        {resolving === item.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Mark handled
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && hasMore && (
        <div className="flex justify-center mt-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="pop-btn-tertiary text-[12px] py-1.5 px-4 disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
