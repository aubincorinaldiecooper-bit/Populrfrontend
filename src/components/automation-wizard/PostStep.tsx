import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle, Instagram, RefreshCw } from 'lucide-react';
import { fetchPostsLibrary, syncPostsLibrary } from '../../lib/api';
import type { Post } from '../../lib/api';
import { useApp } from '../../context/AppContext';
import SelectedPostCard from './SelectedPostCard';
import { PostGridSkeleton } from '../Skeleton';
import PostPicker from './PostPicker';
import type { AutomationWizardApi } from './useAutomationWizard';

export default function PostStep({ wizard }: { wizard: AutomationWizardApi }) {
  const { state, update, pendingSourcePostId } = wizard;
  const { accounts } = useApp();
  const account = accounts.find(a => a.id === state.accountId);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // syncPostsLibrary can 200 with zero posts stored AND a real reason why
  // (Zernio auth/rate-limit/scope failure) in its `errors` array — that's
  // not an exception, so the try/catch in handleSync never sees it. Without
  // surfacing it, a real "Zernio couldn't read this account's posts"
  // failure looks identical to "this account genuinely has no posts,"
  // which is the whole ambiguity this field exists to remove.
  const [syncNote, setSyncNote] = useState<string | null>(null);

  // Auto-sync once per account per session when the library comes back
  // empty. Guarded so a genuinely-empty account (no Instagram posts at
  // all) doesn't loop forever.
  const autoSyncedFor = useRef<string | null>(null);

  const load = useCallback(async (): Promise<Post[]> => {
    if (!state.accountId) return [];
    // Any note belongs to whichever fetch produced it — a fresh attempt
    // (retry, account switch, or the initial load) starts clean.
    setSyncNote(null);
    setLoading(true);
    setError(null);
    try {
      const list = await fetchPostsLibrary({ accountId: state.accountId });
      setPosts(list);
      if (list.length > 0) setSyncNote(null);
      // Hydrate the selected post when editing an automation whose post
      // isn't yet in wizard state.
      if (!state.post && pendingSourcePostId) {
        const match = list.find(p => p.id === String(pendingSourcePostId));
        if (match) update('post', match);
      }
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your Instagram posts.');
      return [];
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.accountId]);

  const handleSync = useCallback(async () => {
    if (!state.accountId) return;
    setSyncing(true);
    setError(null);
    setSyncNote(null);
    try {
      const result = await syncPostsLibrary(state.accountId);
      const list = await load();
      // Zernio reported a real failure for this account (auth, rate limit,
      // scope, etc.) rather than "there's simply nothing to import" — worth
      // saying so explicitly, especially since the empty-list copy below
      // would otherwise read as "you have no posts," which may be false.
      if (list.length === 0 && result.errors.length > 0) {
        setSyncNote(result.errors[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sync your posts from Instagram.');
    } finally {
      setSyncing(false);
    }
  }, [state.accountId, load]);

  useEffect(() => {
    if (!state.accountId) return;
    let cancelled = false;
    (async () => {
      const initial = await load();
      // Empty library on the very first visit to this account? Zernio may
      // just not have synced yet — trigger it once so the user doesn't have
      // to hunt for the button. If the account really has no posts, the
      // re-fetch returns empty and we settle on the empty state.
      if (
        !cancelled &&
        initial.length === 0 &&
        autoSyncedFor.current !== state.accountId
      ) {
        autoSyncedFor.current = state.accountId;
        await handleSync();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.accountId]);

  if (!account) {
    return (
      <div className="pop-card p-5 flex items-start gap-3">
        <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-[#111111]">Instagram isn&apos;t connected</p>
          <p className="text-[12px] text-[#6B6B6B] mt-1">Connect your Instagram account from Channels to choose a post.</p>
        </div>
      </div>
    );
  }

  const triggerSummary = state.triggerKeywords.length > 0
    ? `Comments on this post will trigger: ${state.triggerKeywords.join(', ')}`
    : 'Comments on this post will trigger this automation once keywords are set.';

  const busy = loading || syncing;
  const busyLabel = syncing ? 'Syncing your posts from Instagram…' : 'Loading your posts…';

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Choose the post to watch</h2>
          <p className="text-[12px] text-[#6B6B6B]">Populr listens for comments on this Instagram post.</p>
        </div>
        <button
          onClick={handleSync}
          disabled={busy}
          className="pop-btn-tertiary text-[12px] py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Refresh your posts from Instagram"
        >
          <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync my posts'}
        </button>
      </div>

      {busy && (
        <div className="space-y-3">
          {/* The label still matters here: syncing from Instagram is a
              noticeably longer wait than a local library read, and the grid
              shape alone doesn't say which one is happening. */}
          <p className="text-[12px] text-[#6B6B6B] flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />{busyLabel}
          </p>
          <PostGridSkeleton count={6} label={busyLabel} />
        </div>
      )}

      {!busy && error && (
        <div className="pop-card p-5 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[#111111]">Couldn&apos;t load your posts</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">{error}</p>
          </div>
          <button onClick={() => void load()} className="pop-btn-tertiary text-[12px] py-1.5 px-3 flex-shrink-0">Retry</button>
        </div>
      )}

      {!busy && !error && syncNote && (
        <div className="bg-[#FEF3C7] text-[#92400E] px-3.5 py-2.5 rounded-xl text-[12px] flex items-start gap-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Instagram sync didn&apos;t fully succeed</p>
            <p className="mt-0.5">{syncNote}</p>
          </div>
        </div>
      )}

      {/* The chosen post stays pinned above the grid so "which post is this
          automation watching" is answerable without scrolling back. */}
      {!busy && !error && state.post && (
        <SelectedPostCard
          post={state.post}
          handle={account.username}
          triggerSummary={triggerSummary}
        />
      )}

      {!busy && !error && posts.length === 0 && (
        <div className="pop-card p-8 flex flex-col items-center text-center gap-3">
          <Instagram size={22} className="text-[#9B9B8F]" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">No Instagram posts found</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1 max-w-[380px]">
              {syncNote
                ? 'See the sync issue above, then try syncing again.'
                : "We synced this account and didn't find any posts yet. If you've posted recently, sync again in a moment."}
            </p>
          </div>
          <button onClick={handleSync} disabled={syncing} className="pop-btn-primary disabled:opacity-40">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />Sync my posts
          </button>
        </div>
      )}

      {!busy && !error && posts.length > 0 && (
        <PostPicker
          posts={posts}
          selectedId={state.post?.id ?? null}
          onSelect={post => update('post', post)}
        />
      )}
    </div>
  );
}
