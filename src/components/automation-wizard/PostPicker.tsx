import { useMemo, useState } from 'react';
import { Check, Instagram, MessageCircle, Heart, Search } from 'lucide-react';
import type { Post } from '../../lib/api';

type SortKey = 'recent' | 'most-comments';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Inline post picker for the automation wizard's Post step.
 *
 * Deliberately a grid rendered directly in the step rather than the previous
 * modal + horizontal carousel. The carousel forced a second click to open a
 * drawer, then paged 140px cards behind arrow buttons with one pagination dot
 * per post (unusable past a handful), and split selection across two competing
 * visual states — a green "Selected" badge on the saved post and a separate
 * ring on the one being previewed, so nothing on screen said plainly which
 * post the automation would actually watch. Here there is exactly one
 * selected state, it commits on click, and the grid reflows to a single
 * column on narrow screens instead of hiding posts off-axis.
 */
export default function PostPicker({
  posts, selectedId, onSelect,
}: {
  posts: Post[];
  selectedId: string | null;
  onSelect: (post: Post) => void;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = q
      ? posts.filter(p => (p.caption ?? '').toLowerCase().includes(q))
      : [...posts];
    return result.sort((a, b) =>
      sort === 'most-comments'
        ? Number(b.comments ?? 0) - Number(a.comments ?? 0)
        : new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime()
    );
  }, [posts, search, sort]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F] pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search your posts by caption"
            placeholder="Search your posts..."
            className="pop-search"
          />
        </div>
        <div className="flex gap-1.5 flex-shrink-0" role="group" aria-label="Sort posts">
          {([{ key: 'recent', label: 'Recent' }, { key: 'most-comments', label: 'Most comments' }] as const).map(o => (
            <button
              key={o.key}
              type="button"
              onClick={() => setSort(o.key)}
              aria-pressed={sort === o.key}
              className={`px-3 py-2 rounded-lg text-[12px] font-medium transition-all ${
                sort === o.key ? 'bg-[#111111] text-white' : 'bg-white border border-[#E8E4DF] text-[#6B6B6B] hover:bg-[#FAFAF8]'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-[12px] text-[#6B6B6B] py-6 text-center">
          No posts match &ldquo;{search.trim()}&rdquo;.
        </p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 list-none p-0 m-0">
          {visible.map(post => {
            const selected = post.id === selectedId;
            return (
              <li key={post.id}>
                <button
                  type="button"
                  onClick={() => onSelect(post)}
                  aria-pressed={selected}
                  className={`w-full h-full text-left bg-white border rounded-xl overflow-hidden transition-all ${
                    selected
                      ? 'border-[#111111] ring-2 ring-chartreuse'
                      : 'border-[#E8E4DF] hover:border-[#D4CFC8] hover:shadow-card'
                  }`}
                >
                  <div className="relative w-full aspect-square bg-[#FAFAF8]">
                    {post.media_url ? (
                      <img src={post.media_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Instagram size={20} className="text-[#9B9B8F]" />
                      </div>
                    )}
                    {selected && (
                      <span className="absolute top-1.5 right-1.5 bg-chartreuse text-[#111111] text-[10px] font-semibold pl-1.5 pr-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check size={10} strokeWidth={3} />Selected
                      </span>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-[11px] text-[#111111] line-clamp-2 leading-snug">
                      {post.caption || 'Untitled post'}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-[#9B9B8F] mt-1.5 flex-wrap">
                      <span className="flex items-center gap-0.5"><MessageCircle size={10} />{post.comments ?? 0}</span>
                      <span className="flex items-center gap-0.5"><Heart size={10} />{post.likes ?? 0}</span>
                      {post.published_at && <span>{timeAgo(post.published_at)}</span>}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
