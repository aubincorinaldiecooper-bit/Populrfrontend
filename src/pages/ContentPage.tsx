import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Loader2, AlertCircle, Pencil, Trash2,
  XCircle, RefreshCw, ExternalLink, Eye, Clock, Image as ImageIcon,
  Video as VideoIcon, GalleryHorizontal, Type as TypeIcon,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { platformMeta } from '../lib/platformMeta';
import { STATUS_LABEL, STATUS_STYLE, timeLabel } from '../lib/postStatus';
import {
  isBackendConfigured, fetchPosts, deleteDraftPost, cancelScheduledPost, retryPostDestinations,
} from '../lib/api';
import type { ContentTab, PostWithDetails, PostMediaType } from '../lib/api';

const MEDIA_TYPE_ICON: Record<PostMediaType, typeof ImageIcon> = {
  image: ImageIcon, video: VideoIcon, carousel: GalleryHorizontal, text: TypeIcon,
};

const TABS: { id: ContentTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'published', label: 'Published' },
  { id: 'failed', label: 'Failed' },
];

export default function ContentPage() {
  const navigate = useNavigate();
  const { showToast } = useApp();
  const backendConfigured = isBackendConfigured();

  const [tab, setTab] = useState<ContentTab>('all');
  const [posts, setPosts] = useState<PostWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!backendConfigured) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      setPosts(await fetchPosts(tab, 50));
    } catch (err) {
      console.error('[content] failed to load posts:', err);
      setError(err instanceof Error && err.message ? err.message : 'Could not load your posts.');
    } finally {
      setLoading(false);
    }
  }, [tab, backendConfigured]);

  useEffect(() => {
    // Data fetch from the backend, not derived state — the setState calls
    // inside `load` are the effect synchronizing with an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return;
    setBusyId(id);
    try {
      await deleteDraftPost(id);
      setPosts(prev => prev.filter(p => p.post.id !== id));
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : 'Could not delete this draft.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (id: string) => {
    // cancelScheduledPost only updates Populr's own record — there's no
    // Zernio API to actually stop a scheduled publish, so if the
    // scheduled time is close, the post may still go out. Say so before
    // the user relies on "Cancelled" meaning it won't happen.
    if (!window.confirm(
      "Cancel this scheduled post? Populr will stop tracking it as scheduled, but if the publish time is very close, the platform may still publish it — cancellation isn't guaranteed to stop that."
    )) return;
    setBusyId(id);
    try {
      const updated = await cancelScheduledPost(id);
      setPosts(prev => prev.map(p => (p.post.id === id ? updated : p)));
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : 'Could not cancel this post.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleRetry = async (id: string) => {
    setBusyId(id);
    try {
      const updated = await retryPostDestinations(id);
      setPosts(prev => prev.map(p => (p.post.id === id ? updated : p)));
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : 'Could not retry this post.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (!backendConfigured) {
    return (
      <div className="pop-page max-w-[640px]">
        <PageHeader title="Content" />
        <div className="pop-card p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to a backend yet</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Set <code className="bg-[#FAFAF8] px-1 py-0.5 rounded">VITE_API_URL</code> to your Populr backend to see your posts here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pop-page">
      <PageHeader
        title="Content"
        subtitle="Everything you've created and published across your connected platforms."
        action={
          <button onClick={() => navigate('/create')} className="pop-btn-primary">
            Create a post
          </button>
        }
      />

      <div className="flex items-center gap-1.5 mb-6 border-b border-[#E8E4DF]">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-all ${tab === t.id ? 'border-chartreuse text-[#111111]' : 'border-transparent text-[#6B6B6B] hover:text-[#111111]'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin text-[#6B6B6B]" />
        </div>
      ) : error ? (
        <div className="pop-card p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-[#111111]">{error}</p>
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon="content"
          title="No posts yet"
          description="Create your first post and publish it across your connected platforms."
          action={<button onClick={() => navigate('/create')} className="pop-btn-primary">Create a post</button>}
        />
      ) : (
        <div className="space-y-3">
          {posts.map(p => (
            <PostCard
              key={p.post.id}
              post={p}
              busy={busyId === p.post.id}
              onOpen={() => navigate(`/content/${p.post.id}`)}
              onEdit={() => navigate('/create', { state: { editPostId: p.post.id } })}
              onDelete={() => handleDelete(p.post.id)}
              onCancel={() => handleCancel(p.post.id)}
              onRetry={() => handleRetry(p.post.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({ post, busy, onOpen, onEdit, onDelete, onCancel, onRetry }: {
  post: PostWithDetails;
  busy: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const { post: p, media, targets } = post;
  const thumb = media[0];
  const MediaTypeIcon = MEDIA_TYPE_ICON[p.media_type ?? 'text'];
  const status = p.status;
  const externalTarget = targets.find(t => t.url);

  return (
    <div className="pop-card p-4 flex flex-col sm:flex-row gap-4">
      <button onClick={onOpen} className="flex-shrink-0 w-full sm:w-28 aspect-square rounded-xl overflow-hidden bg-[#FAFAF8] border border-[#E8E4DF]">
        {thumb ? (
          thumb.media_type === 'video' ? (
            <video src={thumb.storage_url} className="w-full h-full object-cover" muted />
          ) : (
            <img src={thumb.storage_url} alt="" className="w-full h-full object-cover" />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <MediaTypeIcon size={20} className="text-[#9B9B8F]" />
          </div>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <button onClick={onOpen} className="text-left min-w-0">
            <p className="text-[13px] text-[#111111] line-clamp-2">
              {p.content?.trim() || <span className="text-[#9B9B8F]">No caption</span>}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_STYLE[status] ?? 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                {STATUS_LABEL[status] ?? status}
              </span>
              <span className="pop-meta flex items-center gap-1"><Clock size={10} /> {timeLabel(p)}</span>
            </div>
          </button>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {targets.map(t => {
              const meta = platformMeta(t.platform);
              const Icon = meta.icon;
              return (
                <span key={t.id} className="relative" title={`${meta.name}: ${STATUS_LABEL[t.status] ?? t.status}`}>
                  <Icon size={16} style={{ color: meta.color }} />
                  {t.status === 'failed' && <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#DC2626] border border-white" />}
                  {(t.status === 'published' || t.status === 'scheduled') && <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#059669] border border-white" />}
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {status === 'draft' && (
            <>
              <button onClick={onEdit} className="pop-btn-tertiary text-[12px] py-1.5 px-3"><Pencil size={12} /> Edit</button>
              <button onClick={onDelete} disabled={busy} className="pop-btn-ghost text-[12px] py-1.5 px-3 text-[#DC2626] disabled:opacity-40"><Trash2 size={12} /> Delete</button>
            </>
          )}
          {status === 'scheduled' && (
            <>
              <button onClick={onOpen} className="pop-btn-tertiary text-[12px] py-1.5 px-3"><Eye size={12} /> View</button>
              {/* No "Edit schedule" here: CreatePostPage has no schedule
                  control right now and always submits publishNow: true,
                  so reusing it would silently attempt an immediate
                  publish instead of editing the scheduled time. */}
              <button onClick={onCancel} disabled={busy} className="pop-btn-ghost text-[12px] py-1.5 px-3 text-[#DC2626] disabled:opacity-40"><XCircle size={12} /> Cancel</button>
            </>
          )}
          {status === 'published' && (
            <>
              <button onClick={onOpen} className="pop-btn-tertiary text-[12px] py-1.5 px-3"><Eye size={12} /> View details</button>
              {externalTarget?.url && (
                <a href={externalTarget.url} target="_blank" rel="noopener noreferrer" className="pop-btn-ghost text-[12px] py-1.5 px-3">
                  <ExternalLink size={12} /> Open on platform
                </a>
              )}
            </>
          )}
          {status === 'partially_published' && (
            <>
              <button onClick={onOpen} className="pop-btn-tertiary text-[12px] py-1.5 px-3"><Eye size={12} /> View details</button>
              <button onClick={onRetry} disabled={busy} className="pop-btn-secondary text-[12px] py-1.5 px-3 disabled:opacity-40">
                {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Retry failed destinations
              </button>
            </>
          )}
          {status === 'failed' && (
            <>
              <button onClick={onOpen} className="pop-btn-tertiary text-[12px] py-1.5 px-3"><AlertCircle size={12} /> View error</button>
              <button onClick={onEdit} className="pop-btn-tertiary text-[12px] py-1.5 px-3"><Pencil size={12} /> Edit</button>
              <button onClick={onRetry} disabled={busy} className="pop-btn-secondary text-[12px] py-1.5 px-3 disabled:opacity-40">
                {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Retry
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
