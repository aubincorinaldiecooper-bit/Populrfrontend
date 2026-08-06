import { useState, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { createAutomation, updateAutomation, fetchCapabilities, isBackendConfigured } from '../../lib/api';
import type { Automation, AutomationInput, PlatformCapabilities, Post, TriggerType, ReplyChannel } from '../../lib/api';
import { platformMeta } from '../../lib/platformMeta';
import { deleteWizardDraft, getWizardDraft, newWizardDraftId, saveWizardDraft } from './wizardDrafts';

export type AutomationTypeCard = 'comment_dm' | 'comment_reply' | 'dm_only';

export interface AutomationTypeConfig {
  triggerType: TriggerType;
  replyChannel: ReplyChannel;
  needsPost: boolean;
  title: string;
  description: string;
}

export const AUTOMATION_TYPES: Record<AutomationTypeCard, AutomationTypeConfig> = {
  comment_dm: {
    triggerType: 'comment', replyChannel: 'both', needsPost: true,
    title: 'Comment keyword + DM',
    description: 'When someone comments a keyword, reply publicly and send them a DM.',
  },
  comment_reply: {
    triggerType: 'comment', replyChannel: 'comment', needsPost: true,
    title: 'Comment keyword reply only',
    description: 'When someone comments a keyword, reply publicly — no DM.',
  },
  dm_only: {
    triggerType: 'dm', replyChannel: 'dm', needsPost: false,
    title: 'DM-only flow',
    description: 'When someone DMs a keyword, respond only in DM — no post needed.',
  },
};

export function automationToTypeCard(a: Pick<Automation, 'trigger_type' | 'reply_channel'>): AutomationTypeCard {
  if (a.trigger_type === 'dm' || a.reply_channel === 'dm') return 'dm_only';
  if (a.reply_channel === 'comment') return 'comment_reply';
  return 'comment_dm';
}

/**
 * Why an automation type can't run on a platform, as user-facing copy — or
 * null when it can. Different platforms grant different privileges (X has
 * DMs but won't DM someone because they commented; LinkedIn allows no DM
 * automation at all; TikTok/YouTube expose neither comments nor DMs), so the
 * type cards are mapped to what the selected account's channel really
 * supports. Unknown caps (still loading, or the endpoint failed) fail open:
 * hiding a type the platform does support is worse than showing one it
 * doesn't — the backend re-validates every save against the same matrix.
 */
export function typeRestriction(
  type: AutomationTypeCard,
  caps: PlatformCapabilities | null | undefined
): string | null {
  if (!caps) return null;
  const name = platformMeta(caps.platform).name;
  if (type === 'comment_dm') {
    if (!caps.supportsCommentReplies && !caps.supportsDMs)
      return `${name} doesn't support comment replies or DMs yet.`;
    if (!caps.supportsCommentReplies) return `${name} doesn't support comment replies.`;
    if (!caps.supportsDMs) return `${name} doesn't support automated DMs.`;
    if (!caps.supportsCommentToDM)
      return `${name} doesn't allow DMing someone just because they commented.`;
    return null;
  }
  if (type === 'comment_reply') {
    return caps.supportsCommentReplies ? null : `${name} doesn't support comment replies.`;
  }
  return caps.supportsDMs ? null : `${name} doesn't support automated DMs.`;
}

export type WizardStepKey = 'create' | 'post' | 'replies' | 'review';

/** Whether a media URL is a video by extension — the same rule buildInput
 *  uses to pick responseType, so "what kind is this attachment" never
 *  disagrees between validation, preview, and save. */
export function isVideoMediaUrl(value: string): boolean {
  return /\.(mp4|mov|webm)(\?|$)/i.test(value.trim());
}

/** A link the automation can actually send: an absolute http(s) URL. Empty
 *  counts as "not provided" (these fields are optional); anything else —
 *  bare words, typos, javascript: — gets an inline error in the Replies
 *  step, blocks progression there, and is never persisted as usable. */
export function isUsableHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface WizardState {
  automationId: string | null;
  name: string;
  type: AutomationTypeCard | null;
  accountId: string | null;
  /** The selected account's platform, captured when the account is picked
   *  (and from the automation itself when editing). Kept in state — not just
   *  derived — so a resumed draft still knows its channel even when the
   *  accounts list hasn't loaded. The live list wins whenever available. */
  platform: string | null;
  post: Post | null;
  triggerKeywords: string[];
  /** The replies the automation actually sends — these map to the backend's
   *  comment_reply_body / message_body / link_url. Until these existed the
   *  Replies step configured nothing: every automation fell back to the
   *  engine's generic default text with no link. */
  commentReplyBody: string;
  dmBody: string;
  linkUrl: string;
  /** Optional image/video URL attached to the DM — Zernio's sendDM carries
   *  it, and the engine sends it capability-gated per platform. */
  mediaUrl: string;
  /** Label for a tappable DM button that opens the tracked link. Empty = no
   *  button. Requires linkUrl — the button's url IS the automation's link,
   *  which the engine swaps for the per-contact tracked URL at send time. */
  buttonLabel: string;
  aiEnabled: boolean;
  aiInstructions: string;
  active: boolean;
  dirty: boolean;
}

function blankState(): WizardState {
  return {
    automationId: null, name: '', type: null, accountId: null, platform: null, post: null,
    triggerKeywords: [], commentReplyBody: '', dmBody: '', linkUrl: '', mediaUrl: '', buttonLabel: '',
    aiEnabled: true, aiInstructions: '', active: false, dirty: false,
  };
}

function initialStateFor(editAutomation: Automation | null): WizardState {
  if (!editAutomation) return blankState();
  return {
    automationId: editAutomation.id,
    name: editAutomation.name,
    type: automationToTypeCard(editAutomation),
    accountId: editAutomation.account_id,
    platform: editAutomation.platform ?? null,
    post: null, // hydrated by PostStep from source_post_id once posts load
    triggerKeywords: editAutomation.keywords,
    commentReplyBody: editAutomation.comment_reply_body ?? '',
    dmBody: editAutomation.message_body ?? '',
    linkUrl: editAutomation.link_url ?? '',
    mediaUrl: editAutomation.media_url ?? '',
    // The wizard models one button: the tracked-link button. Hydrate its
    // label from the first stored button whose url is the automation's link.
    buttonLabel: editAutomation.buttons?.find(b => b.url === editAutomation.link_url)?.label
      ?? editAutomation.buttons?.[0]?.label ?? '',
    aiEnabled: editAutomation.ai_enabled,
    aiInstructions: editAutomation.ai_instructions ?? '',
    active: editAutomation.active,
    dirty: false,
  };
}

/**
 * Whether there's anything worth keeping as a draft yet. Prevents an opened-
 * and-abandoned blank wizard from littering the Drafts section with empty
 * "Untitled" entries. accountId deliberately doesn't count: CreateStep
 * auto-selects a sole connected account on mount (marking the wizard dirty
 * with zero user input), and even a hand-picked account is a single click —
 * not work worth resuming on its own.
 */
function hasDraftContent(state: WizardState): boolean {
  return (
    state.name.trim() !== '' ||
    state.type !== null ||
    state.post !== null ||
    state.triggerKeywords.length > 0 ||
    state.aiInstructions.trim() !== ''
  );
}

export function useAutomationWizard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast, accounts, accountsLoading, accountsError } = useApp();
  const navState = location.state as { automation?: Automation; draftId?: string } | null;
  const editAutomation = navState?.automation ?? null;
  // Only honored for new automations: editing an existing one always hydrates
  // from the real backend record — mixing in a local draft there would risk
  // bleeding one automation's half-typed fields into a different one.
  const resumeDraftId = editAutomation ? null : navState?.draftId ?? null;

  // The draft slot this wizard session autosaves into (see the effect below):
  // the resumed draft's own id, or a fresh slot for a brand-new automation.
  // /automations/new without a draftId therefore ALWAYS starts blank — a
  // previous unfinished attempt never hijacks a fresh create; it stays in the
  // Automations page's Drafts section until explicitly resumed or deleted.
  const [draftId] = useState(() => resumeDraftId ?? newWizardDraftId());
  // Each lazy initializer runs exactly once, on mount — so repeating the same
  // pure localStorage read in three of them is equivalent to (and simpler
  // than) reading it once into a ref.
  const [state, setState] = useState<WizardState>(() => {
    if (editAutomation) return initialStateFor(editAutomation);
    // Merged over blankState: drafts saved before the reply fields existed
    // resume with empty strings rather than undefined.
    const draft = resumeDraftId ? getWizardDraft(resumeDraftId) : null;
    return draft ? { ...blankState(), ...draft.state } : blankState();
  });
  const [stepIndex, setStepIndex] = useState(
    () => (resumeDraftId ? getWizardDraft(resumeDraftId) : null)?.stepIndex ?? 0
  );
  // True once this session's work is durably in the drafts store — drives the
  // wizard header's "Saved to drafts" indicator (the composer-style quiet
  // status text, not a toast).
  const [draftSaved, setDraftSaved] = useState(
    () => !!resumeDraftId && !!getWizardDraft(resumeDraftId)
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Autosave on every change — the same posture as the post composer's draft
  // autosave. Never while editing an existing automation (see resumeDraftId
  // above), and only once there's something worth resuming; after that, keep
  // the slot in sync even if the user clears those fields again.
  useEffect(() => {
    if (editAutomation || !state.dirty) return;
    if (!draftSaved && !hasDraftContent(state)) return;
    saveWizardDraft({ id: draftId, state, stepIndex, savedAt: new Date().toISOString() });
    // One-shot flip (guarded above), reflecting a localStorage side effect —
    // not a render-derived value, and it can't cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!draftSaved) setDraftSaved(true);
  }, [editAutomation, draftId, state, stepIndex, draftSaved]);

  const pendingSourcePostId = editAutomation?.source_post_id ?? null;

  // Every connected account, whatever its platform — the automation's channel
  // is whichever account the user picks, not Instagram by definition.
  const connectedAccounts = accounts.filter(a => a.is_connected);

  // The channel this automation runs on: the live account list is
  // authoritative, with the platform captured in state (when the account was
  // picked, or from the automation being edited) covering a draft/edit whose
  // accounts fetch hasn't succeeded.
  const platform = accounts.find(a => a.id === state.accountId)?.platform ?? state.platform;

  // The capability matrix mapping what each platform's automation can do —
  // fetched once and shared by every step (type cards, reply fields, tester).
  const [capabilities, setCapabilities] = useState<PlatformCapabilities[] | null>(null);
  useEffect(() => {
    if (!isBackendConfigured()) return;
    let cancelled = false;
    fetchCapabilities()
      .then(list => { if (!cancelled) setCapabilities(list); })
      // Fail open (caps stay null → nothing is gated): the backend re-checks
      // every save, and hiding supported options is the worse failure.
      .catch(err => console.error('[wizard] capabilities load failed — not gating by platform:', err));
    return () => { cancelled = true; };
  }, []);
  const platformCaps = (platform && capabilities?.find(c => c.platform === platform)) || null;

  const update = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState(prev => {
      // Switching accounts: the platform follows the account, and the chosen
      // post can't — a post belongs to exactly one account (the backend
      // rejects a mismatched pair), so a stale selection is cleared instead
      // of riding silently to an account that never published it.
      if (key === 'accountId' && value !== prev.accountId) {
        const nextPlatform = accounts.find(a => a.id === value)?.platform ?? null;
        return { ...prev, accountId: value as WizardState['accountId'], platform: nextPlatform, post: null, dirty: true };
      }
      return { ...prev, [key]: value, dirty: true };
    });
  }, [accounts]);

  const steps: WizardStepKey[] =
    state.type === 'dm_only' ? ['create', 'replies', 'review'] : ['create', 'post', 'replies', 'review'];
  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];

  // Whether the account list is trustworthy right now: a successful load, not
  // a pending/failed one. Only a proven list can declare an account
  // disconnected — otherwise a fetch failure (accounts left at []) would treat
  // a valid existing accountId as dead and block Save with no way forward.
  const accountsKnown = !accountsLoading && !accountsError;
  // The account must be one that's actually connected right now — but if we
  // don't yet have a trustworthy list, preserve the selected id rather than
  // calling it disconnected. A draft/edit id that's genuinely gone is only
  // treated as such once a successful load proves it.
  const accountConnected =
    !!state.accountId && (connectedAccounts.some(a => a.id === state.accountId) || !accountsKnown);
  // The chosen type must be one the selected account's platform can actually
  // run — switching from an Instagram account to an X one with "Comment
  // keyword + DM" selected leaves the card visibly blocked with the reason,
  // rather than letting the wizard carry a combination the platform refuses.
  const typeAllowedOnPlatform = !state.type || typeRestriction(state.type, platformCaps) === null;
  const canProceedFromCreate =
    state.name.trim() !== '' && state.type !== null && accountConnected && typeAllowedOnPlatform;
  const canProceedFromPost = state.type === 'dm_only' || !!state.post;

  // URL validity gates progression so an invalid link/media value can't ride
  // through to save — the Replies step shows the matching inline error.
  // Media rides only on DMs, so an invalid media URL left behind after
  // switching to a comment-only type is ignored here (its field is hidden —
  // an invisible error would strand Continue with nothing to correct) and
  // dropped by buildInput below.
  const repliesCfg = state.type ? AUTOMATION_TYPES[state.type] : null;
  const repliesWantDM = repliesCfg?.replyChannel === 'dm' || repliesCfg?.replyChannel === 'both';
  const repliesWantComment = repliesCfg?.replyChannel === 'comment' || repliesCfg?.replyChannel === 'both';

  // DM payload privileges vary by platform (Reddit DMs are text-only; X has
  // no DM buttons). What the platform can't carry doesn't count as reply
  // content and is never persisted — otherwise a media-only DM on a
  // text-only platform would save an automation that sends nothing.
  // dmTakesMedia ("can carry ANY media") drives field visibility; the
  // entered attachment itself is judged by its own KIND below, since a
  // platform can support one kind but not the other (X: images, not video).
  const dmTakesMedia = platformCaps ? platformCaps.supportsDMImages || platformCaps.supportsDMVideo : true;
  const dmTakesButtons = platformCaps?.supportsButtons ?? true;
  const mediaIsVideo = isVideoMediaUrl(state.mediaUrl);
  const mediaKindAllowed =
    !platformCaps || (mediaIsVideo ? platformCaps.supportsDMVideo : platformCaps.supportsDMImages);
  // A valid attachment of a kind this platform's DMs can't carry blocks
  // progression with the reason — silently dropping what the user typed
  // would contradict the Review/preview. (Persisting it anyway would 422:
  // the backend validates responseType per platform.)
  const dmMediaBlockedReason = (() => {
    if (!platformCaps || mediaKindAllowed) return null;
    const trimmed = state.mediaUrl.trim();
    if (!repliesWantDM || trimmed === '' || !isUsableHttpUrl(state.mediaUrl)) return null;
    const name = platformMeta(platformCaps.platform).name;
    const otherKindAllowed = mediaIsVideo ? platformCaps.supportsDMImages : platformCaps.supportsDMVideo;
    return `${name} DMs can't carry ${mediaIsVideo ? 'video' : 'images'}${
      otherKindAllowed
        ? ` — try ${mediaIsVideo ? 'an image' : 'a video'} instead, or remove the attachment.`
        : ' — remove the attachment.'
    }`;
  })();

  // A DM-bearing reply has content if it has text, a usable link, or media
  // the platform can deliver (a button rides on the link). A comment-only
  // reply needs comment text.
  const usableLinkPresent = state.linkUrl.trim() !== '' && isUsableHttpUrl(state.linkUrl);
  const dmHasContent =
    state.dmBody.trim() !== '' || usableLinkPresent || (state.mediaUrl.trim() !== '' && mediaKindAllowed);
  // The automation must have SOMETHING to send, or it would save and activate
  // only to send an empty/no-op reply (the engine now skips an empty DM). In
  // AI mode the instructions are the reply, so they're what's required.
  const hasReplyContent = state.aiEnabled
    ? state.aiInstructions.trim() !== ''
    : repliesWantDM
      ? dmHasContent
      : state.commentReplyBody.trim() !== '';

  const canProceedFromReplies =
    state.triggerKeywords.length > 0 &&
    hasReplyContent &&
    isUsableHttpUrl(state.linkUrl) &&
    (!repliesWantDM || isUsableHttpUrl(state.mediaUrl)) &&
    !dmMediaBlockedReason;

  const canProceed = (() => {
    if (currentStep === 'create') return canProceedFromCreate;
    if (currentStep === 'post') return canProceedFromPost;
    if (currentStep === 'replies') return canProceedFromReplies;
    return true;
  })();

  const goNext = useCallback(() => {
    if (!canProceed) return;
    setStepIndex(i => Math.min(i + 1, steps.length - 1));
  }, [canProceed, steps.length]);

  const goBack = useCallback(() => setStepIndex(i => Math.max(i - 1, 0)), []);

  const buildInput = useCallback((activate: boolean): AutomationInput | null => {
    if (!state.type || !state.accountId || !platform) return null;
    const cfg = AUTOMATION_TYPES[state.type];
    const wantsDM = cfg.replyChannel === 'dm' || cfg.replyChannel === 'both';
    // Belt-and-braces behind the Replies step's progression gate: an invalid
    // URL is never persisted as a usable link/attachment, and media/buttons
    // (which only ride on DMs) never survive a switch to a comment-only type
    // or to a platform whose DMs can't carry that KIND of attachment (the
    // backend validates responseType per platform, so an unsupported kind
    // would 422 the save).
    const usableLink = state.linkUrl.trim() && isUsableHttpUrl(state.linkUrl) ? state.linkUrl.trim() : null;
    const usableMedia = wantsDM && mediaKindAllowed && state.mediaUrl.trim() && isUsableHttpUrl(state.mediaUrl)
      ? state.mediaUrl.trim()
      : null;
    return {
      name: state.name.trim(),
      accountId: state.accountId,
      // The platform is the selected account's platform — the backend
      // rejects any pair that disagrees (platform_account_mismatch).
      platform,
      triggerType: cfg.triggerType,
      replyChannel: cfg.replyChannel,
      keywords: state.triggerKeywords,
      sourcePostId: cfg.needsPost && state.post ? Number(state.post.id) : null,
      allPosts: !cfg.needsPost,
      commentReplyBody: state.commentReplyBody.trim() ? state.commentReplyBody.trim() : null,
      messageBody: state.dmBody.trim() ? state.dmBody.trim() : null,
      linkUrl: usableLink,
      mediaUrl: usableMedia,
      // The backend validates the media type against the platform's DM
      // capabilities, keyed by responseType.
      responseType: usableMedia ? (isVideoMediaUrl(usableMedia) ? 'video' : 'image') : 'text',
      // One button, carrying the automation's link — the engine substitutes
      // the per-contact tracked URL because the urls match. DM-only: a
      // button can't ride on a public comment reply, and platforms without
      // DM buttons deliver the tracked link as text instead.
      buttons: wantsDM && dmTakesButtons && state.buttonLabel.trim() && usableLink
        ? [{ label: state.buttonLabel.trim(), url: usableLink }]
        : null,
      aiEnabled: state.aiEnabled,
      aiInstructions: state.aiInstructions.trim() ? state.aiInstructions.trim() : null,
      active: activate,
    };
  }, [state, platform, mediaKindAllowed, dmTakesButtons]);

  // 'keep' preserves the automation's current active state — the neutral
  // "Save changes" an editor expects. Without it the footer only offered
  // "Save as paused" / "Activate", so editing a live automation and clicking
  // the (reasonably read as "save") paused button silently deactivated it.
  const save = useCallback(async (activate: boolean | 'keep'): Promise<Automation> => {
    setSaving(true);
    setSaveError(null);
    const shouldActivate = activate === 'keep' ? state.active : activate;
    try {
      if (!state.type) throw new Error('Choose an automation type before saving.');
      if (!state.accountId) throw new Error('Pick a connected account before saving.');
      const input = buildInput(shouldActivate);
      // Only reachable when the platform is unknowable: a pre-platform draft
      // whose accounts fetch failed. Saving anyway would guess a channel.
      if (!input) throw new Error("We couldn't confirm which platform this account is on. Check your connection and try again.");
      const automation = state.automationId
        ? await updateAutomation(state.automationId, input)
        : await createAutomation(input);
      setState(prev => ({ ...prev, automationId: automation.id, active: automation.active, dirty: false }));
      // Now durably on the backend — the local draft's only job was
      // bridging the gap until this point, so its slot is retired.
      if (!editAutomation) deleteWizardDraft(draftId);
      showToast(
        activate === 'keep' ? 'Changes saved' : shouldActivate ? 'Automation activated' : 'Automation saved as paused',
        'success'
      );
      navigate('/automations');
      return automation;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save this automation.';
      setSaveError(msg);
      showToast(msg, 'error');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [buildInput, draftId, editAutomation, navigate, showToast, state.automationId, state.active, state.type, state.accountId]);

  const cancel = useCallback(() => {
    // Edits to an existing automation aren't draft-persisted, so closing
    // would genuinely lose them — confirm first. A new automation's work is
    // already autosaved to Drafts, so closing just leaves, exactly like
    // backing out of a post composer.
    if (editAutomation && state.dirty && !window.confirm('Discard unsaved changes to this automation?')) {
      return;
    }
    navigate('/automations');
  }, [editAutomation, state.dirty, navigate]);

  return {
    state, update, isEditing: !!editAutomation, pendingSourcePostId,
    connectedAccounts,
    // The selected account's platform and its capability entry — every step
    // reads these instead of assuming Instagram (or re-fetching the matrix).
    platform, platformCaps,
    steps, currentStep, stepIndex,
    canProceed, canProceedFromCreate, canProceedFromPost, canProceedFromReplies,
    // Surfaced so the Replies step and Review can reflect the same content/URL
    // requirements the gate enforces, and so Review can re-assert them before
    // Activate rather than silently letting an invalid draft through.
    hasReplyContent, repliesWantComment, repliesWantDM,
    dmTakesMedia, dmTakesButtons, dmMediaBlockedReason,
    goNext, goBack, cancel, draftSaved,
    saving, saveError, save,
  };
}

export type AutomationWizardApi = ReturnType<typeof useAutomationWizard>;
