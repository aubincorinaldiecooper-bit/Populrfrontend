import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import RepliesStep from '../components/automation-wizard/RepliesStep';
import { isUsableHttpUrl, useAutomationWizard } from '../components/automation-wizard/useAutomationWizard';
import type { AutomationWizardApi, WizardState } from '../components/automation-wizard/useAutomationWizard';
import type { PlatformCapabilities } from '../lib/api';

/* Progressive disclosure in the Replies step: only the fields the automation
 * type and the platform can actually use are shown; the Exact message /
 * AI-generated reply choice mirrors the engine's real relationship (an AI
 * draft only ever replaces the DM — the public comment reply is always sent
 * exactly as written, and the DM body is the fallback when the AI can't
 * confidently answer); media/link/button live in one collapsed optional
 * section with real URL validation; the tester is a drawer behind a gated
 * "Test reply" action, not a permanent column. */

const mockFetchCapabilities = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchCapabilities: (...args: unknown[]) => mockFetchCapabilities(...args),
  };
});

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    accounts: [{ id: 'acc_1', platform: 'instagram', username: 'main_ig', status: 'connected', is_connected: true }],
    showToast: vi.fn(),
  }),
}));

function caps(overrides: Partial<PlatformCapabilities>): PlatformCapabilities {
  return {
    platform: 'instagram', supportsComments: true, supportsCommentReplies: true, supportsDMs: true,
    readiness: 'ready', caveat: '', supportedMediaTypes: ['image', 'video'], maxCaptionLength: 2200,
    mediaRequired: true, maxCarouselItems: 10, maxImageSizeMb: 8, maxVideoSizeMb: 100,
    maxVideoDurationSeconds: 90, ...overrides,
  };
}

function makeWizard(overrides: Partial<WizardState>): AutomationWizardApi {
  const state: WizardState = {
    automationId: null, name: 'Test automation', type: 'comment_dm', accountId: 'acc_1', post: null,
    triggerKeywords: ['guide'], commentReplyBody: '', dmBody: '', linkUrl: '', mediaUrl: '', buttonLabel: '',
    aiEnabled: false, aiInstructions: '', active: false, dirty: false,
    ...overrides,
  };
  return { state, update: vi.fn() } as unknown as AutomationWizardApi;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchCapabilities.mockResolvedValue([caps({})]);
  // jsdom has no scrollIntoView; the test chat auto-scrolls on new entries.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe('isUsableHttpUrl', () => {
  it('accepts empty (optional) and absolute http(s) URLs only', () => {
    expect(isUsableHttpUrl('')).toBe(true);
    expect(isUsableHttpUrl('  ')).toBe(true);
    expect(isUsableHttpUrl('https://example.com/guide')).toBe(true);
    expect(isUsableHttpUrl('http://example.com')).toBe(true);
    expect(isUsableHttpUrl('example.com/guide')).toBe(false);
    expect(isUsableHttpUrl('not a url')).toBe(false);
    expect(isUsableHttpUrl('javascript' + ':alert(1)')).toBe(false);
  });
});

describe('RepliesStep — channel and capability gating', () => {
  it('a DM-only automation shows no public-comment field', () => {
    render(<RepliesStep wizard={makeWizard({ type: 'dm_only' })} />);
    expect(screen.queryByLabelText('Public comment reply')).not.toBeInTheDocument();
    expect(screen.getByLabelText('DM message')).toBeInTheDocument();
  });

  it('a comment-only automation shows no DM fields, even inside the media section', () => {
    render(<RepliesStep wizard={makeWizard({ type: 'comment_reply' })} />);
    expect(screen.getByLabelText('Public comment reply')).toBeInTheDocument();
    expect(screen.queryByLabelText('DM message')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add media or link/ }));
    expect(screen.queryByLabelText('Media in the DM')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Link to send')).toBeInTheDocument();
  });

  it('a both-channels automation shows both clearly under Reply content', () => {
    render(<RepliesStep wizard={makeWizard({ type: 'comment_dm' })} />);
    expect(screen.getByLabelText('Public comment reply')).toBeInTheDocument();
    expect(screen.getByLabelText('DM message')).toBeInTheDocument();
  });

  it('platform capabilities hide fields the platform does not support', async () => {
    mockFetchCapabilities.mockResolvedValue([caps({ supportsCommentReplies: false })]);
    render(<RepliesStep wizard={makeWizard({ type: 'comment_dm' })} />);
    await waitFor(() => expect(screen.queryByLabelText('Public comment reply')).not.toBeInTheDocument());
    expect(screen.getByLabelText('DM message')).toBeInTheDocument();
  });
});

