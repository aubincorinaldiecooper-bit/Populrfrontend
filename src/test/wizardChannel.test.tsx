import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import CreateStep from '../components/automation-wizard/CreateStep';
import { typeRestriction, useAutomationWizard } from '../components/automation-wizard/useAutomationWizard';
import type { PlatformCapabilities, Post } from '../lib/api';

/* The channel-aware wizard: automations run on whichever connected account
 * the user picks — any platform, not Instagram by definition — with the
 * steps mapped to that platform's real privileges:
 *
 *  - the account selector lists every connected account, labeled by platform;
 *  - the automation platform is derived from the account (buildInput sends
 *    the account's platform; the backend rejects a disagreeing pair);
 *  - type cards are gated by the capability matrix (X can't DM commenters,
 *    LinkedIn has no DM automation, TikTok/YouTube get an honest
 *    publishing/analytics-only state instead of three dead cards);
 *  - switching accounts clears the selected post — a post belongs to exactly
 *    one account (the cross-account bleed fix), so it can't ride along. */

const mockFetchCapabilities = vi.fn();
const mockCreateAutomation = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchCapabilities: (...args: unknown[]) => mockFetchCapabilities(...args),
    createAutomation: (...args: unknown[]) => mockCreateAutomation(...args),
  };
});

const accounts = [
  { id: 'acc_ig', platform: 'instagram', username: 'main_ig', display_name: null, status: 'connected', is_connected: true },
  { id: 'acc_x', platform: 'twitter', username: 'brand_x', display_name: null, status: 'connected', is_connected: true },
  { id: 'acc_li', platform: 'linkedin', username: 'company', display_name: null, status: 'connected', is_connected: true },
  { id: 'acc_tt', platform: 'tiktok', username: 'clips', display_name: null, status: 'connected', is_connected: true },
];

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    accounts,
    accountsLoading: false,
    accountsError: null,
    refreshAccounts: vi.fn(),
    showToast: vi.fn(),
  }),
}));

function caps(platform: string, overrides: Partial<PlatformCapabilities>): PlatformCapabilities {
  return {
    platform, supportsComments: true, supportsCommentReplies: true,
    supportsCommentToDM: true, supportsDMs: true, supportsDMImages: true, supportsDMVideo: true,
    supportsButtons: true,
    readiness: 'Full automation', caveat: '', supportedMediaTypes: ['image', 'video'],
    maxCaptionLength: 2200, mediaRequired: true, maxCarouselItems: 10, maxImageSizeMb: 8,
    maxVideoSizeMb: 100, maxVideoDurationSeconds: 90, ...overrides,
  };
}

