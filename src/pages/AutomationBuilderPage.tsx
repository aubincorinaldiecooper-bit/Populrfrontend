import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Switch } from '@astryxdesign/core/Switch';
import { Banner } from '@astryxdesign/core/Banner';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Stack } from '@astryxdesign/core/Stack';
import { useApp } from '../context/AppContext';
import {
  createAutomation, updateAutomation, fetchCapabilities,
  fetchPostsLibrary, syncPostsLibrary, findMissingPost,
  ApiError,
} from '../lib/api';
import type {
  AutomationRecord, AutomationInput, AutomationMatchMode, AutomationReplyChannel,
  PlatformCapabilities, PostLibraryItem,
} from '../lib/api';
import { ChevronLeft, RefreshCw } from 'lucide-react';

const MATCH_MODES: { value: AutomationMatchMode; label: string }[] = [
  { value: 'contains', label: 'Contains the keyword' },
  { value: 'exact', label: 'Matches exactly' },
  { value: 'starts_with', label: 'Starts with the keyword' },
];

function fieldStatus(message?: string): { type: 'error'; message: string } | undefined {
  return message ? { type: 'error', message } : undefined;
}

export default function AutomationBuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast, accounts } = useApp();
  // Editing: AutomationsPage navigates here with the real, backend-shaped
  // record (never the old mock Automation type) via router state.
  const editAuto = (location.state as { automation?: AutomationRecord } | null)?.automation ?? null;

  const connectedAccounts = useMemo(() => accounts.filter(a => a.status === 'connected'), [accounts]);

  const [name, setName] = useState(editAuto?.name ?? '');
  const [accountId, setAccountId] = useState(editAuto?.account_id ?? '');
  const [postScope, setPostScope] = useState<'all' | 'specific'>(editAuto?.source_post_id ? 'specific' : 'all');
  const [sourcePostId, setSourcePostId] = useState<string | null>(editAuto?.source_post_id ?? null);
  const [keywordsText, setKeywordsText] = useState((editAuto?.keywords ?? []).join(', '));
  const [matchMode, setMatchMode] = useState<AutomationMatchMode>(editAuto?.match_mode ?? 'contains');
  const [replyChannel, setReplyChannel] = useState<AutomationReplyChannel>(editAuto?.reply_channel ?? 'comment');
  const [commentReplyBody, setCommentReplyBody] = useState(editAuto?.comment_reply_body ?? '');
  const [messageBody, setMessageBody] = useState(editAuto?.message_body ?? '');
  const [linkUrl, setLinkUrl] = useState(editAuto?.link_url ?? '');
  const [tagsText, setTagsText] = useState((editAuto?.tags ?? []).join(', '));
  const [scoreDelta, setScoreDelta] = useState(editAuto?.score_delta ?? 0);
  const [reviewFirst, setReviewFirst] = useState(!!(editAuto?.ai_enabled && editAuto?.ai_mode === 'suggest'));
  const [active, setActive] = useState(editAuto?.active ?? true);

  const [capabilities, setCapabilities] = useState<Record<string, PlatformCapabilities>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverProblems, setServerProblems] = useState<string[]>([]);

  // Real post picker — the account's own synced posts, never a hand-typed id.
  const [libraryPosts, setLibraryPosts] = useState<PostLibraryItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsSyncing, setPostsSyncing] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [showFindMissing, setShowFindMissing] = useState(false);
  const [missingUrl, setMissingUrl] = useState('');
  const [findingMissing, setFindingMissing] = useState(false);

  useEffect(() => {
    fetchCapabilities()
      .then(list => setCapabilities(Object.fromEntries(list.map(c => [c.platform, c]))))
      .catch(err => console.error('[automations] failed to load platform capabilities:', err));
  }, []);

  useEffect(() => {
    if (postScope !== 'specific' || !accountId) {
      // Clears stale options from a previous account/scope, not derived state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLibraryPosts([]);
      return;
    }
    let cancelled = false;
    setPostsLoading(true);
    setPostsError(null);
    fetchPostsLibrary({ accountId })
      .then(posts => { if (!cancelled) setLibraryPosts(posts); })
      .catch(err => { if (!cancelled) setPostsError(err instanceof Error ? err.message : 'Could not load your posts.'); })
      .finally(() => { if (!cancelled) setPostsLoading(false); });
    return () => { cancelled = true; };
  }, [postScope, accountId]);

  const handleSyncPosts = async () => {
    if (!accountId) return;
    setPostsSyncing(true);
    setPostsError(null);
    try {
      const result = await syncPostsLibrary(accountId);
      setLibraryPosts(await fetchPostsLibrary({ accountId }));
      // syncPostsLibrary resolves even when Zernio rejected the sync for this
      // account (expired token, missing scope, wrong account type) — errors
      // come back as data, not a thrown rejection, so they must be checked
      // explicitly or a real failure looks identical to "nothing to sync".
      if (result.errors.length > 0) {
        setPostsError(result.errors.join(' '));
      }
    } catch (err) {
      setPostsError(err instanceof Error ? err.message : 'Could not sync your posts.');
    } finally {
      setPostsSyncing(false);
    }
  };

  const handleFindMissing = async () => {
    if (!accountId || !missingUrl.trim()) return;
    setFindingMissing(true);
    try {
      const { post } = await findMissingPost(accountId, missingUrl.trim());
      setLibraryPosts(prev => [post, ...prev.filter(p => p.id !== post.id)]);
      setSourcePostId(post.id);
      setShowFindMissing(false);
      setMissingUrl('');
      showToast('Post found and added', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not find that post.', 'error');
    } finally {
      setFindingMissing(false);
    }
  };

  const selectedAccount = connectedAccounts.find(a => a.id === accountId) ?? null;
  const caps = selectedAccount ? capabilities[selectedAccount.platform] : undefined;

  // Never invented client-side: whether comment replies / DMs are even
  // offered as options is driven entirely by the same capability matrix
  // the backend enforces on save (GET /api/capabilities). If capabilities
  // haven't loaded yet, options are shown but the backend still has the
  // final say when the form is submitted.
  const commentAllowed = !caps || caps.supportsCommentReplies;
  const dmAllowed = !caps || caps.supportsDMs;

  // If the stored preference becomes unavailable (account changed, or
  // capabilities just loaded), derive whichever channel is actually
  // supported for display and save rather than silently submitting one
  // that isn't — computed at render time so it never fights a user's direct
  // click with a stale correction from the previous render.
  const effectiveReplyChannel: AutomationReplyChannel =
    replyChannel === 'comment' && !commentAllowed && dmAllowed ? 'dm'
    : replyChannel === 'dm' && !dmAllowed && commentAllowed ? 'comment'
    : replyChannel === 'both' && (!commentAllowed || !dmAllowed) ? (commentAllowed ? 'comment' : dmAllowed ? 'dm' : 'comment')
    : replyChannel;

  const accountOptions = connectedAccounts.map(a => ({
    value: a.id,
    label: `${a.platform} — ${a.username ? `@${a.username}` : a.display_name ?? a.id}`,
  }));

  const postOptions = libraryPosts.map(p => ({
    value: p.id,
    label: p.caption?.trim()
      ? `${p.caption.trim().slice(0, 60)}${p.caption.trim().length > 60 ? '…' : ''}`
      : `Post ${p.external_post_id}`,
    icon: p.media_url ? (
      <img src={p.media_url} alt="" className="w-6 h-6 rounded object-cover" />
    ) : undefined,
  }));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Enter an automation name';
    if (!accountId) e.accountId = 'Select a connected account';
    if (!keywordsText.trim()) e.keywords = 'Enter at least one trigger keyword';
    if (postScope === 'specific' && !sourcePostId) e.sourcePostId = 'Pick a post, or switch to All posts';
    if ((effectiveReplyChannel === 'comment' || effectiveReplyChannel === 'both') && !commentReplyBody.trim()) {
      e.commentReplyBody = 'Enter the public reply text';
    }
    if ((effectiveReplyChannel === 'dm' || effectiveReplyChannel === 'both') && !messageBody.trim()) {
      e.messageBody = 'Enter the DM text';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    setServerProblems([]);
    if (!validate()) return;
    try {
      const input: AutomationInput = {
        name: name.trim(),
        accountId,
        platform: selectedAccount!.platform,
        allPosts: postScope === 'all',
        sourcePostId: postScope === 'specific' && sourcePostId ? Number(sourcePostId) : null,
        keywords: keywordsText.split(',').map(k => k.trim()).filter(Boolean),
        matchMode,
        replyChannel: effectiveReplyChannel,
        commentReplyBody: (effectiveReplyChannel === 'comment' || effectiveReplyChannel === 'both') ? commentReplyBody.trim() : null,
        messageBody: (effectiveReplyChannel === 'dm' || effectiveReplyChannel === 'both') ? messageBody.trim() : null,
        linkUrl: linkUrl.trim() || null,
        tags: tagsText.split(',').map(t => t.trim()).filter(Boolean),
        scoreDelta: Number(scoreDelta) || 0,
        active,
        // "Review-first" reuses Smart Replies' suggest mode — the one real
        // backend concept for "draft it, but a human sends it" — rather
        // than a client-invented review gate the engine doesn't implement.
        aiEnabled: reviewFirst,
        aiMode: reviewFirst ? 'suggest' : undefined,
      };
      if (editAuto) {
        await updateAutomation(editAuto.id, input);
        showToast('Automation updated', 'success');
      } else {
        await createAutomation(input);
        showToast('Automation created', 'success');
      }
      navigate('/automations');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'unsupported_on_platform') {
        // The backend's own capability-matrix rejection — its message list
        // is safe, Populr-authored text (see automations.ts capabilityProblems),
        // never a raw provider error.
        setServerProblems(err.details ?? [err.message]);
      } else {
        showToast(err instanceof Error ? err.message : 'Could not save this automation.', 'error');
      }
    }
  };

  return (
    <div className="pop-page max-w-[640px]">
      <Button label="Back to automations" variant="ghost" size="sm" icon={<ChevronLeft size={16} />} onClick={() => navigate('/automations')} />

      <div className="mt-4 mb-6">
        <Heading level={1}>{editAuto ? 'Edit automation' : 'Create automation'}</Heading>
        <Text type="supporting" display="block" className="mt-1">
          When someone comments a keyword on Instagram, Populr sends an approved reply, saves them as a contact, and tracks the conversation.
        </Text>
      </div>

      {serverProblems.length > 0 && (
        <div className="mb-5">
          <Banner status="error" title="This automation can't be saved as configured">
            <ul className="list-disc pl-4 space-y-0.5">
              {serverProblems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </Banner>
        </div>
      )}

      <Stack gap={5}>
        <TextInput
          label="Automation name"
          value={name}
          onChange={setName}
          placeholder="e.g., Free guide keyword"
          status={fieldStatus(errors.name)}
        />

        {connectedAccounts.length === 0 ? (
          <Text type="body" display="block">
            No connected accounts yet. <button onClick={() => navigate('/connections')} className="underline">Connect one</button> first.
          </Text>
        ) : (
          <Selector
            label="Connected account"
            options={accountOptions}
            value={accountId}
            onChange={value => { setAccountId(value); setSourcePostId(null); }}
            placeholder="Select an account…"
            hasSearch
            status={fieldStatus(errors.accountId)}
          />
        )}

        <div>
          <Text type="label" display="block" className="mb-1.5">Which posts</Text>
          <SegmentedControl label="Which posts" value={postScope} onChange={v => setPostScope(v as 'all' | 'specific')} layout="fill">
            <SegmentedControlItem value="all" label="All posts" />
            <SegmentedControlItem value="specific" label="Specific post" isDisabled={!accountId} />
          </SegmentedControl>

          {postScope === 'specific' && accountId && (
            <div className="mt-3">
              <Stack direction="horizontal" gap={2} align="end">
                <div className="flex-1">
                  <Selector
                    label="Post"
                    isLabelHidden
                    options={postOptions}
                    value={sourcePostId ?? undefined}
                    onChange={value => setSourcePostId(value)}
                    placeholder={postsLoading ? 'Loading your posts…' : 'Select a post…'}
                    hasSearch
                    isLoading={postsLoading}
                    isDisabled={postsLoading}
                    status={postsError ? { type: 'error', message: postsError } : fieldStatus(errors.sourcePostId)}
                  />
                </div>
                <Button
                  label="Sync posts"
                  variant="secondary"
                  size="md"
                  icon={<RefreshCw size={13} />}
                  isIconOnly
                  clickAction={handleSyncPosts}
                  isLoading={postsSyncing}
                  tooltip="Refresh your posts from Instagram"
                />
              </Stack>
              {!postsLoading && !postsError && libraryPosts.length === 0 && (
                <Text type="supporting" display="block" className="mt-1">
                  No posts synced yet — try &ldquo;Sync posts&rdquo;, or paste a link below.
                </Text>
              )}
              <button onClick={() => setShowFindMissing(v => !v)} className="text-[11px] text-[#6B6B6B] hover:text-[#111111] underline mt-1.5">
                Can&apos;t find your post? Paste the link
              </button>
              {showFindMissing && (
                <Stack direction="horizontal" gap={2} className="mt-2" align="end">
                  <div className="flex-1">
                    <TextInput
                      label="Post URL"
                      isLabelHidden
                      value={missingUrl}
                      onChange={setMissingUrl}
                      placeholder="https://instagram.com/p/…"
                    />
                  </div>
                  <Button label="Find" variant="secondary" size="md" clickAction={handleFindMissing} isLoading={findingMissing} isDisabled={!missingUrl.trim()} />
                </Stack>
              )}
            </div>
          )}
        </div>

        <TextInput
          label="Trigger keywords"
          value={keywordsText}
          onChange={setKeywordsText}
          placeholder="link, guide, price"
          description="Comma-separated. Matching is case-insensitive."
          status={fieldStatus(errors.keywords)}
        />

        <div>
          <Text type="label" display="block" className="mb-1.5">Match mode</Text>
          <SegmentedControl label="Match mode" value={matchMode} onChange={v => setMatchMode(v as AutomationMatchMode)} layout="fill">
            {MATCH_MODES.map(m => <SegmentedControlItem key={m.value} value={m.value} label={m.label} />)}
          </SegmentedControl>
        </div>

        <div>
          <Text type="label" display="block" className="mb-1.5">Reply with</Text>
          {caps?.caveat && <Text type="supporting" display="block" className="mb-2">{caps.caveat}</Text>}
          <SegmentedControl label="Reply with" value={effectiveReplyChannel} onChange={v => setReplyChannel(v as AutomationReplyChannel)} layout="fill">
            <SegmentedControlItem value="comment" label="Public reply" isDisabled={!commentAllowed} />
            <SegmentedControlItem value="dm" label="DM" isDisabled={!dmAllowed} />
            <SegmentedControlItem value="both" label="Both" isDisabled={!commentAllowed || !dmAllowed} />
          </SegmentedControl>
        </div>

        {(effectiveReplyChannel === 'comment' || effectiveReplyChannel === 'both') && (
          <TextArea
            label="Public reply text"
            value={commentReplyBody}
            onChange={setCommentReplyBody}
            placeholder="Thanks! Check your DMs 👋"
            rows={2}
            status={fieldStatus(errors.commentReplyBody)}
          />
        )}

        {(effectiveReplyChannel === 'dm' || effectiveReplyChannel === 'both') && (
          <TextArea
            label="DM text"
            value={messageBody}
            onChange={setMessageBody}
            placeholder="Hey {{name}}! Here's the link you asked about: {{link}}"
            rows={3}
            status={fieldStatus(errors.messageBody)}
          />
        )}

        <TextInput label="Link" isOptional value={linkUrl} onChange={setLinkUrl} placeholder="https://your-link.com" />

        <Stack direction="horizontal" gap={4}>
          <div className="flex-1">
            <TextInput label="Tags" isOptional value={tagsText} onChange={setTagsText} placeholder="lead_magnet, warm" />
          </div>
          <div className="flex-1">
            <NumberInput label="Score increase" isOptional value={scoreDelta} onChange={setScoreDelta} min={0} />
          </div>
        </Stack>

        <Stack gap={1}>
          <Switch
            label="Review-first"
            description="Draft a reply for you to approve instead of sending it automatically."
            value={reviewFirst}
            onChange={setReviewFirst}
            labelSpacing="spread"
          />
          <Switch
            label="Active"
            description="Paused automations record engagement but never send a reply."
            value={active}
            onChange={setActive}
            labelSpacing="spread"
          />
        </Stack>

        <div className="pt-2 pb-8">
          <Button
            label={editAuto ? 'Update automation' : 'Save automation'}
            variant="primary"
            width="100%"
            clickAction={handleSave}
          />
        </div>
      </Stack>
    </div>
  );
}
