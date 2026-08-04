import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Check, Instagram, MessageCircle, Heart } from 'lucide-react';
import type { Post } from '../../lib/api';

export default function PostCarousel({
  posts, selectedId, focusedId, onFocus,
}: { posts: Post[]; selectedId: string | null; focusedId: string | null; onFocus: (id: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    scrollRef.current?.scrollBy({ left: dir * 180, behavior: 'smooth' });
  };

  const index = Math.max(0, posts.findIndex(p => p.id === focusedId));

  return (
    <div>
      <div className="flex items-center gap-2">
        <button onClick={() => scrollBy(-1)} aria-label="Previous posts"
          className="w-8 h-8 rounded-full border border-[#E8E4DF] flex items-center justify-center flex-shrink-0 hover:bg-[#FAFAF8] transition-all">
          <ChevronLeft size={16} />
        </button>
        <div ref={scrollRef} className="flex-1 flex gap-2.5 overflow-x-auto scroll-smooth pb-1" role="listbox" aria-label="Instagram posts">
          {posts.map(post => {
            const selected = post.id === selectedId;
            const focused = post.id === focusedId;
            return (
              <button
                key={post.id}
                role="option"
                aria-selected={focused}
                onClick={() => onFocus(post.id)}
                className={`w-[140px] flex-shrink-0 text-left border rounded-xl overflow-hidden transition-all ${focused ? 'border-[#111111] ring-2 ring-chartreuse' : 'border-[#E8E4DF] hover:border-[#D4CFC8]'}`}
              >
                <div className="relative w-full h-[100px] bg-[#FAFAF8]">
                  {post.media_url ? (
                    <img src={post.media_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Instagram size={18} className="text-[#9B9B8F]" /></div>
                  )}
                  {selected && (
                    <span className="absolute top-1.5 right-1.5 bg-chartreuse text-[#111111] text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <Check size={9} />Selected
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-[10px] text-[#111111] line-clamp-2 leading-snug">{post.caption || 'Untitled post'}</p>
                  <div className="flex items-center gap-1.5 text-[9px] text-[#9B9B8F] mt-1">
                    <span className="flex items-center gap-0.5"><MessageCircle size={9} />{post.comments ?? 0}</span>
                    <span className="flex items-center gap-0.5"><Heart size={9} />{post.likes ?? 0}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <button onClick={() => scrollBy(1)} aria-label="Next posts"
          className="w-8 h-8 rounded-full border border-[#E8E4DF] flex items-center justify-center flex-shrink-0 hover:bg-[#FAFAF8] transition-all">
          <ChevronRight size={16} />
        </button>
      </div>
      {posts.length > 0 && (
        <div className="flex items-center justify-center gap-1 mt-3">
          {posts.map((p, i) => (
            <div key={p.id} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-[#111111]' : 'w-1.5 bg-[#E8E4DF]'}`} />
          ))}
        </div>
      )}
    </div>
  );
}
