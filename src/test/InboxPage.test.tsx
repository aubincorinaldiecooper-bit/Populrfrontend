import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import InboxPage from '../pages/InboxPage';
import type { Conversation, ContactDetail, ContactRecord, ContactMessage } from '../lib/api';

/* The Inbox is a messaging product, not a work queue.
 *
 * What these tests hold in place is the part that is easy to regress back
 * into a CRM: a conversation is a person, opening one is a URL you can link
 * to and reload, the person's identity is one click from the conversation —
 * and that click goes to Populr's Contact, never straight out to Instagram.
 * The old queue (needs-reply reasons, suggested drafts, Mark handled, Load
 * more) is gone deliberately; the drawer in the top bar is where a one-line
 * reply without leaving your work still lives. */

function contactRecord(over: Partial<ContactRecord> = {}): ContactRecord {
  return {
    id: 'c1', platform: 'instagram', account_id: 'acc1', external_user_id: 'ig_1',
    handle: 'curious_fan', name: 'Curious Fan', avatar_url: null,
    lead_score: 10, stage: 'interested', needs_reply: true, notes: null,
    custom_fields: {}, source_platform: null, source_account_id: null,
    source_post_id: null, source_post_url: null, source_automation_id: null,
    source_funnel_id: null, source_type: null,
    first_seen: '2026-08-01T10:00:00.000Z', last_seen: '2026-08-14T10:00:00.000Z',
    last_message_at: '2026-08-14T10:00:00.000Z', tags: [], created_at: '2026-08-01T10:00:00.000Z',
    ...over,
  } as ContactRecord;
}

function message(over: Partial<ContactMessage> = {}): ContactMessage {
  return {
    id: 'm1', contact_id: 'c1', account_id: 'acc1', platform: 'instagram',
    channel: 'dm', direction: 'inbound', text: 'do you ship to Canada?',
    media_url: null, external_id: null, status: 'received', in_reply_to: null,
    source_post_id: null, source_automation_id: null,
    created_at: '2026-08-14T10:00:00.000Z',
    ...over,
  } as ContactMessage;
}

function conversation(over: Partial<Conversation> = {}): Conversation {
  return {
    contactId: 'c1', handle: 'curious_fan', name: 'Curious Fan', avatarUrl: null,
    platform: 'instagram',
    lastMessage: {
      text: 'do you ship to Canada?', direction: 'inbound', channel: 'dm',
      at: '2026-08-14T10:00:00.000Z',
    },
    waiting: 1, latestInboxItemId: 'i1',
    ...over,
  };
}

function detail(over: Partial<ContactDetail> = {}): ContactDetail {
  return {
    contact: contactRecord(),
    sourcePost: null, sourceAutomation: null, automations: [],
    messages: [message()], scoreEvents: [], clicks: [], events: [],
    ...over,
  };
}

const mockFetchConversations = vi.fn();
const mockFetchContact = vi.fn();
const mockSendInboxReply = vi.fn();
const mockShowToast = vi.fn();

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ showToast: mockShowToast }),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchConversations: (f: unknown) => mockFetchConversations(f),
    fetchContact: (id: string) => mockFetchContact(id),
    sendInboxReply: (id: string, input: unknown) => mockSendInboxReply(id, input),
  };
});

/** Render at a URL, with a Contacts route so "View full profile" can land. */
function renderInbox(url = '/inbox') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/contacts" element={<div>Contacts page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchConversations.mockResolvedValue({ conversations: [conversation()] });
  mockFetchContact.mockResolvedValue(detail());
});

