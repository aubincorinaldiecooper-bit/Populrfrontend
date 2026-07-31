import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Plus, ArrowRight, Loader2, AlertCircle, Image as ImageIcon, Video as VideoIcon, GalleryHorizontal, Type as TypeIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import { platformMeta } from '../lib/platformMeta';
import { STATUS_LABEL, STATUS_STYLE, timeLabel } from '../lib/postStatus';
import { isBackendConfigured, fetchPosts } from '../lib/api';
import type { PostWithDetails, PostMediaType } from '../lib/api';

const MEDIA_TYPE_ICON: Record<PostMediaType, typeof ImageIcon> = {
  image: ImageIcon, video: VideoIcon, carousel: GalleryHorizontal, text: TypeIcon,
};

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const backendConfigured = isBackendConfigured();
  const firstName = user?.name?.split(' ')[0];

  const [posts, setPosts] = useState<PostWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Data fetch from the backend, not derived state — the setState calls
    // below are the effect synchronizing with an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!backendConfigured) { setLoading(false); return; }
    fetchPosts('all', 5)
      .then(setPosts)
      .catch(err => {
        console.error('[home] failed to load recent posts:', err);
        setError(err instanceof Error && err.message ? err.message : 'Could not load your recent posts.');
      })
      .finally(() => setLoading(false));
  }, [backendConfigured]);

  return (
    <div className="pop-page">
      <PageHeader title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'} subtitle="Create something new, or check in on what's already out." />

      <button
        onClick={() => navigate('/create')}
        className="pop-card p-6 w-full flex items-center gap-4 mb-10 border-chartreuse hover:bg-[#FAFAF8] transition-all text-left group"
      >
        <span className="w-12 h-12 rounded-2xl bg-chartreuse flex items-center justify-center flex-shrink-0">
          <Plus size={22} className="text-[#111111]" />
        </span>
        <div className="min-w-0">
          <p className="pop-card-title">Create a post</p>
          <p className="pop-body mt-0.5">Share an image, video, carousel, or text update across your connected platforms.</p>
        </div>
        <ArrowRight size={18} className="ml-auto flex-shrink-0 text-[#9B9B8F] group-hover:text-[#111111] transition-colors" />
      </button>

      <div className="flex items-center justify-between mb-4">
        <h2 className="pop-section-heading">Recent posts</h2>
        {posts.length > 0 && <Link to="/content" className="text-[12px] text-[#6B6B6B] hover:text-[#111111] transition-colors">View all →</Link>}
      </div>

      {!backendConfigured ? (
        <div className="pop-card p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-[#111111]">
            Populr isn&apos;t connected to a backend yet — set <code className="bg-[#FAFAF8] px-1 py-0.5 rounded">VITE_API_URL</code> to see recent posts here.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-14">
          <Loader2 size={20} className="animate-spin text-[#6B6B6B]" />
        </div>
      ) : error ? (
        <div className="pop-card p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-[#111111]">{error}</p>
        </div>
      ) : posts.length === 0 ? (
        <p className="pop-body">Nothing published yet — your recent posts will show up here.</p>
      ) : (
        <div className="space-y-2.5">
          {posts.map(({ post: p, media, targets }) => {
            const thumb = media[0];
            const MediaTypeIcon = MEDIA_TYPE_ICON[p.media_type ?? 'text'];
            return (
              <button
                key={p.id}
                onClick={() => navigate(`/content/${p.id}`)}
                className="pop-card p-3.5 w-full flex items-center gap-3.5 text-left hover:border-[#D4CFC8] transition-all"
              >
                <span className="w-12 h-12 rounded-xl overflow-hidden bg-[#FAFAF8] border border-[#E8E4DF] flex-shrink-0 flex items-center justify-center">
                  {thumb ? (
                    thumb.media_type === 'video' ? (
                      <video src={thumb.storage_url} className="w-full h-full object-cover" muted />
                    ) : (
                      <img src={thumb.storage_url} alt="" className="w-full h-full object-cover" />
                    )
                  ) : (
                    <MediaTypeIcon size={16} className="text-[#9B9B8F]" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[#111111] truncate">{p.content?.trim() || 'No caption'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_STYLE[p.status] ?? 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                    <span className="pop-meta">{timeLabel(p)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {targets.map(t => {
                    const meta = platformMeta(t.platform);
                    const Icon = meta.icon;
                    return <Icon key={t.id} size={14} style={{ color: meta.color }} />;
                  })}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
