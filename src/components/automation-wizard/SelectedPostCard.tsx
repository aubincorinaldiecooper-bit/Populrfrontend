import { Instagram, MessageCircle, Heart, RefreshCw } from 'lucide-react';
import type { Post } from '../../lib/api';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function SelectedPostCard({
  post, handle, triggerSummary, onChangePost,
}: { post: Post; handle: string | null; triggerSummary: string; onChangePost: () => void }) {
  return (
    <div className="pop-card p-4">
      <div className="flex gap-3">
        <div className="w-16 h-16 rounded-xl bg-[#FAFAF8] flex-shrink-0 overflow-hidden">
          {post.media_url ? (
            <img src={post.media_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><Instagram size={20} className="text-[#9B9B8F]" /></div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[#111111] line-clamp-2">{post.caption || 'Untitled post'}</p>
          <div className="flex items-center gap-2 text-[11px] text-[#9B9B8F] mt-1 flex-wrap">
            {handle && <span>@{handle}</span>}
            {handle && <span>·</span>}
            <span>{timeAgo(post.published_at)}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><MessageCircle size={11} />{post.comments ?? 0}</span>
            <span className="flex items-center gap-1"><Heart size={11} />{post.likes ?? 0}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-[#F0EEEA] flex items-center justify-between gap-3">
        <p className="text-[11px] text-[#6B6B6B]">{triggerSummary}</p>
        <button onClick={onChangePost} className="pop-btn-ghost text-[12px] py-1.5 px-2.5 flex-shrink-0">
          <RefreshCw size={12} />Change post
        </button>
      </div>
    </div>
  );
}
