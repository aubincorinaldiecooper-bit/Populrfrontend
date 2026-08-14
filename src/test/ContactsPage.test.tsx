import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
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

const mockFetchContacts = vi.fn(
  async (filter: { limit?: number; offset?: number; flowId?: string } = {}) => {
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 20;
    // The audience filter narrows to the two people that automation reached,
    // and the response says which automation, so the page can name it.
    const pool = filter.flowId ? allContacts.slice(0, 2) : allContacts;
    return {
      contacts: pool.slice(offset, offset + limit),
      total: pool.length,
      stages: [],
      allTags: ['pricing', 'vip'],
      automation: filter.flowId ? { id: filter.flowId, name: 'Menu comments' } : null,
    };
  },
);

const mockUseApp = vi.fn();

vi.mock('../context/AppContext', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchContacts: (filter: { limit?: number; offset?: number; flowId?: string }) =>
      mockFetchContacts(filter),
  };
});

describe('ContactsPage — pagination beyond the first page', () => {
  it('advances via Next to fetch and render the remaining contacts', async () => {
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });
    const user = userEvent.setup();

    render(<MemoryRouter><ContactsPage /></MemoryRouter>);

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
    render(<MemoryRouter><ContactsPage /></MemoryRouter>);

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
    render(<MemoryRouter><ContactsPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('@user0')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Recently active/ }));
    await waitFor(() => expect(mockFetchContacts).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'recent' })
    ));
  });

  it('the "Needs reply" tab filters by the needs_reply FLAG, not the stage column', async () => {
    // A warm/hot contact flagged for reply keeps its stage, so a
    // stage=needs_reply query would hide it. The tab must use the same flag
    // the "Waiting on you" urgency chip uses.
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });
    const user = userEvent.setup();
    render(<MemoryRouter><ContactsPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('@user0')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Needs reply' }));
    await waitFor(() => expect(mockFetchContacts).toHaveBeenLastCalledWith(
      expect.objectContaining({ needsReply: true, stage: undefined, offset: 0 })
    ));
  });

  it('workspace tags render as chips; picking one filters, picking it again clears', async () => {
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });
    const user = userEvent.setup();
    render(<MemoryRouter><ContactsPage /></MemoryRouter>);

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

/* The audience an automation built.
 *
 * Clicking "143 people" on an automation lands here. The filter lives in the
 * URL rather than in state, so this view is a place: it survives a reload, it
 * can be sent to someone, and it has to say why these people — a filtered list
 * with no account of itself is just a list that looks wrong.
 */
describe('ContactsPage — filtered to one automation', () => {
  it('asks for only that automation\'s audience, and names it', async () => {
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });

    render(
      <MemoryRouter initialEntries={['/contacts?automation=f1']}>
        <ContactsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mockFetchContacts).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: 'f1' })));
    expect(await screen.findByText('Menu comments')).toBeInTheDocument();
    expect(await screen.findByText('User 0')).toBeInTheDocument();
    // Everyone else this workspace has is still out there; this view is two
    // people because the automation reached two, not because it's page one.
    expect(screen.queryByText('User 5')).not.toBeInTheDocument();
  });

  it('is as easy to leave as it was to arrive at', async () => {
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/contacts?automation=f1']}>
        <ContactsPage />
      </MemoryRouter>,
    );
    await screen.findByText('Menu comments');

    await user.click(screen.getByLabelText('Show all contacts'));

    await waitFor(() => expect(mockFetchContacts).toHaveBeenLastCalledWith(
      expect.objectContaining({ flowId: undefined })));
    expect(await screen.findByText('User 19')).toBeInTheDocument();
  });

  it('shows no audience banner when nothing is filtered', async () => {
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });

    render(<MemoryRouter><ContactsPage /></MemoryRouter>);

    await screen.findByText('User 0');
    expect(screen.queryByLabelText('Show all contacts')).not.toBeInTheDocument();
  });
});
