import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft, Loader2, AlertCircle,
  Pencil, Trash2, XCircle, RefreshCw, ExternalLink, Clock, Image as ImageIcon,
  Video as VideoIcon, GalleryHorizontal, Type as TypeIcon, User,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { platformMeta } from '../lib/platformMeta';
import { STATUS_LABEL, STATUS_STYLE } from '../lib/postStatus';
import {
  fetchPost, deleteDraftPost, cancelScheduledPost, retryPostDestinations,
} from '../lib/api';
import type { PostWithDetails, PostMediaType } from '../lib/api';

const MEDIA_TYPE_ICON: Record<PostMediaType, typeof ImageIcon> = {
  image: ImageIcon, video: VideoIcon, carousel: GalleryHorizontal, text: TypeIcon,
};

function fullDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function PostDetailPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { showToast } = useApp();
  const { user } = useAuth();

  const [post, setPost] = useState<PostWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    try {
      setPost(await fetchPost(postId));
    } catch (err) {
      console.error('[content-detail] failed to load post:', err);
      setError(err instanceof Error && err.message ? err.message : 'Could not load this post.');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    // Data fetch from the backend, not derived state — the setState calls
    // inside `load` are the effect synchronizing with an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!post) return;
    if (!window.confirm('Delete this draft? This cannot be undone.')) return;
    setBusy(true);
    try {
      await deleteDraftPost(post.post.id);
      navigate('/content');
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : 'Could not delete this draft.', 'error');
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!post) return;
    setBusy(true);
    try {
      setPost(await cancelScheduledPost(post.post.id));
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : 'Could not cancel this post.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    if (!post) return;
    setBusy(true);
    try {
      setPost(await retryPostDestinations(post.post.id));
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : 'Could not retry this post.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="pop-page max-w-[720px] flex items-center justify-center py-24">
        <Loader2 size={20} className="animate-spin text-[#6B6B6B]" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="pop-page max-w-[720px]">
        <button onClick={() => navigate('/content')} className="pop-btn-ghost mb-6"><ArrowLeft size={16} /> Back to Content</button>
        <div className="pop-card p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-[#111111]">{error ?? 'This post could not be found.'}</p>
        </div>
      </div>
    );
  }

  const { post: p, media, targets } = post;
  const status = p.status;
  const anyFailed = targets.some(t => t.status === 'failed');

  return (
    <div className="pop-page max-w-[820px]">
      <button onClick={() => navigate('/content')} className="pop-btn-ghost mb-6"><ArrowLeft size={16} /> Back to Content</button>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT: media + caption */}
        <div className="lg:col-span-2 space-y-4">
          {media.length > 0 ? (
            <div className={media.length > 1 ? 'grid grid-cols-2 gap-2' : ''}>
              {media.map(m => (
                <div key={m.id} className="rounded-2xl overflow-hidden border border-[#E8E4DF] bg-white">
                  {m.media_type === 'video' ? (
                    <video src={m.storage_url} controls className="w-full aspect-square object-cover" />
                  ) : (
                    <img src={m.storage_url} alt="" className="w-full aspect-square object-cover" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="pop-card p-8 flex flex-col items-center justify-center text-center">
              {(() => { const Icon = MEDIA_TYPE_ICON[p.media_type ?? 'text']; return <Icon size={22} className="text-[#9B9B8F] mb-2" />; })()}
              <p className="pop-meta">Text-only post — no media attached.</p>
            </div>
          )}
          <div className="pop-card p-4">
            <p className="pop-body whitespace-pre-wrap">{p.content?.trim() || <span className="text-[#9B9B8F]">No caption</span>}</p>
          </div>
        </div>

        {/* RIGHT: status + destinations */}
        <div className="lg:col-span-3 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium ${STATUS_STYLE[status] ?? 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                {STATUS_LABEL[status] ?? status}
              </span>
              <span className="text-[12px] text-[#9B9B8F] capitalize">{p.media_type ?? 'text'} post</span>
            </div>
            <h1 className="pop-section-heading">Post details</h1>
          </div>

          <div className="pop-card p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-[12px] text-[#6B6B6B]">
              <User size={13} /> Created by {user?.name || user?.email || 'you'}
            </div>
            <div className="flex items-center gap-2 text-[12px] text-[#6B6B6B]">
              <Clock size={13} /> Created {fullDate(p.created_at)}
            </div>
            {p.scheduled_at && (
              <div className="flex items-center gap-2 text-[12px] text-[#6B6B6B]">
                <Clock size={13} /> Scheduled for {fullDate(p.scheduled_at)}
              </div>
            )}
            {p.published_at && (
              <div className="flex items-center gap-2 text-[12px] text-[#6B6B6B]">
                <Clock size={13} /> Published {fullDate(p.published_at)}
              </div>
            )}
          </div>

          <div className="pop-card p-5">
            <h2 className="pop-card-title mb-4">Destinations</h2>
            <div className="space-y-2.5">
              {targets.map(t => {
                const meta = platformMeta(t.platform);
                const Icon = meta.icon;
                return (
                  <div key={t.id} className="bg-[#FAFAF8] rounded-xl p-3.5">
                    <div className="flex items-center gap-3">
                      <Icon size={18} style={{ color: meta.color }} />
                      <p className="text-[13px] font-semibold text-[#111111] flex-1">{meta.name}</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_STYLE[t.status] ?? 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </div>
                    {t.status === 'failed' && t.error && (
                      <p className="text-[11px] text-[#DC2626] mt-2 flex items-start gap-1.5"><AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> {t.error}</p>
                    )}
                    {t.url && (
                      <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#3B82F6] mt-2 inline-flex items-center gap-1 hover:underline">
                        <ExternalLink size={11} /> Open on {meta.name}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {status === 'draft' && (
              <>
                <button onClick={() => navigate('/create', { state: { editPostId: p.id } })} className="pop-btn-primary"><Pencil size={14} /> Edit</button>
                <button onClick={handleDelete} disabled={busy} className="pop-btn-ghost text-[#DC2626] disabled:opacity-40"><Trash2 size={14} /> Delete</button>
              </>
            )}
            {status === 'scheduled' && (
              <>
                <button onClick={() => navigate('/create', { state: { editPostId: p.id } })} className="pop-btn-primary"><Pencil size={14} /> Edit schedule</button>
                <button onClick={handleCancel} disabled={busy} className="pop-btn-ghost text-[#DC2626] disabled:opacity-40">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Cancel
                </button>
              </>
            )}
            {status === 'failed' && (
              <>
                <button onClick={() => navigate('/create', { state: { editPostId: p.id } })} className="pop-btn-tertiary"><Pencil size={14} /> Edit</button>
                <button onClick={handleRetry} disabled={busy} className="pop-btn-primary disabled:opacity-40">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Retry
                </button>
              </>
            )}
            {status === 'partially_published' && anyFailed && (
              <button onClick={handleRetry} disabled={busy} className="pop-btn-primary disabled:opacity-40">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Retry failed destinations
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
