import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InboxPage from '../pages/InboxPage';
import type { InboxItem } from '../lib/api';

/* The Inbox closes the holding-reply loop: an uncovered question gets a warm
 * automatic acknowledgment, lands here with the reason visible, and the
 * creator answers with one tap — the AI's parked draft via the backend's
 * useSuggested path — or writes their own. The backend queue has existed
 * (and been workspace-scoped) all along; this page is its first full
 * surface, replacing a "not available yet" stub. */

function item(overrides: Partial<InboxItem>): InboxItem {
  return {
    id: 'i1', contact_id: 'c1', account_id: 'acc1', platform: 'instagram',
    channel: 'dm', status: 'open', needs_reply: true,
    needs_reply_reason: 'ai_handoff', automation_status: 'replied',
    suggested_reply: null, ai_intent: null, ai_confidence: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    message_text: 'do you ship to Canada?', message_direction: 'inbound',
    contact_handle: 'curious_fan', contact_name: 'Curious Fan',
    lead_score: 10, stage: 'interested', post_caption: null, automation_name: 'Guide automation',
    ...overrides,
  };
}

const mockFetchInbox = vi.fn();
const mockSendInboxReply = vi.fn();
const mockSetInboxNeedsReply = vi.fn();
const mockShowToast = vi.fn();

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ showToast: mockShowToast }),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchInbox: (f: unknown) => mockFetchInbox(f),
    sendInboxReply: (id: string, input: unknown) => mockSendInboxReply(id, input),
    setInboxNeedsReply: (id: string, v: boolean) => mockSetInboxNeedsReply(id, v),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InboxPage — the holding-reply loop, closed', () => {
  it('shows the conversation with why it needs the creator', async () => {
    mockFetchInbox.mockResolvedValue({ count: 1, items: [item({})] });
    render(<InboxPage />);
    await waitFor(() => expect(screen.getByText('@curious_fan')).toBeInTheDocument());
    expect(screen.getByText(/do you ship to Canada\?/)).toBeInTheDocument();
    expect(screen.getByText('AI asked for you')).toBeInTheDocument();
  });

  it('sends the AI draft with one tap via the backend useSuggested path', async () => {
    mockFetchInbox.mockResolvedValue({
      count: 1,
      items: [item({ suggested_reply: 'We ship worldwide — details here soon!' })],
    });
    mockSendInboxReply.mockResolvedValue({ sentText: 'We ship worldwide — details here soon!', channel: 'dm' });
    const user = userEvent.setup();
    render(<InboxPage />);

    await waitFor(() => expect(screen.getByText('We ship worldwide — details here soon!')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Send suggested reply/ }));

    expect(mockSendInboxReply).toHaveBeenCalledWith('i1', { useSuggested: true });
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Reply sent on DM.', 'success'));
  });

  it('Edit & send prefills the composer with the AI draft and sends the edited text', async () => {
    mockFetchInbox.mockResolvedValue({
      count: 1,
      items: [item({ suggested_reply: 'Draft text' })],
    });
    mockSendInboxReply.mockResolvedValue({ sentText: 'Edited text', channel: 'dm' });
    const user = userEvent.setup();
    render(<InboxPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Edit & send/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Edit & send/ }));
    const box = screen.getByRole('textbox', { name: /Reply to @curious_fan/ });
    expect(box).toHaveValue('Draft text');
    await user.clear(box);
    await user.type(box, 'Edited text');
    await user.click(screen.getByRole('button', { name: /^Send$/ }));

    expect(mockSendInboxReply).toHaveBeenCalledWith('i1', { text: 'Edited text' });
  });

  it('Mark handled resolves without replying', async () => {
    mockFetchInbox.mockResolvedValue({ count: 1, items: [item({})] });
    mockSetInboxNeedsReply.mockResolvedValue({ id: 'i1', needsReply: false });
    const user = userEvent.setup();
    render(<InboxPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Mark handled/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Mark handled/ }));
    expect(mockSetInboxNeedsReply).toHaveBeenCalledWith('i1', false);
  });

  it('an empty needs-you queue says so honestly', async () => {
    mockFetchInbox.mockResolvedValue({ count: 0, items: [] });
    render(<InboxPage />);
    await waitFor(() => expect(screen.getByText(/all caught up/i)).toBeInTheDocument());
  });

  it('a full page offers Load more, and clicking it fetches the next offset', async () => {
    const fullPage = Array.from({ length: 30 }, (_, i) => item({ id: `p1_${i}`, contact_handle: `fan_${i}` }));
    mockFetchInbox
      .mockResolvedValueOnce({ count: 30, items: fullPage })
      .mockResolvedValueOnce({ count: 1, items: [item({ id: 'p2_0', contact_handle: 'page_two_fan' })] });
    const user = userEvent.setup();
    render(<InboxPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Load more/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Load more/ }));

    expect(mockFetchInbox).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 30 }));
    await waitFor(() => expect(screen.getByText('@page_two_fan')).toBeInTheDocument());
    // The first page is still there — appended, not replaced.
    expect(screen.getByText('@fan_0')).toBeInTheDocument();
    // A short second page means the well is dry: no further Load more.
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });

  it('a short page never offers Load more', async () => {
    mockFetchInbox.mockResolvedValue({ count: 1, items: [item({})] });
    render(<InboxPage />);
    await waitFor(() => expect(screen.getByText('@curious_fan')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });

  it('a stale response from the previous tab never overwrites the current one', async () => {
    let resolveFirst!: (v: { count: number; items: InboxItem[] }) => void;
    mockFetchInbox
      // Needs-you fetch: deliberately left hanging while the user moves on.
      .mockImplementationOnce(() => new Promise(r => { resolveFirst = r; }))
      // All-conversations fetch: resolves immediately.
      .mockResolvedValueOnce({
        count: 1,
        items: [item({ id: 'all1', contact_handle: 'all_tab_fan', needs_reply: false, needs_reply_reason: null })],
      });
    const user = userEvent.setup();
    render(<InboxPage />);

    await user.click(screen.getByRole('button', { name: /All conversations/ }));
    await waitFor(() => expect(screen.getByText('@all_tab_fan')).toBeInTheDocument());

    // The slow needs-you response lands last — and must be ignored.
    resolveFirst({ count: 1, items: [item({ id: 'stale1', contact_handle: 'stale_fan' })] });
    await waitFor(() => expect(screen.queryByText('@stale_fan')).not.toBeInTheDocument());
    expect(screen.getByText('@all_tab_fan')).toBeInTheDocument();
  });
});