describe('InboxPage — conversations, not a queue', () => {
  it('lists people with what was last said and marks the ones waiting', async () => {
    renderInbox();

    await waitFor(() => expect(screen.getByText('Curious Fan')).toBeInTheDocument());
    expect(screen.getByText(/do you ship to Canada\?/)).toBeInTheDocument();
    // Waiting is weight and a dot, not a reason code or a stage.
    expect(screen.getByLabelText('1 waiting')).toBeInTheDocument();
    expect(screen.queryByText(/AI asked for you/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Lead score/i)).not.toBeInTheDocument();
  });

  it('marks your own last message as yours', async () => {
    mockFetchConversations.mockResolvedValue({
      conversations: [conversation({
        lastMessage: {
          text: 'Sent you the link!', direction: 'outbound', channel: 'dm',
          at: '2026-08-14T10:00:00.000Z',
        },
      })],
    });
    renderInbox();

    await waitFor(() => expect(screen.getByText('You:')).toBeInTheDocument());
  });

  it('opening a conversation puts the person in the URL and loads their thread', async () => {
    const user = userEvent.setup();
    renderInbox();

    await waitFor(() => expect(screen.getByText('Curious Fan')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Curious Fan/ }));

    await waitFor(() => expect(mockFetchContact).toHaveBeenCalledWith('c1'));
    // The composer is addressed to them — the thread is open, not just fetched.
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /Message Curious Fan/ })).toBeInTheDocument());
  });

  it('a conversation in the URL opens on arrival, so a link to it works', async () => {
    renderInbox('/inbox?c=c1');

    await waitFor(() => expect(mockFetchContact).toHaveBeenCalledWith('c1'));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /Message Curious Fan/ })).toBeInTheDocument());
  });

  it('sends through the thread\'s inbox item and clears the composer', async () => {
    mockSendInboxReply.mockResolvedValue({ sentText: 'We do!', channel: 'dm' });
    const user = userEvent.setup();
    renderInbox('/inbox?c=c1');

    const box = await screen.findByRole('textbox', { name: /Message Curious Fan/ });
    await user.type(box, 'We do!');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(mockSendInboxReply).toHaveBeenCalledWith('i1', { text: 'We do!' });
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Reply sent on DM.', 'success'));
    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('says so rather than offering a composer that cannot send', async () => {
    mockFetchConversations.mockResolvedValue({
      conversations: [conversation({ latestInboxItemId: null })],
    });
    renderInbox('/inbox?c=c1');

    await waitFor(() =>
      expect(screen.getByText(/nothing to reply to here yet/i)).toBeInTheDocument());
    expect(screen.queryByRole('textbox', { name: /Message/ })).not.toBeInTheDocument();
  });

  it('shows delivery only where the provider actually reported it', async () => {
    mockFetchContact.mockResolvedValue(detail({
      messages: [
        message({ id: 'm1', direction: 'outbound', text: 'handed over', status: 'sent' }),
        message({ id: 'm2', direction: 'outbound', text: 'arrived', status: 'delivered' }),
      ],
    }));
    renderInbox('/inbox?c=c1');

    await waitFor(() => expect(screen.getByText('arrived')).toBeInTheDocument());
    expect(screen.getByText(/Delivered/)).toBeInTheDocument();
    // 'sent' is our own record of handing it over and says nothing about
    // arrival, so it claims nothing.
    expect(screen.queryByText(/Seen/)).not.toBeInTheDocument();
  });

  it('names the automation that spoke, without exposing the run behind it', async () => {
    mockFetchContact.mockResolvedValue(detail({
      automations: [{ id: 'f1', name: 'Guide automation', status: 'live', firstEnteredAt: '2026-08-01T10:00:00.000Z' }],
      messages: [message({
        id: 'm2', direction: 'outbound', text: 'Here is the guide!', source_automation_id: 'f1',
      })],
    }));
    renderInbox('/inbox?c=c1');

    await waitFor(() => expect(screen.getByText(/Populr · Guide automation/)).toBeInTheDocument());
  });
});

