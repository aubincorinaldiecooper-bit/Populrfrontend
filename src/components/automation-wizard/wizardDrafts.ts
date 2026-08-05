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

function isDraft(value: unknown): value is WizardDraft {
  if (!value || typeof value !== 'object') return false;
  const d = value as Partial<WizardDraft>;
  return typeof d.id === 'string' && !!d.state && typeof d.state === 'object';
}

function readAll(): WizardDraft[] {
  let drafts: WizardDraft[] = [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        drafts = parsed.filter(isDraft).map(d => ({
          id: d.id,
          state: d.state,
          stepIndex: typeof d.stepIndex === 'number' ? d.stepIndex : 0,
          savedAt: typeof d.savedAt === 'string' ? d.savedAt : new Date(0).toISOString(),
        }));
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
      const legacy = JSON.parse(legacyRaw) as { state?: WizardState; stepIndex?: number };
      if (legacy && typeof legacy === 'object' && legacy.state) {
        drafts.push({
          id: newWizardDraftId(),
          state: legacy.state,
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
