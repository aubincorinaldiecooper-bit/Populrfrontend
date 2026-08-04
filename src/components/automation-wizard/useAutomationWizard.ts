import { useState, useCallback, useEffect } from 'react';
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

// ============================================================
// Local draft persistence for NEW automations only. Editing an existing
// automation always hydrates from the real backend record (above) — mixing
// in a stray local draft there would risk bleeding one automation's
// half-typed fields into a different one.
//
// The backend can't hold an in-progress draft until it has a name,
// accountId, and at least one keyword (POST /api/automations 400s without
// them — see populrbackend/src/routes/automations.ts), which rules out
// autosaving to the server from step 1. So this is deliberately a
// browser-local, single-slot stash: it exists purely so that navigating
// away mid-wizard (sidebar click, back button, closed tab) and returning
// to /automations/new resumes exactly where the creator left off, instead
// of silently discarding everything they'd typed.
// ============================================================
const DRAFT_STORAGE_KEY = 'populr.automationWizardDraft.v1';

interface StoredDraft {
  state: WizardState;
  stepIndex: number;
}

function readDraft(): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (!parsed || typeof parsed !== 'object' || !parsed.state) return null;
    return { state: parsed.state, stepIndex: typeof parsed.stepIndex === 'number' ? parsed.stepIndex : 0 };
  } catch {
    // Corrupt JSON, storage disabled (private browsing), or a shape from a
    // future version of this draft format — treat as "no draft" rather
    // than crash the wizard on load.
    return null;
  }
}

function writeDraft(draft: StoredDraft): void {
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage full or disabled — the wizard still works this session, it
    // just won't survive a navigation. Not worth surfacing to the user.
  }
}

function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Nothing to do if storage is unavailable.
  }
}

export function useAutomationWizard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast, accounts } = useApp();
  const editAutomation = (location.state as { automation?: Automation } | null)?.automation ?? null;

  // Each of these lazy initializers runs exactly once, on mount, and never
  // again — so calling the same pure localStorage read from three of them
  // is equivalent to (and simpler than) reading it once into a ref.
  const [state, setState] = useState<WizardState>(
    () => (editAutomation ? null : readDraft())?.state ?? initialStateFor(editAutomation)
  );
  const [stepIndex, setStepIndex] = useState(
    () => (editAutomation ? null : readDraft())?.stepIndex ?? 0
  );
  const [didRestoreDraft] = useState(() => !editAutomation && !!readDraft());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (didRestoreDraft) showToast('Resumed your draft automation', 'info');
    // Fires once on mount only — showToast identity isn't relevant here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every change, but only for brand-new automations (never
  // while editing an existing one — see the comment on readDraft/writeDraft
  // above) and only once there's something worth resuming.
  useEffect(() => {
    if (editAutomation || !state.dirty) return;
    writeDraft({ state, stepIndex });
  }, [editAutomation, state, stepIndex]);

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
      // Now durably on the backend — the local stash's only job was
      // bridging the gap until this point, so it's redundant from here on.
      if (!editAutomation) clearDraft();
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
  }, [buildInput, editAutomation, navigate, showToast, state.automationId]);

  const confirmDiscard = useCallback(() => {
    if (!state.dirty) return true;
    return window.confirm('Discard unsaved changes to this automation?');
  }, [state.dirty]);

  const cancel = useCallback(() => {
    if (!confirmDiscard()) return;
    // An explicit, confirmed discard means "forget this" — don't resurrect
    // it as a restored draft the next time /automations/new is opened.
    if (!editAutomation) clearDraft();
    navigate('/automations');
  }, [confirmDiscard, editAutomation, navigate]);

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