describe('InboxPage — the conversation is one click from the person', () => {
  it('opens Populr\'s own contact, not their Instagram', async () => {
    const user = userEvent.setup();
    renderInbox('/inbox?c=c1');

    const identity = await screen.findByRole('button', { name: /About Curious Fan/ });
    // The identity block is not an outbound link.
    expect(identity.tagName).toBe('BUTTON');
    await user.click(identity);

    const panel = await screen.findByRole('complementary', { name: /About Curious Fan/ });
    expect(within(panel).getByText('View full profile')).toBeInTheDocument();
  });

  it('offers the external profile as a labelled second action', async () => {
    const user = userEvent.setup();
    renderInbox('/inbox?c=c1');

    await user.click(await screen.findByRole('button', { name: /About Curious Fan/ }));
    const panel = await screen.findByRole('complementary', { name: /About Curious Fan/ });

    const external = within(panel).getByRole('link', { name: /View on Instagram/ });
    expect(external).toHaveAttribute('href', 'https://instagram.com/curious_fan');
    expect(external).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('links the full profile to the existing Contacts route, not a second one', async () => {
    const user = userEvent.setup();
    renderInbox('/inbox?c=c1');

    await user.click(await screen.findByRole('button', { name: /About Curious Fan/ }));
    const panel = await screen.findByRole('complementary', { name: /About Curious Fan/ });

    expect(within(panel).getByRole('link', { name: 'View full profile' }))
      .toHaveAttribute('href', '/contacts?contact=c1');
  });

  it('the panel closes as easily as it opened — it is never permanent', async () => {
    const user = userEvent.setup();
    renderInbox('/inbox?c=c1');

    // Not there until asked for.
    await screen.findByRole('button', { name: /About Curious Fan/ });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /About Curious Fan/ }));
    await screen.findByRole('complementary', { name: /About Curious Fan/ });

    await user.click(screen.getByRole('button', { name: 'Close contact' }));
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
  });

  it('shows how they were acquired without leading with lead score or stage', async () => {
    const user = userEvent.setup();
    mockFetchContact.mockResolvedValue(detail({
      automations: [{ id: 'f1', name: 'Guide automation', status: 'live', firstEnteredAt: '2026-08-01T10:00:00.000Z' }],
    }));
    renderInbox('/inbox?c=c1');

    await user.click(await screen.findByRole('button', { name: /About Curious Fan/ }));
    const panel = await screen.findByRole('complementary', { name: /About Curious Fan/ });

    expect(within(panel).getByText('From')).toBeInTheDocument();
    expect(within(panel).getAllByRole('link', { name: 'Guide automation' })[0])
      .toHaveAttribute('href', '/automations/f1');
    expect(within(panel).queryByText(/Lead score/i)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/Stage/i)).not.toBeInTheDocument();
  });
});

describe('InboxPage — honest states', () => {
  it('an empty inbox explains where conversations come from', async () => {
    mockFetchConversations.mockResolvedValue({ conversations: [] });
    renderInbox();

    await waitFor(() => expect(screen.getByText('No conversations yet')).toBeInTheDocument());
  });

  it('a failed load offers a retry that refetches', async () => {
    mockFetchConversations.mockRejectedValueOnce(new Error('Network down'));
    const user = userEvent.setup();
    renderInbox();

    await waitFor(() => expect(screen.getByText('Network down')).toBeInTheDocument());
    mockFetchConversations.mockResolvedValue({ conversations: [conversation()] });
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByText('Curious Fan')).toBeInTheDocument());
  });

  it('a stale search response never overwrites a newer one', async () => {
    let resolveSlow!: (v: { conversations: Conversation[] }) => void;
    mockFetchConversations
      // The initial load, deliberately left hanging while the creator types.
      .mockImplementationOnce(() => new Promise(r => { resolveSlow = r; }))
      .mockResolvedValue({
        conversations: [conversation({ contactId: 'c2', name: 'Newer Result' })],
      });
    const user = userEvent.setup();
    renderInbox();

    await user.type(screen.getByRole('searchbox', { name: /Search conversations/ }), 'new');
    await waitFor(() => expect(screen.getByText('Newer Result')).toBeInTheDocument());

    resolveSlow({ conversations: [conversation({ contactId: 'c9', name: 'Stale Result' })] });
    await waitFor(() => expect(screen.queryByText('Stale Result')).not.toBeInTheDocument());
    expect(screen.getByText('Newer Result')).toBeInTheDocument();
  });
});
