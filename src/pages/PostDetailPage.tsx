import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft, AlertCircle,
  Pencil, Trash2, XCircle, RefreshCw, ExternalLink, Clock, Image as ImageIcon,
  Video as VideoIcon, GalleryHorizontal, Type as TypeIcon,
} from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Spinner } from '@astryxdesign/core/Spinner';
import { useApp } from '../context/AppContext';
import ConfirmDialog from '../components/app/ConfirmDialog';
import { isCreatorSafe } from '../lib/voice';
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

  const [post, setPost] = useState<PostWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Which deliberate question is open, if any. Both actions here are
  // consequential enough that window.confirm used to guard them.
  const [confirming, setConfirming] = useState<'delete' | 'cancel' | null>(null);

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
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="pop-page max-w-[720px]">
        <Button variant="ghost" icon={<ArrowLeft size={16} />} label="Back to Content" className="mb-6" onClick={() => navigate('/content')} />
        <Banner status="error" title="Couldn't load this post" description={error ?? 'This post could not be found.'} />
      </div>
    );
  }

  const { post: p, media, targets } = post;
  const status = p.status;
  const anyFailed = targets.some(t => t.status === 'failed');

  return (
    <div className="pop-page max-w-[820px]">
      <Button variant="ghost" icon={<ArrowLeft size={16} />} label="Back to Content" className="mb-6" onClick={() => navigate('/content')} />

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
            <Card padding={8} className="flex flex-col items-center justify-center text-center">
              {(() => { const Icon = MEDIA_TYPE_ICON[p.media_type ?? 'text']; return <Icon size={22} className="text-[#9B9B8F] mb-2" />; })()}
              <p className="pop-meta">Text-only post — no media attached.</p>
            </Card>
          )}
          <Card padding={4}>
            <p className="pop-body whitespace-pre-wrap">{p.content?.trim() || <span className="text-[#9B9B8F]">No caption</span>}</p>
          </Card>
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

          <Card padding={5} className="space-y-2.5">
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
          </Card>

          <Card padding={5}>
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
                      <p className="text-[11px] text-[#DC2626] mt-2 flex items-start gap-1.5"><AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> {isCreatorSafe(t.error) ? t.error : "Couldn't publish to this account."}</p>
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
          </Card>

          <div className="flex flex-wrap gap-2.5">
            {status === 'draft' && (
              <>
                <Button variant="primary" label="Edit" icon={<Pencil size={14} />} onClick={() => navigate('/create', { state: { editPostId: p.id } })} />
                <Button variant="ghost" label="Delete" icon={<Trash2 size={14} className="text-[#DC2626]" />} isDisabled={busy} onClick={() => setConfirming('delete')} />
              </>
            )}
            {status === 'scheduled' && (
              // No "Edit schedule" here: CreatePostPage has no schedule
              // control right now and always submits publishNow: true, so
              // reusing it would silently attempt an immediate publish
              // instead of editing the scheduled time.
              <Button variant="ghost" label="Cancel" icon={<XCircle size={14} className="text-[#DC2626]" />} isLoading={busy} isDisabled={busy} onClick={() => setConfirming('cancel')} />
            )}
            {status === 'failed' && (
              <>
                <Button variant="secondary" label="Edit" icon={<Pencil size={14} />} onClick={() => navigate('/create', { state: { editPostId: p.id } })} />
                <Button variant="primary" label="Retry" icon={<RefreshCw size={14} />} isLoading={busy} isDisabled={busy} onClick={handleRetry} />
              </>
            )}
            {status === 'partially_published' && anyFailed && (
              <Button variant="primary" label="Retry failed destinations" icon={<RefreshCw size={14} />} isLoading={busy} isDisabled={busy} onClick={handleRetry} />
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirming === 'delete'}
        onOpenChange={open => { if (!open) setConfirming(null); }}
        title="Delete this draft?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => void handleDelete()}
      />
      {/* cancelScheduledPost only updates Populr's own record — there's no
          Zernio API to actually stop a scheduled publish, so if the scheduled
          time is close, the post may still go out. Say so before the user
          relies on "Cancelled" meaning it won't happen. */}
      <ConfirmDialog
        open={confirming === 'cancel'}
        onOpenChange={open => { if (!open) setConfirming(null); }}
        title="Cancel this scheduled post?"
        description="Populr will stop tracking it as scheduled, but if the publish time is very close, the platform may still publish it — cancellation isn't guaranteed to stop that."
        confirmLabel="Cancel the post"
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
}
