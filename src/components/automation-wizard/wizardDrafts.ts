import type { WizardState } from './useAutomationWizard';

// ============================================================
// Local drafts for NEW automations — the store behind the Automations page's
// "Drafts" section. The wizard autosaves into a slot here while the creator
// works (see useAutomationWizard), the same way the post composer autosaves
// a draft post; opening /automations/new always starts blank, and a draft is
// only ever resumed by explicitly picking it from the Drafts section.
//
// The backend can't hold an in-progress automation until it has a name,
// accountId, and at least one keyword (POST /api/automations 400s without
// them — see populrbackend/src/routes/automations.ts), so unfinished
// automations live in browser localStorage: durable across navigations and
// reloads on this device, gone once the automation is really saved.
// ============================================================

export interface WizardDraft {
  id: string;
  state: WizardState;
  stepIndex: number;
  /** ISO timestamp of the last autosave — newest first in listings. */
  savedAt: string;
}

const STORAGE_KEY = 'populr.automationWizardDrafts.v2';
/** The pre-Drafts-section single-slot stash — migrated into the store on read. */
const LEGACY_STORAGE_KEY = 'populr.automationWizardDraft.v1';

/** Oldest drafts are dropped past this cap so the store can't grow forever. */
const MAX_DRAFTS = 20;

export function newWizardDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const TYPE_CARDS = ['comment_dm', 'comment_reply', 'dm_only'] as const;

/**
 * Coerce a stored state into a shape the wizard and the Drafts list can
 * safely consume (they read state.name.toLowerCase(),
 * state.triggerKeywords.some(...), etc. without further guards). Anything
 * that isn't an object is unusable; individual fields of the wrong type —
 * a partially corrupt or future-versioned entry — degrade to their blank
 * defaults instead of crashing the page.
 */
function sanitizeState(value: unknown): WizardState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const s = value as Record<string, unknown>;
  return {
    automationId: typeof s.automationId === 'string' ? s.automationId : null,
    name: typeof s.name === 'string' ? s.name : '',
    type: TYPE_CARDS.includes(s.type as (typeof TYPE_CARDS)[number])
      ? (s.type as WizardState['type'])
      : null,
    accountId: typeof s.accountId === 'string' ? s.accountId : null,
    // Absent in drafts saved before the wizard was channel-aware (all
    // Instagram by construction); the wizard re-derives from the live
    // account list whenever it can, so null is only a fallback label.
    platform: typeof s.platform === 'string' ? s.platform : null,
    post: s.post && typeof s.post === 'object' && !Array.isArray(s.post)
      ? (s.post as WizardState['post'])
      : null,
    triggerKeywords: Array.isArray(s.triggerKeywords)
      ? s.triggerKeywords.filter((k): k is string => typeof k === 'string')
      : [],
    // Reply fields arrived after v2 drafts existed — older entries degrade
    // to blanks, same as every other missing field here.
    commentReplyBody: typeof s.commentReplyBody === 'string' ? s.commentReplyBody : '',
    dmBody: typeof s.dmBody === 'string' ? s.dmBody : '',
    linkUrl: typeof s.linkUrl === 'string' ? s.linkUrl : '',
    mediaUrl: typeof s.mediaUrl === 'string' ? s.mediaUrl : '',
    buttonLabel: typeof s.buttonLabel === 'string' ? s.buttonLabel : '',
    aiEnabled: typeof s.aiEnabled === 'boolean' ? s.aiEnabled : true,
    aiInstructions: typeof s.aiInstructions === 'string' ? s.aiInstructions : '',
    active: s.active === true,
    dirty: s.dirty === true,
  };
}

function toDraft(value: unknown): WizardDraft | null {
  if (!value || typeof value !== 'object') return null;
  const d = value as Partial<WizardDraft>;
  if (typeof d.id !== 'string') return null;
  const state = sanitizeState(d.state);
  if (!state) return null;
  return {
    id: d.id,
    state,
    stepIndex: typeof d.stepIndex === 'number' ? d.stepIndex : 0,
    savedAt: typeof d.savedAt === 'string' ? d.savedAt : new Date(0).toISOString(),
  };
}

function readAll(): WizardDraft[] {
  let drafts: WizardDraft[] = [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        drafts = parsed.map(toDraft).filter((d): d is WizardDraft => d !== null);
      }
    }
  } catch {
    // Corrupt JSON, storage disabled (private browsing), or a shape from a
    // future version of this format — treat as "no drafts" rather than
    // crash the caller.
    drafts = [];
  }

  // One-time migration of the old single-slot stash, so a draft someone
  // already had doesn't silently vanish when this version ships.
  try {
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as { state?: unknown; stepIndex?: number };
      const legacyState = legacy && typeof legacy === 'object' ? sanitizeState(legacy.state) : null;
      if (legacyState) {
        drafts.push({
          id: newWizardDraftId(),
          state: legacyState,
          stepIndex: typeof legacy.stepIndex === 'number' ? legacy.stepIndex : 0,
          savedAt: new Date().toISOString(),
        });
        writeAll(drafts);
      }
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch {
    // Unreadable legacy stash — nothing worth keeping.
  }

  return drafts;
}

function writeAll(drafts: WizardDraft[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Storage full or disabled — the wizard still works this session, the
    // draft just won't survive a navigation. Not worth surfacing.
  }
}

/** All drafts on this device, newest first. */
export function listWizardDrafts(): WizardDraft[] {
  return readAll().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function getWizardDraft(id: string): WizardDraft | null {
  return readAll().find(d => d.id === id) ?? null;
}

/** Insert or update a draft slot. */
export function saveWizardDraft(draft: WizardDraft): void {
  const drafts = readAll().filter(d => d.id !== draft.id);
  drafts.push(draft);
  drafts.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  writeAll(drafts.slice(0, MAX_DRAFTS));
}

export function deleteWizardDraft(id: string): void {
  const drafts = readAll();
  const remaining = drafts.filter(d => d.id !== id);
  if (remaining.length !== drafts.length) writeAll(remaining);
}
