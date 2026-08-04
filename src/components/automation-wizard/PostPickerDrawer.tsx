import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Loader2, AlertCircle, Instagram } from 'lucide-react';
import PostCarousel from './PostCarousel';
import type { Post } from '../../lib/api';

type SortTab = 'recent' | 'most-comments';

export default function PostPickerDrawer({
  open, posts, loading, error, selectedId, onCancel, onUse, onRetry,
}: {
  open: boolean;
  posts: Post[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onCancel: () => void;
  onUse: (post: Post) => void;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<SortTab>('recent');
  const [focusedId, setFocusedId] = useState<string | null>(selectedId);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      // Resetting local UI state when the drawer opens (an external trigger),
      // not deriving state from props during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocusedId(selectedId);
      setSearch('');
      setTab('recent');
      drawerRef.current?.focus();
    }
  }, [open, selectedId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  const filtered = useMemo(() => {
    let result = [...posts];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p => (p.caption ?? '').toLowerCase().includes(q));
    }
    if (tab === 'most-comments') {
      result = result.sort((a, b) => Number(b.comments ?? 0) - Number(a.comments ?? 0));
    } else {
      result = result.sort((a, b) => new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime());
    }
    return result;
  }, [posts, search, tab]);

  const focusedPost = filtered.find(p => p.id === focusedId) ?? null;

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onCancel} />
      <div
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Change post"
        className="fixed top-0 right-0 h-screen w-full sm:w-[480px] bg-white z-50 shadow-2xl flex flex-col outline-none"
      >
        <div className="px-5 py-4 border-b border-[#E8E4DF] flex items-center justify-between flex-shrink-0">
          <h2 className="font-geist font-bold text-base text-[#111111]">Change post</h2>
          <button onClick={onCancel} aria-label="Close" className="p-1.5 hover:bg-[#FAFAF8] rounded-lg transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-[#E8E4DF] flex-shrink-0 space-y-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F]" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search posts..."
              className="w-full border border-[#E8E4DF] rounded-lg pl-9 pr-3 py-2 text-[13px] placeholder:text-[#9B9B8F] focus:outline-none focus-visible:border-chartreuse focus-visible:ring-2 focus-visible:ring-chartreuse/20 transition-all" />
          </div>
          <div className="flex gap-1.5">
            {([{ key: 'recent', label: 'Recent' }, { key: 'most-comments', label: 'Most comments' }] as { key: SortTab; label: string }[]).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${tab === t.key ? 'bg-[#111111] text-white' : 'bg-[#FAFAF8] text-[#6B6B6B] hover:bg-[#F0EEEA]'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-16 text-[#6B6B6B]">
              <Loader2 size={20} className="animate-spin mr-2" />Loading posts...
            </div>
          )}
          {!loading && error && (
            <div className="flex flex-col items-center text-center py-12 gap-3">
              <AlertCircle size={22} className="text-[#DC2626]" />
              <p className="text-[13px] text-[#111111]">{error}</p>
              <button onClick={onRetry} className="pop-btn-tertiary text-[12px] py-1.5 px-3">Retry</button>
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center text-center py-12 gap-2">
              <Instagram size={22} className="text-[#9B9B8F]" />
              <p className="text-[13px] font-semibold text-[#111111]">No posts found</p>
              <p className="text-[12px] text-[#6B6B6B]">{posts.length === 0 ? 'No Instagram posts synced yet.' : 'Try a different search.'}</p>
            </div>
          )}
          {!loading && !error && filtered.length > 0 && (
            <>
              <PostCarousel posts={filtered} selectedId={selectedId} focusedId={focusedId} onFocus={setFocusedId} />
              {focusedPost && (
                <div className="mt-4 pop-card p-3">
                  <p className="text-[12px] font-semibold text-[#111111] line-clamp-2">{focusedPost.caption || 'Untitled post'}</p>
                  <p className="text-[11px] text-[#9B9B8F] mt-1">{focusedPost.comments ?? 0} comments · {focusedPost.likes ?? 0} likes</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[#E8E4DF] flex items-center justify-between gap-3 flex-shrink-0">
          <button onClick={onCancel} className="pop-btn-tertiary flex-1 justify-center">Cancel</button>
          <button
            onClick={() => focusedPost && onUse(focusedPost)}
            disabled={!focusedPost}
            className="pop-btn-primary flex-1 justify-center disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Use this post
          </button>
        </div>
      </div>
    </>
  );
}
