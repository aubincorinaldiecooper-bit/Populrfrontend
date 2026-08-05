import { describe, it, expect, beforeEach } from 'vitest';
import {
  listWizardDrafts,
  getWizardDraft,
  saveWizardDraft,
  deleteWizardDraft,
  newWizardDraftId,
  type WizardDraft,
} from '../components/automation-wizard/wizardDrafts';
import type { WizardState } from '../components/automation-wizard/useAutomationWizard';

/* The localStorage store behind the Automations page's Drafts section.
 * The wizard autosaves unfinished automations here (never auto-resumes
 * them — resuming is an explicit click on a draft card), so the store's
 * list/get/save/delete round-trip and its migration of the old
 * single-slot v1 stash are what keep "unfinished work shows up in
 * Drafts" true. */

const STORAGE_KEY = 'populr.automationWizardDrafts.v2';
const LEGACY_KEY = 'populr.automationWizardDraft.v1';

function wizardState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    automationId: null,
    name: 'My automation',
    type: 'comment_dm',
    accountId: 'acct_1',
    post: null,
    triggerKeywords: ['grow'],
    commentReplyBody: '',
    dmBody: '',
    linkUrl: '',
    mediaUrl: '',
    buttonLabel: '',
    aiEnabled: true,
    aiInstructions: '',
    active: false,
    dirty: true,
    ...overrides,
  };
}

function draft(overrides: Partial<WizardDraft> = {}): WizardDraft {
  return {
    id: newWizardDraftId(),
    state: wizardState(),
    stepIndex: 1,
    savedAt: '2026-08-05T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('wizardDrafts store', () => {
  it('starts empty and round-trips a saved draft', () => {
    expect(listWizardDrafts()).toEqual([]);
    const d = draft();
    saveWizardDraft(d);
    expect(getWizardDraft(d.id)).toEqual(d);
    expect(listWizardDrafts()).toEqual([d]);
  });

  it('updates an existing slot in place instead of duplicating it', () => {
    const d = draft();
    saveWizardDraft(d);
    const updated = { ...d, state: wizardState({ name: 'Renamed' }), savedAt: '2026-08-05T11:00:00.000Z' };
    saveWizardDraft(updated);
    expect(listWizardDrafts()).toHaveLength(1);
    expect(getWizardDraft(d.id)?.state.name).toBe('Renamed');
  });

  it('lists newest first', () => {
    const older = draft({ savedAt: '2026-08-01T00:00:00.000Z' });
    const newer = draft({ savedAt: '2026-08-04T00:00:00.000Z' });
    saveWizardDraft(older);
    saveWizardDraft(newer);
    expect(listWizardDrafts().map(d => d.id)).toEqual([newer.id, older.id]);
  });

  it('deletes a draft and leaves the rest alone', () => {
    const a = draft();
    const b = draft();
    saveWizardDraft(a);
    saveWizardDraft(b);
    deleteWizardDraft(a.id);
    expect(getWizardDraft(a.id)).toBeNull();
    expect(getWizardDraft(b.id)).toEqual(b);
  });

  it('migrates the old single-slot v1 stash into the store, once', () => {
    const legacyState = wizardState({ name: 'From the old stash' });
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify({ state: legacyState, stepIndex: 2 }));

    const migrated = listWizardDrafts();
    expect(migrated).toHaveLength(1);
    expect(migrated[0].state.name).toBe('From the old stash');
    expect(migrated[0].stepIndex).toBe(2);
    // The old key is consumed — a second read doesn't duplicate the draft.
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(listWizardDrafts()).toHaveLength(1);
  });

  it('treats corrupt storage as empty instead of throwing', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json at all');
    expect(listWizardDrafts()).toEqual([]);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ unexpected: 'shape' }));
    expect(listWizardDrafts()).toEqual([]);
    // Entries missing required fields are dropped, valid ones kept.
    const good = draft();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([good, { nope: true }, null]));
    expect(listWizardDrafts()).toEqual([good]);
  });

  it('coerces malformed state fields to safe defaults instead of crashing consumers', () => {
    // A partially corrupt / future-versioned entry: the Drafts list reads
    // state.name.toLowerCase() and state.triggerKeywords.some(...) without
    // further guards, so every field must come back type-correct.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { id: 'x', state: {} },
      { id: 'y', state: { name: 123, type: 'not_a_real_type', triggerKeywords: 'kw', aiInstructions: null } },
      { id: 'z', state: { name: 'ok', triggerKeywords: ['a', 7, 'b'] } },
    ]));
    const [x, y, z] = ['x', 'y', 'z'].map(id => getWizardDraft(id)!);
    expect(x.state.name).toBe('');
    expect(x.state.triggerKeywords).toEqual([]);
    expect(y.state.name).toBe('');
    expect(y.state.type).toBeNull();
    expect(y.state.triggerKeywords).toEqual([]);
    expect(y.state.aiInstructions).toBe('');
    expect(z.state.triggerKeywords).toEqual(['a', 'b']);
    // Sanity: the fields the UI calls methods on are the right types.
    for (const d of listWizardDrafts()) {
      expect(typeof d.state.name.toLowerCase()).toBe('string');
      expect(d.state.triggerKeywords.every(k => typeof k === 'string')).toBe(true);
    }
  });

  it('caps the store, dropping the oldest drafts first', () => {
    for (let i = 0; i < 25; i++) {
      saveWizardDraft(draft({ savedAt: `2026-07-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }));
    }
    const all = listWizardDrafts();
    expect(all).toHaveLength(20);
    // The five oldest (July 1–5) fell off the end.
    expect(all[all.length - 1].savedAt).toBe('2026-07-06T00:00:00.000Z');
  });
});