// Mirrors the backend's PLATFORM_CAPABILITIES for the platforms under test.
const MATRIX: PlatformCapabilities[] = [
  caps('instagram', {}),
  caps('twitter', { supportsCommentToDM: false, supportsDMVideo: false, supportsButtons: false }),
  caps('linkedin', {
    supportsCommentToDM: false, supportsDMs: false, supportsDMImages: false,
    supportsDMVideo: false, supportsButtons: false, readiness: 'Comment replies',
  }),
  caps('tiktok', {
    supportsComments: false, supportsCommentReplies: false, supportsCommentToDM: false,
    supportsDMs: false, supportsDMImages: false, supportsDMVideo: false, supportsButtons: false,
    readiness: 'Publishing + Analytics',
    caveat: "TikTok is Publishing + Analytics for now. Comment and DM automation isn't available through the API yet.",
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchCapabilities.mockResolvedValue(MATRIX);
  mockCreateAutomation.mockResolvedValue({ id: 'auto_1', active: false });
  localStorage.clear();
});

const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe('typeRestriction — the capability matrix mapped to the three cards', () => {
  const by = (p: string) => MATRIX.find(c => c.platform === p)!;

  it('Instagram runs all three automation types', () => {
    expect(typeRestriction('comment_dm', by('instagram'))).toBeNull();
    expect(typeRestriction('comment_reply', by('instagram'))).toBeNull();
    expect(typeRestriction('dm_only', by('instagram'))).toBeNull();
  });

  it("X keeps comment replies and DM flows but can't DM someone for commenting", () => {
    expect(typeRestriction('comment_dm', by('twitter'))).toMatch(/doesn't allow DMing someone just because they commented/);
    expect(typeRestriction('comment_reply', by('twitter'))).toBeNull();
    expect(typeRestriction('dm_only', by('twitter'))).toBeNull();
  });

  it('LinkedIn is comment replies only — every DM-bearing type is blocked', () => {
    expect(typeRestriction('comment_dm', by('linkedin'))).toMatch(/doesn't support automated DMs/);
    expect(typeRestriction('comment_reply', by('linkedin'))).toBeNull();
    expect(typeRestriction('dm_only', by('linkedin'))).toMatch(/doesn't support automated DMs/);
  });

  it('TikTok blocks all three (publishing/analytics only)', () => {
    expect(typeRestriction('comment_dm', by('tiktok'))).not.toBeNull();
    expect(typeRestriction('comment_reply', by('tiktok'))).not.toBeNull();
    expect(typeRestriction('dm_only', by('tiktok'))).not.toBeNull();
  });

  it('unknown capabilities fail open — nothing is gated client-side', () => {
    expect(typeRestriction('comment_dm', null)).toBeNull();
    expect(typeRestriction('dm_only', undefined)).toBeNull();
  });
});

describe('useAutomationWizard — the platform follows the selected account', () => {
  it('switching accounts clears the selected post and re-derives the platform; re-picking the same account keeps it', async () => {
    const { result } = renderHook(() => useAutomationWizard(), { wrapper });
    await act(async () => {});   // flush the capabilities fetch
    act(() => {
      result.current.update('accountId', 'acc_ig');
      result.current.update('type', 'comment_dm');
      result.current.update('post', { id: '42', platform: 'instagram' } as unknown as Post);
    });
    expect(result.current.platform).toBe('instagram');
    expect(result.current.state.post).not.toBeNull();

    // Same account again → the post survives (no gratuitous resets).
    act(() => { result.current.update('accountId', 'acc_ig'); });
    expect(result.current.state.post).not.toBeNull();

    // A different account → the post CANNOT ride along: it belongs to the
    // account that published it (the cross-account bleed fix), and the
    // platform now follows the new account.
    act(() => { result.current.update('accountId', 'acc_x'); });
    expect(result.current.state.post).toBeNull();
    expect(result.current.platform).toBe('twitter');
    expect(result.current.state.platform).toBe('twitter');
  });

  it("save() sends the selected account's platform — not a hardcoded one", async () => {
    const { result } = renderHook(() => useAutomationWizard(), { wrapper });
    await act(async () => {});
    act(() => {
      result.current.update('name', 'X keyword DMs');
      result.current.update('type', 'dm_only');
      result.current.update('accountId', 'acc_x');
      result.current.update('triggerKeywords', ['guide']);
      result.current.update('aiEnabled', false);
      result.current.update('dmBody', 'Here you go!');
    });
    await act(async () => { await result.current.save(false); });
    expect(mockCreateAutomation).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'twitter',
      accountId: 'acc_x',
      triggerType: 'dm',
      replyChannel: 'dm',
    }));
  });

  it('a platform-blocked type stops Create from proceeding until the type fits the account', async () => {
    const { result } = renderHook(() => useAutomationWizard(), { wrapper });
    act(() => {
      result.current.update('name', 'Wrong pairing');
      result.current.update('type', 'comment_dm');
      result.current.update('accountId', 'acc_x');
    });
    // Once the matrix lands, comment→DM on X is a blocked combination.
    await waitFor(() => expect(result.current.canProceedFromCreate).toBe(false));
    act(() => { result.current.update('type', 'comment_reply'); });
    expect(result.current.canProceedFromCreate).toBe(true);
  });

  it("what the platform's DMs can't carry is neither required content nor persisted (X: media yes, buttons no)", async () => {
    const { result } = renderHook(() => useAutomationWizard(), { wrapper });
    await act(async () => {});
    act(() => {
      result.current.update('name', 'X automation');
      result.current.update('type', 'dm_only');
      result.current.update('accountId', 'acc_x');
      result.current.update('triggerKeywords', ['guide']);
      result.current.update('aiEnabled', false);
      result.current.update('dmBody', 'Here you go!');
      result.current.update('linkUrl', 'https://example.com/guide');
      result.current.update('buttonLabel', 'Get it');   // left over from an IG draft
    });
    await waitFor(() => expect(result.current.dmTakesButtons).toBe(false));
    await act(async () => { await result.current.save(false); });
    // The link still rides the DM as text; the undeliverable button doesn't.
    expect(mockCreateAutomation).toHaveBeenCalledWith(expect.objectContaining({
      linkUrl: 'https://example.com/guide',
      buttons: null,
    }));
  });

  it("media is judged by its KIND: a video on X (DM images only) blocks with the reason; an image passes and saves as responseType image", async () => {
    const { result } = renderHook(() => useAutomationWizard(), { wrapper });
    act(() => {
      result.current.update('name', 'X media');
      result.current.update('type', 'dm_only');
      result.current.update('accountId', 'acc_x');
      result.current.update('triggerKeywords', ['guide']);
      result.current.update('aiEnabled', false);
      result.current.update('mediaUrl', 'https://cdn.example.com/clip.mp4');
    });
    // Once the matrix lands: not silently dropped — visible, blocking,
    // correctable, and it suggests the kind X can deliver.
    await waitFor(() => expect(result.current.dmMediaBlockedReason).toMatch(/can't carry video/));
    expect(result.current.dmMediaBlockedReason).toMatch(/try an image instead/);
    expect(result.current.canProceedFromReplies).toBe(false);

    act(() => { result.current.update('mediaUrl', 'https://cdn.example.com/photo.jpg'); });
    expect(result.current.dmMediaBlockedReason).toBeNull();
    // The image alone is deliverable content, and persists with the
    // responseType the backend validates per platform.
    expect(result.current.canProceedFromReplies).toBe(true);
    await act(async () => { await result.current.save(false); });
    expect(mockCreateAutomation).toHaveBeenCalledWith(expect.objectContaining({
      mediaUrl: 'https://cdn.example.com/photo.jpg',
      responseType: 'image',
    }));
  });
});

describe('CreateStep — one selector across every connected platform', () => {
  function Harness() {
    const wizard = useAutomationWizard();
    return <CreateStep wizard={wizard} />;
  }

  it('lists every connected account labeled by platform', async () => {
    render(<Harness />, { wrapper });
    // Let the hook's capabilities fetch settle inside act.
    await waitFor(() => expect(mockFetchCapabilities).toHaveBeenCalled());
    const select = screen.getByLabelText('Account');
    expect(within(select).getByRole('option', { name: 'Instagram — @main_ig' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'X — @brand_x' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'LinkedIn — @company' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'TikTok — @clips' })).toBeInTheDocument();
  });

  it('an X account blocks the comment→DM card with the reason, and the card refuses selection', async () => {
    render(<Harness />, { wrapper });
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'acc_x' } });
    const card = await screen.findByRole('button', { name: /Comment keyword \+ DM/ });
    await waitFor(() => expect(card).toHaveAttribute('aria-disabled', 'true'));
    expect(screen.getByText(/doesn't allow DMing someone just because they commented/)).toBeInTheDocument();
    fireEvent.click(card);
    expect(card).toHaveAttribute('aria-pressed', 'false');
    // The types X does support still select normally.
    const replyCard = screen.getByRole('button', { name: /Comment keyword reply only/ });
    fireEvent.click(replyCard);
    expect(replyCard).toHaveAttribute('aria-pressed', 'true');
  });

  it('a TikTok account gets the honest publishing/analytics state instead of three dead cards', async () => {
    render(<Harness />, { wrapper });
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'acc_tt' } });
    expect(await screen.findByText(/TikTok automation is limited to publishing and analytics for now/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Comment keyword \+ DM/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /DM-only flow/ })).not.toBeInTheDocument();
  });
});