describe('RepliesStep — Exact message vs AI-generated reply', () => {
  it('exact mode shows the message fields plainly and no Instructions section', () => {
    render(<RepliesStep wizard={makeWizard({ aiEnabled: false })} />);
    expect(screen.getByRole('radio', { name: 'Exact message' })).toBeChecked();
    expect(screen.queryByText('Instructions for Populr')).not.toBeInTheDocument();
    expect(screen.getByLabelText('DM message')).toBeInTheDocument();
  });

  it('AI mode prioritizes Instructions and demotes both message fields to collapsed fallbacks', () => {
    render(<RepliesStep wizard={makeWizard({ aiEnabled: true })} />);
    expect(screen.getByRole('radio', { name: 'AI-generated reply' })).toBeChecked();
    expect(screen.getByText('Instructions for Populr')).toBeInTheDocument();
    // The fallback disclosure is collapsed by default (no saved fallback text)…
    expect(screen.queryByLabelText('DM message')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Public comment reply')).not.toBeInTheDocument();
    const disclosure = screen.getByRole('button', { name: /Fallback messages/ });
    // …and explains each field's purpose when opened: the comment is what's
    // posted when the AI's answer can't go public (links never appear in
    // comments), the DM is what's sent when the AI can't answer at all.
    fireEvent.click(disclosure);
    expect(screen.getByLabelText('Public comment reply')).toBeInTheDocument();
    expect(screen.getByText(/links never appear in comments/)).toBeInTheDocument();
    expect(screen.getByLabelText('DM message')).toBeInTheDocument();
    expect(screen.getByText(/when the AI can’t confidently answer/)).toBeInTheDocument();
  });

  it('a saved fallback message keeps its disclosure open so existing data stays visible', () => {
    render(<RepliesStep wizard={makeWizard({ aiEnabled: true, dmBody: 'Here is the guide: {{link}}' })} />);
    expect(screen.getByLabelText('DM message')).toHaveValue('Here is the guide: {{link}}');
  });
});

describe('RepliesStep — Add media or link', () => {
  it('is collapsed by default and opens on demand', () => {
    render(<RepliesStep wizard={makeWizard({})} />);
    expect(screen.queryByLabelText('Link to send')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add media or link/ }));
    expect(screen.getByLabelText('Link to send')).toBeInTheDocument();
  });

  it('stays open when it already holds saved values', () => {
    render(<RepliesStep wizard={makeWizard({ linkUrl: 'https://example.com/guide' })} />);
    expect(screen.getByLabelText('Link to send')).toHaveValue('https://example.com/guide');
  });

  it('an invalid link shows an inline error and withholds the button-label field', () => {
    render(<RepliesStep wizard={makeWizard({ linkUrl: 'not-a-url', buttonLabel: '' })} />);
    expect(screen.getAllByText('Enter a full link starting with http:// or https://.').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Send it as a button')).not.toBeInTheDocument();
  });

  it('the button-label field appears only once a valid link exists', () => {
    render(<RepliesStep wizard={makeWizard({ linkUrl: 'https://example.com/guide' })} />);
    expect(screen.getByLabelText('Send it as a button')).toBeInTheDocument();
  });

  it('an invalid media URL left by a DM-capable type never strands a comment-only automation', () => {
    // Enter an invalid media URL under comment+DM, then switch the type to
    // comment-only: the media field disappears, so its validation must stop
    // gating Continue — an invisible error would leave nothing to correct.
    const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
    const { result } = renderHook(() => useAutomationWizard(), { wrapper });
    act(() => {
      result.current.update('type', 'comment_dm');
      result.current.update('triggerKeywords', ['guide']);
      result.current.update('mediaUrl', 'not-a-url');
    });
    expect(result.current.canProceedFromReplies).toBe(false);
    act(() => {
      result.current.update('type', 'comment_reply');
    });
    expect(result.current.canProceedFromReplies).toBe(true);
  });

  it('a media value stays visible and correctable when capabilities hide the DM fields', async () => {
    // Continue is still gated by the invalid value (the type wants a DM),
    // so the field must not vanish with it — the error has to be fixable.
    mockFetchCapabilities.mockResolvedValue([caps({ supportsDMs: false })]);
    render(<RepliesStep wizard={makeWizard({ type: 'comment_dm', mediaUrl: 'not-a-url' })} />);
    await waitFor(() => expect(screen.queryByLabelText('DM message')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Media in the DM')).toBeInTheDocument();
    expect(screen.getAllByText('Enter a full link starting with http:// or https://.').length).toBeGreaterThan(0);
  });
});

describe('RepliesStep — Test reply drawer', () => {
  it('replaces the permanent column: no tester until the action opens the drawer', () => {
    render(<RepliesStep wizard={makeWizard({ dmBody: 'Sending the guide!' })} />);
    expect(screen.queryByText('Test chat')).not.toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Test reply/ });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(screen.getByRole('dialog', { name: 'Test reply' })).toBeInTheDocument();
    expect(screen.getByText('Test chat')).toBeInTheDocument();
    expect(screen.getByText(/Nothing here is sent or saved/)).toBeInTheDocument();
  });

  it('stays unavailable until trigger and reply content exist', () => {
    const { rerender } = render(<RepliesStep wizard={makeWizard({ triggerKeywords: [], dmBody: 'x' })} />);
    expect(screen.getByRole('button', { name: /Test reply/ })).toBeDisabled();
    rerender(<RepliesStep wizard={makeWizard({ triggerKeywords: ['guide'], dmBody: '', commentReplyBody: '' })} />);
    expect(screen.getByRole('button', { name: /Test reply/ })).toBeDisabled();
    rerender(<RepliesStep wizard={makeWizard({ triggerKeywords: ['guide'], aiEnabled: true, aiInstructions: 'Answer questions about the guide.' })} />);
    expect(screen.getByRole('button', { name: /Test reply/ })).toBeEnabled();
  });
});
