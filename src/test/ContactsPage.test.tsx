import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContactsPage from '../pages/ContactsPage';
import type { ContactRecord } from '../lib/api';

/* Regression coverage for the earlier PR review: fetchContacts was called
 * with a fixed limit:50 and no pagination, so any workspace with more than
 * 50 contacts permanently lost access to the rest even though `total` was
 * displayed. ContactsPage (the restored redesigned version, 856751c) uses a
 * Prev/Next pager with a smaller page size — a different UX from main's
 * Load-more, but the underlying invariant is the same: page 2 is actually
 * fetchable, and clicking through advances the offset. */

function makeContact(i: number): ContactRecord {
  return {
    id: `c_${i}`,
    platform: 'instagram',
    account_id: 'acc_1',
    external_user_id: `ext_${i}`,
    handle: `user${i}`,
    name: `User ${i}`,
    avatar_url: null,
    lead_score: 0,
    stage: 'cold',
    needs_reply: false,
    notes: null,
    custom_fields: {},
    source_platform: null,
    source_account_id: null,
    source_post_id: null,
    source_post_url: null,
    source_automation_id: null,
    source_funnel_id: null,
    source_type: null,
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    last_message_at: null,
    last_automation_at: null,
    tags: [],
  };
}

// 60 total — three pages at the redesigned page size (20). Enough to prove
// pagination advances past the first page.
const allContacts: ContactRecord[] = Array.from({ length: 60 }, (_, i) => makeContact(i));

const mockFetchContacts = vi.fn(async (filter: { limit?: number; offset?: number } = {}) => {
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 20;
  return {
    contacts: allContacts.slice(offset, offset + limit),
    total: allContacts.length,
    stages: [],
    allTags: ['pricing', 'vip'],
  };
});

const mockUseApp = vi.fn();

vi.mock('../context/AppContext', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchContacts: (filter: { limit?: number; offset?: number }) => mockFetchContacts(filter),
  };
});

describe('ContactsPage — pagination beyond the first page', () => {
  it('advances via Next to fetch and render the remaining contacts', async () => {
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });
    const user = userEvent.setup();

    render(<ContactsPage />);

    // First page: contacts 0-19 of 60 shown, later contacts absent.
    await waitFor(() => expect(screen.getByText('@user0')).toBeInTheDocument());
    expect(screen.getByText('Showing 1-20 of 60')).toBeInTheDocument();
    expect(screen.queryByText('@user59')).not.toBeInTheDocument();

    // Clicking Next issues a second fetch with a non-zero offset — this is
    // the invariant the original bug violated.
    await user.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('@user20')).toBeInTheDocument());
    expect(mockFetchContacts).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 20, limit: 20 })
    );

    // And once more, to prove Next keeps working past page 2 (the bug
    // manifested as "there is no next page", not "next page is empty").
    await user.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('@user59')).toBeInTheDocument());
    expect(mockFetchContacts).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 40, limit: 20 })
    );
  });
});

describe('ContactsPage — classification chips (urgency, recency, tags)', () => {
  it('"Waiting on you" toggles the needsReply filter and resets to page one', async () => {
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });
    const user = userEvent.setup();
    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByText('@user0')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Waiting on you/ }));
    await waitFor(() => expect(mockFetchContacts).toHaveBeenLastCalledWith(
      expect.objectContaining({ needsReply: true, offset: 0 })
    ));

    // Toggling off drops the filter entirely — not needsReply: false, which
    // would EXCLUDE waiting contacts.
    await user.click(screen.getByRole('button', { name: /Waiting on you/ }));
    await waitFor(() => expect(mockFetchContacts).toHaveBeenLastCalledWith(
      expect.objectContaining({ needsReply: undefined })
    ));
  });

  it('"Recently active" requests the recency sort', async () => {
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });
    const user = userEvent.setup();
    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByText('@user0')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Recently active/ }));
    await waitFor(() => expect(mockFetchContacts).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'recent' })
    ));
  });

  it('workspace tags render as chips; picking one filters, picking it again clears', async () => {
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });
    const user = userEvent.setup();
    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /pricing/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /pricing/ }));
    await waitFor(() => expect(mockFetchContacts).toHaveBeenLastCalledWith(
      expect.objectContaining({ tag: 'pricing', offset: 0 })
    ));

    await user.click(screen.getByRole('button', { name: /pricing/ }));
    await waitFor(() => expect(mockFetchContacts).toHaveBeenLastCalledWith(
      expect.objectContaining({ tag: undefined })
    ));
  });
});
