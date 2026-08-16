import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import ContactsPage from '../pages/ContactsPage';
import type { ContactRecord } from '../lib/api';

/* Contacts is the directory; the person is the conversation.
 *
 * What these tests hold in place after the hierarchy simplification:
 * clicking a contact opens the conversation with them IMMEDIATELY — there is
 * no intermediate CRM profile screen, no Message button to find, and the
 * context panel (the same one the Inbox opens) is one Details click away,
 * closed by default. The directory itself stays a directory: who, how they
 * arrived, whether they're waiting, when they were last around — with the
 * stage/score columns gone from the surface while the fields live on in the
 * API and the panel.
 *
 * Plus the original pagination regression: page 2 must actually be fetchable. */

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
    // Row 0 arrived through an automation; row 1 is waiting on a reply.
    from_automation: i === 0 ? 'Culture automation' : null,
    needs_reply: i === 1,
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

const mockFetchContact = vi.fn(async (id: string) => ({
  contact: { ...makeContact(0), id },
  latestInboxItemId: 'i_9',
  sourcePost: null,
  sourceAutomation: null,
  automations: [
    { id: 'f1', name: 'Culture automation', status: 'live' as const, firstEnteredAt: '2026-08-12T10:00:00.000Z' },
  ],
  messages: [{
    id: 'm1', contact_id: id, account_id: 'acc_1', platform: 'instagram',
    channel: 'dm', direction: 'inbound', text: 'Saturday works.',
    media_url: null, external_id: null, status: 'received', in_reply_to: null,
    source_post_id: null, source_automation_id: null,
    created_at: '2026-08-14T10:00:00.000Z',
  }],
  scoreEvents: [],
  clicks: [],
  events: [],
}));

const mockSendInboxReply = vi.fn<(id: string, input: unknown) => Promise<{ sentText: string; channel: 'dm' }>>(
  async () => ({ sentText: 'x', channel: 'dm' }));

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
    fetchContact: (id: string) => mockFetchContact(id),
    sendInboxReply: (id: string, input: unknown) => mockSendInboxReply(id, input),
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

  it('the directory answers "who do I know?", not "what stage is the pipeline in?"', async () => {
    // Stage and score are real fields with a real backend — the panel still
    // edits them — but the directory no longer leads with them: no stage
    // tabs, no Stage/Score columns. From and Last active take their place.
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });
    render(<MemoryRouter><ContactsPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('@user0')).toBeInTheDocument());
    expect(screen.getByRole('columnheader', { name: 'From' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Last active' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Stage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Score' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Warm' })).not.toBeInTheDocument();

    // How they arrived, when the record says; nothing invented when it doesn't.
    expect(screen.getByText('Culture automation')).toBeInTheDocument();
    // Waiting on you: the same lime mark the Inbox list uses.
    expect(screen.getByRole('img', { name: 'Needs reply' })).toBeInTheDocument();
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

/* Clicking a person opens the conversation with them. Immediately.
 *
 * Not a CRM profile with a Message button that leads somewhere else — the
 * message history, the composer, and (one click away) the same context panel
 * the Inbox shows for the same person. The old standalone contact profile is
 * retired; these tests are the door it can't come back through. */
describe('ContactsPage — a contact opens to their conversation', () => {
  it('opens the person named in the URL straight into their conversation', async () => {
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });

    render(
      <MemoryRouter initialEntries={['/contacts?contact=c_7']}>
        <ContactsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mockFetchContact).toHaveBeenCalledWith('c_7'));
    // The conversation, not a profile: their words and a composer.
    expect(await screen.findByText('Saturday works.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Message User 0/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Contacts/ })).toBeInTheDocument();
  });

  it('clicking a row opens the conversation — no Message button hop, nothing sent', async () => {
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });
    const user = userEvent.setup();

    render(<MemoryRouter><ContactsPage /></MemoryRouter>);

    await screen.findByText('User 0');
    await user.click(screen.getByText('User 0'));

    await waitFor(() => expect(mockFetchContact).toHaveBeenCalledWith('c_0'));
    expect(await screen.findByText('Saturday works.')).toBeInTheDocument();
    // Opening someone must never send anything.
    expect(mockSendInboxReply).not.toHaveBeenCalled();
  });

  it('there is no intermediate CRM profile screen anymore', async () => {
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });

    render(
      <MemoryRouter initialEntries={['/contacts?contact=c_3']}>
        <ContactsPage />
      </MemoryRouter>,
    );

    await screen.findByText('Saturday works.');
    expect(screen.queryByText(/Lead score/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
    // And no Message link pointing at a second conversation surface — the
    // conversation is already open.
    expect(screen.queryByRole('link', { name: 'Message' })).not.toBeInTheDocument();
  });

  it('context is collapsed by default and opens on Details', async () => {
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/contacts?contact=c_4']}>
        <ContactsPage />
      </MemoryRouter>,
    );

    await screen.findByText('Saturday works.');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Details' }));
    const panel = await screen.findByRole('complementary', { name: /About User 0/ });

    // The relationship, where it now lives: acquisition, notes, and the
    // labelled external link — the retired profile's useful pieces.
    expect(within(panel).getByText('From')).toBeInTheDocument();
    expect(within(panel).getByText('Notes')).toBeInTheDocument();
    const external = within(panel).getByRole('link', { name: /View on Instagram/ });
    expect(external).toHaveAttribute('href', 'https://instagram.com/user0');
    expect(external).toHaveAttribute('rel', expect.stringContaining('noopener'));

    // Close it, and the conversation has the width again.
    await user.click(within(panel).getByRole('button', { name: 'Close contact' }));
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
  });

  it('replies from here go through the same safe send path as the Inbox', async () => {
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/contacts?contact=c_5']}>
        <ContactsPage />
      </MemoryRouter>,
    );

    const box = await screen.findByRole('textbox', { name: /Message User 0/ });
    await user.type(box, 'See you Saturday!');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    // The detail's own inbox item — the exact target the Inbox would use.
    await waitFor(() => expect(mockSendInboxReply).toHaveBeenCalledWith('i_9', { text: 'See you Saturday!' }));
  });

  it('going back lands on the directory, filters intact', async () => {
    mockUseApp.mockReturnValue({ accounts: [], showToast: vi.fn() });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/contacts?automation=f1&contact=c_1']}>
        <ContactsPage />
      </MemoryRouter>,
    );

    await screen.findByText('Saturday works.');
    await user.click(screen.getByRole('button', { name: /Contacts/ }));

    // Back to the audience view that opened them, not to an unfiltered list.
    expect(await screen.findByText('Menu comments')).toBeInTheDocument();
    await waitFor(() => expect(mockFetchContacts).toHaveBeenLastCalledWith(
      expect.objectContaining({ flowId: 'f1' })));
  });
});
