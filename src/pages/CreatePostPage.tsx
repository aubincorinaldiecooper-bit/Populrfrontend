import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import useEmblaCarousel from 'embla-carousel-react';
import {
  Image as ImageIcon, Video as VideoIcon, GalleryHorizontal, Type as TypeIcon,
  Upload, X as XIcon, GripVertical, AlertCircle,
  ChevronLeft, ChevronRight, Loader2, Check, ArrowRight, RefreshCw,
} from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Spinner } from '@astryxdesign/core/Spinner';
import { TextArea } from '@astryxdesign/core/TextArea';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/PageHeader';
import PlatformPreviewCard from '../components/create-post/PlatformPreviewCard';
import {
  isBackendConfigured, uploadMedia, createDraftPost, updateDraftPost, validateDraftPost,
  publishDraftPost, fetchPost,
} from '../lib/api';
import type { PostMediaItem, PostMediaType, PostWithDetails, PlatformCapabilities } from '../lib/api';
import { platformMeta } from '../lib/platformMeta';

const MEDIA_TYPES: { id: PostMediaType; label: string; icon: typeof ImageIcon; description: string }[] = [
  { id: 'image', label: 'Image', icon: ImageIcon, description: 'Share one image across supported platforms.' },
  { id: 'video', label: 'Video', icon: VideoIcon, description: 'Publish a video or short-form clip.' },
  { id: 'carousel', label: 'Carousel', icon: GalleryHorizontal, description: 'Share multiple images in one post.' },
  { id: 'text', label: 'Text', icon: TypeIcon, description: 'Publish a text-only update where supported.' },
];

// Publishing targets are the workspace's connected accounts — the page has
// no standalone platform list. Names, icons, and colors all come from the
// shared platform meta, so accounts on platforms hidden for the beta still
// label correctly and `twitter` renders as "X".

type Step = 1 | 2 | 3;

