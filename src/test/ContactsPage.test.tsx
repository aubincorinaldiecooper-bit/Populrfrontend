import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContactsPage from '../pages/ContactsPage';
import type { ContactRecord } from '../lib/api';

/* Regression coverage for PR review: fetchContacts was called with a fixed
 * limit:50 and no pagination, so any workspace with more than 50 contacts
 * permanently lost access to the rest even though `total` was displayed.
 * ContactsPage now mirrors OpportunitiesPage's Load more pattern — this
 * proves a second page is actually fetchable and renders. */

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

// 60 total — one more page than the page size, so "Load more" must appear.
const allContacts: ContactRecord[] = Array.from({ length: 60 }, (_, i) => makeContact(i));

const mockFetchContacts = vi.fn(async (filter: { limit?: number; offset?: number } = {}) => {
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 50;
  return { contacts: allContacts.slice(offset, offset + limit), total: allContacts.length, stages: [] };
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
  it('fetches and renders the remaining contacts via Load more', async () => {
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });
    const user = userEvent.setup();

    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByText('Showing 50 of 60')).toBeInTheDocument());
    expect(screen.getByText('@user0')).toBeInTheDocument();
    expect(screen.queryByText('@user59')).not.toBeInTheDocument();

    await user.click(screen.getByText('Load more'));

    // Once everything is loaded (50 + 10 = total 60), the Load more footer
    // is expected to disappear entirely — there's nothing left to page in.
    await waitFor(() => expect(screen.getByText('@user59')).toBeInTheDocument());
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Showing \d+ of \d+$/)).not.toBeInTheDocument();

    expect(mockFetchContacts).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 50, limit: 50 })
    );
  });
});
