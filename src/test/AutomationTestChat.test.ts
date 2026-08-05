import { describe, it, expect, vi } from 'vitest';

/* The wizard test chat's matching and no-preview behavior.
 *
 * Two regressions from the redesign restore, both visible in one screenshot:
 *
 * 1. The local matcher only enforced keywords when triggerType === 'keyword'
 *    — a value the wizard never produces ('comment' / 'dm') — so ANY sample
 *    "matched", with a null keyword rendered as `Matched keyword ""`. The
 *    engine (populrbackend automationMatch.ts) gates on keywords for every
 *    trigger type, so the preview claimed triggers production would never
 *    fire.
 *
 * 2. A missing AI preview (Smart Replies unconfigured, endpoint down)
 *    rendered as an orange "temporarily unavailable" dead-end implying the
 *    automation was broken. Keyword automations reply deterministically
 *    without AI (the backend e2e passes with zero AI calls), so a missing
 *    preview is a note on a successful match, never a failure.
 */

// api.ts imports authClient, which throws at module load without
// VITE_AUTH_URL — stub it so the pure matching logic is importable.
vi.mock('../lib/authClient', () => ({
  getApiAuthToken: async () => null,
  authClient: {},
}));

import { testAutomation } from '../lib/api';
import type { AutomationTestInput } from '../lib/api';

function input(overrides: Partial<AutomationTestInput> = {}): AutomationTestInput {
  return {
    platform: 'instagram',
    accountId: 'acc_1',
    triggerType: 'comment',      // what the wizard actually produces
    keywords: ['guide', 'link'],
    replyChannel: 'both',
    channel: 'comment',
    sampleText: 'hi',
    aiEnabled: true,
    ...overrides,
  };
}

describe('testAutomation — matching mirrors the engine', () => {
  it('does NOT match when no keyword appears, even for comment/dm triggers', async () => {
    const result = await testAutomation(input({ sampleText: 'hi' }));
    expect(result.matched).toBe(false);
    expect(result.reason).toMatch(/keyword/i);
  });

  it('matches and reports the actual keyword when one appears', async () => {
    const result = await testAutomation(input({ sampleText: 'send me the GUIDE please', aiEnabled: false }));
    expect(result.matched).toBe(true);
    expect(result.keyword).toBe('guide');
  });

  it('a matched result never carries an empty-string keyword', async () => {
    const result = await testAutomation(input({ sampleText: 'guide', aiEnabled: false }));
    expect(result.keyword).not.toBe('');
  });
});

describe('testAutomation — previews the configured replies, not placeholders', () => {
  it('renders the configured comment reply and DM with {{name}}/{{link}} resolved', async () => {
    const result = await testAutomation(input({
      sampleText: 'guide please',
      aiEnabled: false,
      commentReplyBody: 'Check your DMs, {{name}}!',
      dmBody: 'Hey {{name}} — grab it here: {{link}}',
      linkUrl: 'https://creator.example/guide',
    }));
    expect(result.publicReply).toBe('Check your DMs, there!');
    expect(result.dm).toBe('Hey there — grab it here: https://creator.example/guide');
  });

  it("falls back to the engine's own default comment reply when none is configured", async () => {
    const result = await testAutomation(input({ sampleText: 'guide', aiEnabled: false }));
    expect(result.publicReply).toBe('Just sent you a DM! 📩');
  });

  it('the configured media rides along with the DM preview — and never with a comment-only reply', async () => {
    const withMedia = await testAutomation(input({
      sampleText: 'guide',
      aiEnabled: false,
      dmBody: 'Here you go, {{name}}!',
      mediaUrl: 'https://creator.example/preview.jpg',
    }));
    expect(withMedia.dmMediaUrl).toBe('https://creator.example/preview.jpg');

    const commentOnly = await testAutomation(input({
      sampleText: 'guide',
      aiEnabled: false,
      replyChannel: 'comment',
      mediaUrl: 'https://creator.example/preview.jpg',
    }));
    expect(commentOnly.dmMediaUrl ?? null).toBeNull();
  });

  it('the tracked-link button previews with the DM — and only when a link exists to carry', async () => {
    const withButton = await testAutomation(input({
      sampleText: 'guide',
      aiEnabled: false,
      dmBody: 'Here you go!',
      linkUrl: 'https://creator.example/guide',
      buttonLabel: 'Get the guide',
    }));
    expect(withButton.dmButtonLabel).toBe('Get the guide');

    // A button with no link has nothing to open — the wizard disables the
    // field, and the preview must not invent one either.
    const noLink = await testAutomation(input({
      sampleText: 'guide',
      aiEnabled: false,
      dmBody: 'Here you go!',
      buttonLabel: 'Get the guide',
    }));
    expect(noLink.dmButtonLabel ?? null).toBeNull();
  });
});

