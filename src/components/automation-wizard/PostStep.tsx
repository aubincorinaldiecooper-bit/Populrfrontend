import { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertCircle, Instagram } from 'lucide-react';
import { fetchPostsLibrary } from '../../lib/api';
import type { Post } from '../../lib/api';
import { useApp } from '../../context/AppContext';
import SelectedPostCard from './SelectedPostCard';
import PostPickerDrawer from './PostPickerDrawer';
import type { AutomationWizardApi } from './useAutomationWizard';

export default function PostStep({ wizard }: { wizard: AutomationWizardApi }) {
  const { state, update, pendingSourcePostId } = wizard;
  const { accounts } = useApp();
  const account = accounts.find(a => a.id === state.accountId);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(() => {
    if (!state.accountId) return;
    setLoading(true);
    setError(null);
    fetchPostsLibrary({ accountId: state.accountId })
      .then(list => {
        setPosts(list);
        // Hydrate the selected post when editing an automation whose post
        // hasn't loaded into wizard state yet.
        if (!state.post && pendingSourcePostId) {
          const match = list.find(p => p.id === String(pendingSourcePostId));
          if (match) update('post', match);
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load your Instagram posts.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.accountId]);

  useEffect(() => {
    // Data fetch from the backend, not derived state — see OpportunitiesPage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Choose the post to watch</h2>
        <p className="text-[12px] text-[#6B6B6B]">Populr listens for comments on this Instagram post.</p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-[#6B6B6B]">
          <Loader2 size={20} className="animate-spin mr-2" />Loading your posts...
        </div>
      )}

      {!loading && error && (
        <div className="pop-card p-5 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[#111111]">Couldn&apos;t load your posts</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">{error}</p>
          </div>
          <button onClick={load} className="pop-btn-tertiary text-[12px] py-1.5 px-3 flex-shrink-0">Retry</button>
        </div>
      )}

      {!loading && !error && !state.post && (
        <div className="pop-card p-8 flex flex-col items-center text-center gap-3">
          <Instagram size={22} className="text-[#9B9B8F]" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">{posts.length === 0 ? 'No Instagram posts yet' : 'No post selected'}</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">{posts.length === 0 ? "We haven't synced any posts from this account yet." : 'Pick the post you want this automation to watch.'}</p>
          </div>
          <button onClick={() => setDrawerOpen(true)} disabled={posts.length === 0} className="pop-btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
            Choose a post
          </button>
        </div>
      )}

      {!loading && !error && state.post && (
        <SelectedPostCard
          post={state.post}
          handle={account.username}
          triggerSummary={triggerSummary}
          onChangePost={() => setDrawerOpen(true)}
        />
      )}

      <PostPickerDrawer
        open={drawerOpen}
        posts={posts}
        loading={loading}
        error={error}
        selectedId={state.post?.id ?? null}
        onCancel={() => setDrawerOpen(false)}
        onRetry={load}
        onUse={post => { update('post', post); setDrawerOpen(false); }}
      />
    </div>
  );
}