function platformLabel(p: string): string {
  // platformMeta, not PLATFORMS: a draft targeting a platform hidden after
  // the beta cut must still label it properly, not fall back to a raw id.
  return platformMeta(p).name;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function CreatePostPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const editPostId = (location.state as { editPostId?: string } | null)?.editPostId ?? null;
  const { accounts, showToast } = useApp();
  const backendConfigured = isBackendConfigured();

  const connectedAccounts = useMemo(() => accounts.filter(a => a.status === 'connected'), [accounts]);

  const [capabilities, setCapabilities] = useState<Record<string, PlatformCapabilities>>({});
  useEffect(() => {
    if (!backendConfigured) return;
    import('../lib/api').then(({ fetchCapabilities }) =>
      fetchCapabilities().then(list => setCapabilities(Object.fromEntries(list.map(c => [c.platform, c]))))
    ).catch(err => console.error('[create-post] failed to load capabilities:', err));
  }, [backendConfigured]);

  const [step, setStep] = useState<Step>(1);
  const [phase, setPhase] = useState<'compose' | 'progress'>('compose');

  const [mediaType, setMediaType] = useState<PostMediaType | null>(null);
  const [mediaItems, setMediaItems] = useState<PostMediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [caption, setCaption] = useState('');

  const [draftId, setDraftId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [issues, setIssues] = useState<{ platform: string; message: string }[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [post, setPost] = useState<PostWithDetails | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(!!editPostId);

  // Resume an existing draft/failed post (from Content's Edit / Retry actions).
  useEffect(() => {
    if (!editPostId) return;
    fetchPost(editPostId)
      .then(existing => {
        setDraftId(existing.post.id);
        setPost(existing);
        setMediaType((existing.post.media_type as PostMediaType) ?? 'text');
        setCaption(existing.post.content ?? '');
        setMediaItems(existing.media.map(m => ({
          url: m.storage_url, mediaType: m.media_type, width: m.width ?? undefined,
          height: m.height ?? undefined, durationSeconds: m.duration_seconds ?? undefined,
          fileSizeBytes: m.file_size_bytes ?? undefined,
        })));
        setSelectedAccountIds(existing.targets.map(t => t.account_id));
        setStep(2);
      })
      .catch(err => {
        console.error('[create-post] failed to load existing post for editing:', err);
        showToast('Could not load that post to edit.', 'error');
      })
      .finally(() => setLoadingExisting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPostId]);

  const selectedAccounts = connectedAccounts.filter(a => selectedAccountIds.includes(a.id));
  const selectedPlatforms = [...new Set(selectedAccounts.map(a => a.platform))];

  // ---- Media types supported by at least one connected platform ----
  const availableMediaTypes = useMemo(() => {
    if (Object.keys(capabilities).length === 0) return MEDIA_TYPES; // capabilities still loading
    const connectedPlatformSet = new Set(connectedAccounts.map(a => a.platform));
    return MEDIA_TYPES.filter(mt =>
      [...connectedPlatformSet].some(p => capabilities[p]?.supportedMediaTypes?.includes(mt.id))
    );
  }, [capabilities, connectedAccounts]);

  // ---- Draft autosave: create once platforms+media+caption are meaningful, then keep in sync ----
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Returns the draft id this call actually saved to (or null if it saved
  // nothing) — callers that need to act on the result (e.g. validating
  // right after a forced save) must use this return value, not the
  // `draftId` state variable, which won't reflect a draft created by this
  // same call until the next render.
  const syncDraft = useCallback(async (): Promise<string | null> => {
    if (!mediaType || selectedAccountIds.length === 0) return draftId;
    if (!caption.trim() && mediaItems.length === 0) return draftId;
    setSavingDraft(true);
    try {
      const input = { mediaType, caption, mediaItems, accountIds: selectedAccountIds };
      if (draftId) {
        const updated = await updateDraftPost(draftId, input);
        setPost(updated);
        return updated.post.id;
      } else {
        const created = await createDraftPost(input);
        setDraftId(created.post.id);
        setPost(created);
        return created.post.id;
      }
    } catch (err) {
      console.error('[create-post] draft autosave failed:', err);
      return draftId;
    } finally {
      setSavingDraft(false);
    }
  }, [draftId, mediaType, caption, mediaItems, selectedAccountIds]);

  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => { syncDraft(); }, 1200);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caption, mediaItems, selectedAccountIds, mediaType]);

  // Warn before an accidental tab close/refresh while an unpublished draft exists.
  useEffect(() => {
    if (!draftId) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [draftId]);

  // ---- Upload ----
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of list) {
        let durationSeconds: number | undefined;
        if (file.type.startsWith('video/')) {
          durationSeconds = await new Promise<number | undefined>((resolve) => {
            const v = document.createElement('video');
            v.preload = 'metadata';
            v.onloadedmetadata = () => { resolve(Number.isFinite(v.duration) ? v.duration : undefined); URL.revokeObjectURL(v.src); };
            v.onerror = () => resolve(undefined);
            v.src = URL.createObjectURL(file);
          });
        }
        const result = await uploadMedia(file, durationSeconds);
        setMediaItems(prev => [...prev, {
          url: result.url, mediaType: result.mediaType, width: result.width, height: result.height,
          durationSeconds: result.durationSeconds ?? durationSeconds, fileSizeBytes: result.fileSizeBytes,
        }]);
      }
    } catch (err) {
      setUploadError(err instanceof Error && err.message ? err.message : 'Populr could not upload this file. Try again.');
    } finally {
      setUploading(false);
    }
  }, []);

  const removeMediaItem = (index: number) => setMediaItems(prev => prev.filter((_, i) => i !== index));
  const moveMediaItem = (from: number, to: number) => {
    setMediaItems(prev => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  // ---- Step navigation ----
  const canContinueFrom = (s: Step): boolean => {
    if (s === 1) return mediaType !== null && (mediaType === 'text' || mediaItems.length > 0);
    if (s === 2) return selectedAccountIds.length > 0 && (caption.trim().length > 0 || mediaItems.length > 0);
    return true;
  };

  const goNext = async () => {
    if (step === 2) {
      // Cancel the pending debounced autosave first — otherwise it fires
      // later with its own stale closure (still seeing draftId as null)
      // and creates a second, orphaned draft alongside the one this
      // forced save is about to create.
      if (autosaveTimer.current) { clearTimeout(autosaveTimer.current); autosaveTimer.current = null; }
      const id = await syncDraft();
      if (id) {
        try {
          const result = await validateDraftPost(id);
          setIssues(result.issues);
          setPost(result);
        } catch (err) {
          console.error('[create-post] validation failed:', err);
        }
      }
    }
    setStep(prev => (Math.min(prev + 1, 3) as Step));
  };
  const goBack = () => setStep(prev => (Math.max(prev - 1, 1) as Step));

  // ---- Preview carousel (per-platform, swipeable) ----
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [previewIndex, setPreviewIndex] = useState(0);
  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setPreviewIndex(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi]);

  function identityFor(platform: string) {
    const account = selectedAccounts.find(a => a.platform === platform);
    const name = account?.display_name || account?.username || platformLabel(platform);
    return {
      name,
      handle: account?.username ? `@${account.username}` : null,
      avatarUrl: account?.avatar_url ?? null,
      initials: name.slice(0, 2).toUpperCase(),
    };
  }

  // ---- Publish (schedule-for-later is not offered yet — publish now only) ----
  const publishButtonLabel = () =>
    `Publish to ${selectedAccountIds.length} platform${selectedAccountIds.length === 1 ? '' : 's'}`;

  const canSubmit = draftId && issues.length === 0 && !submitting;

  const handleSubmit = async () => {
    if (!draftId || submitting) return;
    setSubmitting(true);
    try {
      const result = await publishDraftPost(draftId, { publishNow: true });
      setPost(result);
      setPhase('progress');
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : 'Populr could not publish this post. Try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Progress polling ----
  useEffect(() => {
    if (phase !== 'progress' || !post) return;
    const isSettled = (p: PostWithDetails) =>
      !p.targets.some(t => t.status === 'pending' || t.status === 'uploading' || t.status === 'publishing');
    if (isSettled(post)) return;
    const timer = setInterval(async () => {
      try {
        const fresh = await fetchPost(post.post.id);
        setPost(fresh);
        if (isSettled(fresh)) clearInterval(timer);
      } catch (err) {
        console.error('[create-post] progress poll failed:', err);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [phase, post]);

  // Auto-return to Home a few seconds after full success, but keep the
  // action buttons available rather than a hard redirect.
  useEffect(() => {
    if (phase !== 'progress' || !post) return;
    if (post.post.status !== 'published') return;
    const t = setTimeout(() => navigate('/'), 4000);
    return () => clearTimeout(t);
  }, [phase, post, navigate]);

  if (!backendConfigured) {
    return (
      <div className="pop-page max-w-[640px]">
        <PageHeader title="Create Post" />
        <Banner
          status="warning"
          title="Populr isn't connected to a backend yet"
          description="Populr can't reach its server, so posts can't be created right now."
        />
      </div>
    );
  }

  if (loadingExisting) {
    return (
      <div className="pop-page max-w-[720px] flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  // ---- Progress screen ----
  if (phase === 'progress' && post) {
    const allDone = !post.targets.some(t => t.status === 'pending' || t.status === 'uploading' || t.status === 'publishing');
    const anyFailed = post.targets.some(t => t.status === 'failed');
    const anySucceeded = post.targets.some(t => t.status === 'published' || t.status === 'scheduled');
    const heading = !allDone
      ? 'Publishing your post'
      : post.post.status === 'failed'
        ? 'Your post could not be published.'
        : post.post.status === 'partially_published'
          ? `Your post was published to ${post.targets.filter(t => t.status === 'published' || t.status === 'scheduled').length} of ${post.targets.length} platforms.`
          : 'Your post is live.';

    const destinationLabel = (status: string) => {
      switch (status) {
        case 'pending': return 'Preparing…';
        case 'uploading': return 'Uploading…';
        case 'publishing': return 'Publishing…';
        case 'scheduled': return 'Scheduled';
        case 'published': return 'Published';
        case 'cancelled': return 'Cancelled';
        case 'failed': return 'Needs attention';
        default: return status;
      }
    };
    const destinationColor = (status: string) => {
      if (status === 'published' || status === 'scheduled') return 'text-[#059669] bg-[#E0F5E9]';
      if (status === 'failed') return 'text-[#DC2626] bg-[#FEE2E2]';
      return 'text-[#D97706] bg-[#FFF3E0]';
    };

    return (
      <div className="pop-page max-w-[560px]">
        <div className="text-center mb-8">
          <h1 className="pop-title">{!allDone ? 'Publishing your post' : heading}</h1>
          <p className="pop-body mt-2">
            {!allDone ? "We're sending your content to each selected platform." : ' '}
          </p>
        </div>

        <div className="space-y-2.5 mb-8">
          {post.targets.map(t => (
            <Card key={t.id} padding={4} className="flex items-center gap-3">
              {(() => {
                const P = platformMeta(t.platform);
                const Icon = P.icon;
                return <Icon size={20} style={{ color: P.color }} />;
              })()}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#111111]">{platformLabel(t.platform)}</p>
                {t.status === 'failed' && t.error && <p className="text-[11px] text-[#DC2626] mt-0.5">{t.error}</p>}
              </div>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${destinationColor(t.status)}`}>
                {(t.status === 'publishing' || t.status === 'pending' || t.status === 'uploading') && <Loader2 size={11} className="animate-spin" />}
                {(t.status === 'published' || t.status === 'scheduled') && <Check size={11} />}
                {t.status === 'failed' && <AlertCircle size={11} />}
                {destinationLabel(t.status)}
              </span>
            </Card>
          ))}
        </div>

        {allDone && (
          <div className="flex flex-col sm:flex-row gap-2.5">
            <Button variant="secondary" label="View post" className="flex-1" onClick={() => navigate(`/content/${post.post.id}`)} />
            <Button variant="secondary" label="Go to Content" className="flex-1" onClick={() => navigate('/content')} />
            {anyFailed && (
              <Button
                variant="secondary" label="Retry failed platforms" icon={<RefreshCw size={14} />} className="flex-1"
                onClick={async () => {
                  const { retryPostDestinations } = await import('../lib/api');
                  try {
                    const retried = await retryPostDestinations(post.post.id);
                    setPost(retried);
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : 'Retry failed.', 'error');
                  }
                }}
              />
            )}
            <Button variant="primary" label={anySucceeded ? 'Return Home' : 'Back to Home'} className="flex-1" onClick={() => navigate('/')} />
          </div>
        )}
      </div>
    );
  }

  // ---- Compose steps ----
  const stepTitle = {
    1: 'What are you posting?',
    2: 'Platforms & caption',
    3: 'Preview & publish',
  }[step];

  return (
    <div className="pop-page max-w-[720px]">
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" icon={<ChevronLeft size={16} />} label="Back" onClick={step === 1 ? () => navigate(-1) : goBack} />
        <div className="flex items-center gap-1.5">
          {[1, 2, 3].map(s => (
            <span key={s} className={`h-[3px] w-8 rounded-full ${s <= step ? 'bg-chartreuse' : 'bg-[#E8E4DF]'}`} />
          ))}
        </div>
        <span className="text-[11px] text-[#9B9B8F] w-12 text-right">{savingDraft ? 'Saving…' : draftId ? 'Saved' : ''}</span>
      </div>

      <PageHeader title={stepTitle ?? ''} />

      {/* Step 1: media type + content */}
      {step === 1 && (
        connectedAccounts.length === 0 ? (
          <Banner
            status="warning"
            title="Connect an account first"
            description="Populr needs at least one connected account to know what you can post and where."
            endContent={<Button label="Go to Connections" variant="primary" size="sm" onClick={() => navigate('/connections')} />}
          />
        ) : (
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {availableMediaTypes.map(mt => {
                const Icon = mt.icon;
                const supportedPlatforms = connectedAccounts
                  .filter(a => capabilities[a.platform]?.supportedMediaTypes?.includes(mt.id))
                  .map(a => a.platform);
                const uniquePlatforms = [...new Set(supportedPlatforms)];
                return (
                  <SelectableCard
                    key={mt.id}
                    label={mt.label}
                    padding={5}
                    isSelected={mediaType === mt.id}
                    onChange={() => { setMediaType(mt.id); if (mt.id === 'text') setMediaItems([]); }}
                  >
                    <Icon size={24} className="text-[#111111] mb-3" />
                    <p className="pop-card-title">{mt.label}</p>
                    <p className="pop-body mt-1">{mt.description}</p>
                    {uniquePlatforms.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-3">
                        {uniquePlatforms.map(p => {
                          const P = platformMeta(p);
                          const Icon2 = P.icon;
                          return <Icon2 key={p} size={14} style={{ color: P.color }} />;
                        })}
                      </div>
                    )}
                  </SelectableCard>
                );
              })}
            </div>

            {mediaType && (
              <div className="mt-6">
                {mediaType === 'text' ? (
                  <p className="pop-body">Text posts skip straight to your caption — continue when you&apos;re ready.</p>
                ) : (
                  <>
                    <div
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                      className="pop-card border-dashed p-8 text-center cursor-pointer hover:border-[#D4CFC8]"
                      onClick={() => document.getElementById('create-post-file-input')?.click()}
                    >
                      <input
                        id="create-post-file-input" type="file" className="hidden"
                        accept={mediaType === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'image/jpeg,image/png,image/webp,image/gif'}
                        multiple={mediaType === 'carousel'}
                        onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
                      />
                      <Upload size={28} className="mx-auto text-[#9B9B8F] mb-3" />
                      <p className="text-[13px] font-medium text-[#111111]">Drag and drop or click to upload</p>
                      <p className="pop-meta mt-1">
                        {mediaType === 'video' ? 'MP4, MOV, or WEBM' : 'JPEG, PNG, WEBP, or GIF'}
                        {mediaType === 'carousel' && ' — add multiple images'}
                      </p>
                      {uploading && <p className="text-[12px] text-[#6B6B6B] mt-3 flex items-center justify-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Uploading…</p>}
                    </div>
                    {uploadError && (
                      <p className="text-[12px] text-[#DC2626] mt-2 flex items-center gap-1.5"><AlertCircle size={13} /> {uploadError}</p>
                    )}

                    {mediaItems.length > 0 && (
                      <div className={mediaType === 'carousel' ? 'grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4' : 'mt-4'}>
                        {mediaItems.map((m, i) => (
                          <div key={m.url + i} className="relative pop-card overflow-hidden group">
                            {m.mediaType === 'video' ? (
                              <video src={m.url} className="w-full aspect-video object-cover" muted />
                            ) : (
                              <img src={m.url} alt="" className={`w-full object-cover ${mediaType === 'carousel' ? 'aspect-square' : 'aspect-video'}`} />
                            )}
                            <button
                              onClick={() => removeMediaItem(i)}
                              className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                              aria-label="Remove"
                            >
                              <XIcon size={13} />
                            </button>
                            {mediaType === 'carousel' && (
                              <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
                                {i > 0 && (
                                  <button onClick={() => moveMediaItem(i, i - 1)} className="bg-black/60 text-white rounded p-0.5 hover:bg-black/80" aria-label="Move earlier">
                                    <GripVertical size={12} />
                                  </button>
                                )}
                              </div>
                            )}
                            <div className="p-2 flex items-center justify-between">
                              <span className="pop-meta">{m.fileSizeBytes ? formatBytes(m.fileSizeBytes) : ''}</span>
                              {m.durationSeconds && <span className="pop-meta">{formatDuration(m.durationSeconds)}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {mediaType === 'carousel' && mediaItems.length > 0 && (
                      <p className="pop-meta mt-2">{mediaItems.length} item{mediaItems.length === 1 ? '' : 's'}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )
      )}

      {/* Step 2: platform selection + shared caption */}
      {step === 2 && (
        <div>
          <p className="text-[13px] font-semibold text-[#111111] mb-3">Where should this be posted?</p>
          <div className="space-y-3">
            {connectedAccounts
              .filter(a => capabilities[a.platform]?.supportedMediaTypes?.includes(mediaType ?? 'text'))
              .map(a => {
                const P = platformMeta(a.platform);
                const Icon = P.icon;
                const selected = selectedAccountIds.includes(a.id);
                const caps = capabilities[a.platform];
                return (
                  <SelectableCard
                    key={a.id}
                    label={platformLabel(a.platform)}
                    padding={4}
                    className="w-full flex items-center gap-3"
                    isSelected={selected}
                    onChange={() => setSelectedAccountIds(prev => selected ? prev.filter(id => id !== a.id) : [...prev, a.id])}
                  >
                    <Icon size={22} style={{ color: P?.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#111111]">{platformLabel(a.platform)}</p>
                      <p className="pop-meta">{a.username ? `@${a.username}` : a.display_name ?? 'Connected'}</p>
                      {caps && (!caps.supportsComments || !caps.supportsDMs) && (
                        <p className="text-[11px] text-[#3B82F6] mt-0.5">{caps.caveat}</p>
                      )}
                    </div>
                    {selected ? (
                      <span className="w-5 h-5 rounded-full bg-chartreuse flex items-center justify-center flex-shrink-0"><Check size={12} /></span>
                    ) : (
                      <span className="w-5 h-5 rounded-full border-2 border-[#E8E4DF] flex-shrink-0" />
                    )}
                  </SelectableCard>
                );
              })}
          </div>

          {(() => {
            const unavailable = connectedAccounts.filter(a => !capabilities[a.platform]?.supportedMediaTypes?.includes(mediaType ?? 'text'));
            if (unavailable.length === 0) return null;
            return (
              <div className="mt-5">
                <p className="pop-meta mb-2">Not available for this post type</p>
                <div className="space-y-2 opacity-60">
                  {unavailable.map(a => {
                    const P = platformMeta(a.platform);
                    const Icon = P.icon;
                    return (
                      <div key={a.id} className="pop-card-compact flex items-center gap-3">
                        <Icon size={18} style={{ color: P?.color }} />
                        <p className="text-[12px] text-[#6B6B6B]">{platformLabel(a.platform)} doesn&apos;t support this media type.</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div className="mt-8">
            <TextArea
              label="Caption"
              description="This caption will be used across your selected platforms. You can review how it appears on each platform before publishing."
              value={caption}
              onChange={setCaption}
              rows={6}
              placeholder="Write a caption…"
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="pop-meta">{caption.length} characters</span>
              {(() => {
                const strictest = selectedPlatforms
                  .map(p => capabilities[p]?.maxCaptionLength)
                  .filter((n): n is number => typeof n === 'number')
                  .sort((a, b) => a - b)[0];
                if (!strictest) return null;
                const over = caption.length > strictest;
                return <span className={`pop-meta ${over ? 'text-[#DC2626]' : ''}`}>Limit: {strictest}</span>;
              })()}
            </div>

            {selectedPlatforms.map(p => {
              const caps = capabilities[p];
              if (!caps) return null;
              const warnings: string[] = [];
              if (caption.length > caps.maxCaptionLength) warnings.push(`Caption is too long for ${platformLabel(p)} (max ${caps.maxCaptionLength}).`);
              if (caps.mediaRequired && mediaItems.length === 0) warnings.push(`${platformLabel(p)} requires at least one photo or video.`);
              if (warnings.length === 0) return null;
              return warnings.map((w, i) => (
                <p key={p + i} className="text-[12px] text-[#D97706] mt-2 flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {w}</p>
              ));
            })}
          </div>
        </div>
      )}

      {/* Step 3: preview + publish */}
      {step === 3 && (
        <div>
          {issues.length > 0 && (
            <div className="pop-card p-4 mb-5 border-[#FEE2E2] bg-[#FEE2E2]/30">
              <p className="text-[13px] font-semibold text-[#DC2626] mb-1.5">Fix these before publishing</p>
              {issues.map((iss, i) => <p key={i} className="text-[12px] text-[#DC2626]">{iss.message}</p>)}
            </div>
          )}

          <div className="relative">
            <div className="overflow-hidden" ref={emblaRef}>
              <div className="flex">
                {selectedPlatforms.map(p => (
                  <div key={p} className="flex-[0_0_100%] min-w-0 px-2">
                    <PlatformPreviewCard
                      platform={p}
                      identity={identityFor(p)}
                      mediaType={mediaType ?? 'text'}
                      mediaItems={mediaItems}
                      caption={caption}
                    />
                  </div>
                ))}
              </div>
            </div>
            {selectedPlatforms.length > 1 && (
              <>
                <button onClick={() => emblaApi?.scrollPrev()} className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-8 h-8 rounded-full bg-white border border-[#E8E4DF] items-center justify-center hover:bg-[#FAFAF8]">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => emblaApi?.scrollNext()} className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-8 h-8 rounded-full bg-white border border-[#E8E4DF] items-center justify-center hover:bg-[#FAFAF8]">
                  <ChevronRight size={16} />
                </button>
              </>
            )}
          </div>

          {selectedPlatforms.length > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <div className="flex items-center gap-1.5">
                {selectedPlatforms.map((p, i) => (
                  <button key={p} onClick={() => emblaApi?.scrollTo(i)} className={`h-1.5 rounded-full transition-all ${i === previewIndex ? 'w-5 bg-chartreuse' : 'w-1.5 bg-[#E8E4DF]'}`} />
                ))}
              </div>
              <span className="pop-meta ml-2">{previewIndex + 1} of {selectedPlatforms.length} — {platformLabel(selectedPlatforms[previewIndex])}</span>
            </div>
          )}

          <div className="mt-4 flex justify-center">
            <Button variant="ghost" label="Edit caption & platforms" onClick={() => setStep(2)} />
          </div>

          <Card padding={5} className="mt-6">
            <div className="text-[12px] text-[#6B6B6B] space-y-0.5 mb-4 pb-4 border-b border-[#E8E4DF]">
              <p>Media: <span className="text-[#111111] font-medium capitalize">{mediaType}</span></p>
              <p>Destinations: <span className="text-[#111111] font-medium">{selectedAccountIds.length} platform{selectedAccountIds.length === 1 ? '' : 's'} ({selectedPlatforms.map(platformLabel).join(', ')})</span></p>
              <p>Publishing: <span className="text-[#111111] font-medium">Immediately</span></p>
              <p>Caption: <span className="text-[#111111] font-medium">{caption.trim() ? `${caption.length} characters` : 'Empty'}</span></p>
            </div>

            <Button
              variant="primary" width="100%" icon={<ArrowRight size={15} />} label={publishButtonLabel()}
              isLoading={submitting} isDisabled={!canSubmit} onClick={handleSubmit}
            />
          </Card>
        </div>
      )}

      {/* Footer nav for steps 1-2 */}
      {step < 3 && (
        <div className="flex justify-end mt-8">
          <Button variant="primary" label="Continue" endContent={<ArrowRight size={15} />} isDisabled={!canContinueFrom(step)} onClick={goNext} />
        </div>
      )}
    </div>
  );
}
