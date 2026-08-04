import { useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { createAutomation, updateAutomation } from '../../lib/api';
import type { Automation, AutomationInput, Post, TriggerType, ReplyChannel } from '../../lib/api';

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

function initialStateFor(editAutomation: Automation | null): WizardState {
  if (!editAutomation) {
    return {
      automationId: null, name: '', type: null, accountId: null, post: null,
      triggerKeywords: [], aiEnabled: true, aiInstructions: '', active: false, dirty: false,
    };
  }
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

export function useAutomationWizard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast, accounts } = useApp();
  const editAutomation = (location.state as { automation?: Automation } | null)?.automation ?? null;

  const [state, setState] = useState<WizardState>(() => initialStateFor(editAutomation));
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
      showToast(activate ? 'Automation activated' : 'Draft saved', 'success');
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
  }, [buildInput, navigate, showToast, state.automationId]);

  const confirmDiscard = useCallback(() => {
    if (!state.dirty) return true;
    return window.confirm('Discard unsaved changes to this automation?');
  }, [state.dirty]);

  const cancel = useCallback(() => {
    if (!confirmDiscard()) return;
    navigate('/automations');
  }, [confirmDiscard, navigate]);

  return {
    state, update, isEditing: !!editAutomation, pendingSourcePostId,
    instagramAccounts,
    steps, currentStep, stepIndex,
    canProceed, canProceedFromCreate, canProceedFromPost, canProceedFromReplies,
    goNext, goBack, cancel, confirmDiscard,
    saving, saveError, save,
  };
}

export type AutomationWizardApi = ReturnType<typeof useAutomationWizard>;
