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

export interface WizardState {
  automationId: string | null;
  name: string;
  type: AutomationTypeCard | null;
  accountId: string | null;
  post: Post | null;
  triggerKeywords: string[];
  aiEnabled: boolean;
  aiInstructions: string;
  active: boolean;
  dirty: boolean;
}

function blankState(): WizardState {
  return {
    automationId: null, name: '', type: null, accountId: null, post: null,
    triggerKeywords: [], aiEnabled: true, aiInstructions: '', active: false, dirty: false,
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
    aiEnabled: editAutomation.ai_enabled,
    aiInstructions: editAutomation.ai_instructions ?? '',
    active: editAutomation.active,
    dirty: false,
  };
}

/**
 * Whether there's anything worth keeping as a draft yet. Prevents an opened-
 * and-abandoned blank wizard from littering the Drafts section with empty
 * "Untitled" entries.
 */
function hasDraftContent(state: WizardState): boolean {
  return (
    state.name.trim() !== '' ||
    state.type !== null ||
    state.accountId !== null ||
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
    return (resumeDraftId ? getWizardDraft(resumeDraftId) : null)?.state ?? blankState();
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
  const canProceedFromReplies = state.triggerKeywords.length > 0;

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
    return {
      name: state.name.trim(),
      accountId: state.accountId,
      platform: 'instagram',
      triggerType: cfg.triggerType,
      replyChannel: cfg.replyChannel,
      keywords: state.triggerKeywords,
      sourcePostId: cfg.needsPost && state.post ? Number(state.post.id) : null,
      allPosts: !cfg.needsPost,
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
