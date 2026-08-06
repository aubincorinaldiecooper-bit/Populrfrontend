import { useState, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { createAutomation, updateAutomation } from '../../lib/api';
import type { Automation, AutomationInput, Post, TriggerType, ReplyChannel } from '../../lib/api';
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

export type WizardStepKey = 'create' | 'post' | 'replies' | 'review';

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
    automationId: null, name: '', type: null, accountId: null, post: null,
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
  const { showToast, accounts } = useApp();
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

  const instagramAccounts = accounts.filter(a => a.platform === 'instagram' && a.is_connected);

  const update = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState(prev => ({ ...prev, [key]: value, dirty: true }));
  }, []);

  const steps: WizardStepKey[] =
    state.type === 'dm_only' ? ['create', 'replies', 'review'] : ['create', 'post', 'replies', 'review'];
  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];

  const canProceedFromCreate = state.name.trim() !== '' && state.type !== null && !!state.accountId;
  const canProceedFromPost = state.type === 'dm_only' || !!state.post;
  // URL validity gates progression so an invalid link/media value can't ride
  // through to save — the Replies step shows the matching inline error.
  const canProceedFromReplies =
    state.triggerKeywords.length > 0 &&
    isUsableHttpUrl(state.linkUrl) &&
    isUsableHttpUrl(state.mediaUrl);

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
    if (!state.type || !state.accountId) return null;
    const cfg = AUTOMATION_TYPES[state.type];
    // Belt-and-braces behind the Replies step's progression gate: an invalid
    // URL is never persisted as a usable link/attachment.
    const usableLink = state.linkUrl.trim() && isUsableHttpUrl(state.linkUrl) ? state.linkUrl.trim() : null;
    const usableMedia = state.mediaUrl.trim() && isUsableHttpUrl(state.mediaUrl) ? state.mediaUrl.trim() : null;
    return {
      name: state.name.trim(),
      accountId: state.accountId,
      platform: 'instagram',
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
      responseType: usableMedia
        ? (/\.(mp4|mov|webm)(\?|$)/i.test(usableMedia) ? 'video' : 'image')
        : 'text',
      // One button, carrying the automation's link — the engine substitutes
      // the per-contact tracked URL because the urls match.
      buttons: state.buttonLabel.trim() && usableLink
        ? [{ label: state.buttonLabel.trim(), url: usableLink }]
        : null,
      aiEnabled: state.aiEnabled,
      aiInstructions: state.aiInstructions.trim() ? state.aiInstructions.trim() : null,
      active: activate,
    };
  }, [state]);

  const save = useCallback(async (activate: boolean): Promise<Automation> => {
    setSaving(true);
    setSaveError(null);
    try {
      const input = buildInput(activate);
      if (!input) throw new Error('Choose an automation type before saving.');
      const automation = state.automationId
        ? await updateAutomation(state.automationId, input)
        : await createAutomation(input);
      setState(prev => ({ ...prev, automationId: automation.id, active: automation.active, dirty: false }));
      // Now durably on the backend — the local draft's only job was
      // bridging the gap until this point, so its slot is retired.
      if (!editAutomation) deleteWizardDraft(draftId);
      showToast(activate ? 'Automation activated' : 'Automation saved as paused', 'success');
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
  }, [buildInput, draftId, editAutomation, navigate, showToast, state.automationId]);

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
    instagramAccounts,
    steps, currentStep, stepIndex,
    canProceed, canProceedFromCreate, canProceedFromPost, canProceedFromReplies,
    goNext, goBack, cancel, draftSaved,
    saving, saveError, save,
  };
}

export type AutomationWizardApi = ReturnType<typeof useAutomationWizard>;