describe('testAutomation — missing AI preview is not a failure', () => {
  it('AI off: matched, will auto-reply, with an informational note — not needsHuman', async () => {
    const result = await testAutomation(input({ sampleText: 'link please', aiEnabled: false }));
    expect(result.matched).toBe(true);
    expect(result.needsHuman).toBe(false);
    expect(result.reason).toMatch(/reply automatically/i);
    expect(result.note).toMatch(/AI drafting is off/i);
  });

  it('preview endpoint unreachable: still a successful match with a note, not an error or dead-end', async () => {
    // No fetch mock: in the test env the request genuinely fails, which is
    // exactly the condition under test.
    const result = await testAutomation(input({ sampleText: 'guide', aiEnabled: true }));
    expect(result.matched).toBe(true);
    expect(result.needsHuman).toBe(false);
    expect(result.note).toMatch(/doesn't affect the automation/i);
    // The old copy must be gone in every branch.
    expect(result.reason).not.toMatch(/temporarily unavailable/i);
    expect(result.note).not.toMatch(/temporarily unavailable/i);
  });

  it('a holding-reply decision previews the warm reply plus the queued-for-you note', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        available: true,
        decision: {
          intent: 'general_engagement', confidence: 0.8, replyType: 'dm',
          replyText: 'Great question — let me check and get back to you!',
          linkToSend: null,
          needsHuman: true, shouldAutoReply: false,
          reason: 'Not covered by the instructions.',
        },
      }),
    })));
    try {
      const result = await testAutomation(input({ sampleText: 'guide — do you ship to Canada?' }));
      expect(result.needsHuman).toBe(true);
      expect(result.dm).toBe('Great question — let me check and get back to you!');
      expect(result.note).toMatch(/queued for you/i);

      // Comment-only automations post the holding reply publicly — their DM
      // branch never runs in production, and the preview must not claim one.
      const commentOnly = await testAutomation(input({
        sampleText: 'guide — do you ship to Canada?', replyChannel: 'comment',
      }));
      expect(commentOnly.publicReply).toBe('Great question — let me check and get back to you!');
      expect(commentOnly.dm).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('an AI escalation decision suppresses reply previews — nothing sends, so nothing renders as sending', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        available: true,
        decision: {
          intent: 'support_issue', confidence: 0.9, replyType: 'dm',
          replyText: null, linkToSend: null,
          needsHuman: true, shouldAutoReply: false,
          reason: 'Sounds like a complaint — best handled personally.',
        },
      }),
    })));
    try {
      const result = await testAutomation(input({
        sampleText: 'guide is broken, refund please',
        commentReplyBody: 'Check your DMs!',
        dmBody: 'Hey {{name}}, here you go: {{link}}',
      }));
      expect(result.needsHuman).toBe(true);
      // The configured texts must NOT appear as previews: an escalation
      // sends nothing, and bubbles would claim otherwise.
      expect(result.publicReply).toBeNull();
      expect(result.dm).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Smart Replies unconfigured on the server: note says so without claiming breakage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ available: false, reason: 'not_configured' }),
    })));
    try {
      const result = await testAutomation(input({ sampleText: 'guide' }));
      expect(result.matched).toBe(true);
      expect(result.needsHuman).toBe(false);
      expect(result.note).toMatch(/isn't set up on this server/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
