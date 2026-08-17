import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
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
    // The reply target rides on the detail itself now — one fetch answers
    // who, what was said, and how to reply, whichever page is asking.
    latestInboxItemId: 'i1',
    sourcePost: null, sourceAutomation: null, automations: [],
    messages: [message()], scoreEvents: [], clicks: [], events: [],
    ...over,
  };
}

const mockFetchConversations = vi.fn();
const mockFetchContact = vi.fn();
const mockSendInboxReply = vi.fn();
const mockUpdateContact = vi.fn();
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
    updateContact: (id: string, patch: unknown) => mockUpdateContact(id, patch),
  };
});

/** Render at a URL. The /contacts route exists to catch any link that would
 *  navigate away — the panel must never need one. */
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
    mockFetchContact.mockResolvedValue(detail({ latestInboxItemId: null }));
    renderInbox('/inbox?c=c1');

    await waitFor(() =>
      expect(screen.getByText(/nothing to reply to here yet/i)).toBeInTheDocument());
    expect(screen.queryByRole('textbox', { name: /Message/ })).not.toBeInTheDocument();
  });

  it('never lands a sent thread on top of a conversation opened since', async () => {
    // The creator replies to Curious Fan, then clicks Other Person while the
    // send is still in flight. If the post-send reload wins, Curious Fan's
    // messages sit under Other Person's reply target — and the next reply
    // goes to the wrong person.
    const other = contactRecord({ id: 'c2', handle: 'other_person', name: 'Other Person' });
    mockFetchConversations.mockResolvedValue({
      conversations: [
        conversation(),
        conversation({ contactId: 'c2', handle: 'other_person', name: 'Other Person', latestInboxItemId: 'i2' }),
      ],
    });
    // Distinct from the list previews, so the assertions can only be matching
    // the open thread.
    mockFetchContact.mockImplementation(async (id: string) =>
      id === 'c2'
        ? detail({ contact: other, latestInboxItemId: 'i2', messages: [message({ id: 'm9', contact_id: 'c2', text: "other person's message" })] })
        : detail({ messages: [message({ id: 'm8', text: "curious fan's message" })] }));

    let finishSend!: (v: { sentText: string; channel: string }) => void;
    mockSendInboxReply.mockImplementation(() => new Promise(r => { finishSend = r; }));

    const user = userEvent.setup();
    renderInbox('/inbox?c=c1');

    const box = await screen.findByRole('textbox', { name: /Message Curious Fan/ });
    await user.type(box, 'hello');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    // Mid-send, move to someone else.
    await user.click(screen.getByRole('button', { name: /Other Person/ }));
    await screen.findByText("other person's message");

    finishSend({ sentText: 'hello', channel: 'dm' });

    // The open conversation stays the one that is open.
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Reply sent on DM.', 'success'));
    expect(screen.getByText("other person's message")).toBeInTheDocument();
    expect(screen.queryByText("curious fan's message")).not.toBeInTheDocument();
  });

  it('keeps an open conversation answerable when a search filters it out', async () => {
    mockSendInboxReply.mockResolvedValue({ sentText: 'still here', channel: 'dm' });
    const user = userEvent.setup();
    renderInbox('/inbox?c=c1');

    await screen.findByRole('textbox', { name: /Message Curious Fan/ });

    // A search that matches nobody empties the list — but the person you are
    // already talking to is still there, and still replyable.
    mockFetchConversations.mockResolvedValue({ conversations: [] });
    await user.type(screen.getByRole('searchbox', { name: /Search conversations/ }), 'zzz');
    await waitFor(() => expect(screen.getByText('No conversations match that search')).toBeInTheDocument());

    const box = screen.getByRole('textbox', { name: /Message Curious Fan/ });
    await user.type(box, 'still here');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(mockSendInboxReply).toHaveBeenCalledWith('i1', { text: 'still here' });
  });

  it('lets an IME accept a candidate with Enter instead of sending', async () => {
    const user = userEvent.setup();
    renderInbox('/inbox?c=c1');

    const box = await screen.findByRole('textbox', { name: /Message Curious Fan/ });
    await user.type(box, 'にほん');
    // Enter while composing accepts the candidate; it must not send.
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
    expect(mockSendInboxReply).not.toHaveBeenCalled();

    // The same key once composition has ended does send.
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(mockSendInboxReply).toHaveBeenCalledWith('i1', { text: 'にほん' }));
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

    // Who they are opens IN PLACE, beside the conversation — no navigation.
    const panel = await screen.findByRole('complementary', { name: /About Curious Fan/ });
    expect(within(panel).getByText('Notes')).toBeInTheDocument();
    expect(screen.queryByText('Contacts page')).not.toBeInTheDocument();
  });

  it('the labelled Details control opens the same panel', async () => {
    const user = userEvent.setup();
    renderInbox('/inbox?c=c1');

    await screen.findByRole('button', { name: /About Curious Fan/ });
    await user.click(screen.getByRole('button', { name: 'Details' }));

    expect(await screen.findByRole('complementary', { name: /About Curious Fan/ }))
      .toBeInTheDocument();
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

  it('the panel IS the profile — nothing links away to a second one', async () => {
    // There used to be a standalone CRM-style contact page, and this panel
    // linked to it. One person, one representation: the profile's useful
    // pieces live here now, editable in place.
    const user = userEvent.setup();
    renderInbox('/inbox?c=c1');

    await user.click(await screen.findByRole('button', { name: /About Curious Fan/ }));
    const panel = await screen.findByRole('complementary', { name: /About Curious Fan/ });

    expect(within(panel).queryByRole('link', { name: /full profile/i })).not.toBeInTheDocument();

    // Notes are the CRM page's most human survivor, editable right here.
    await user.click(within(panel).getByRole('button', { name: /Add note/ }));
    expect(within(panel).getByRole('textbox', { name: 'Note' })).toBeInTheDocument();
    // Stage and tags survive too — real fields, still editable, just last.
    expect(within(panel).getByRole('combobox', { name: 'Stage' })).toBeInTheDocument();
    expect(within(panel).getByRole('textbox', { name: 'Add tag' })).toBeInTheDocument();
  });

  it('does not repeat what the open conversation already shows', async () => {
    // The old panel counted messages ("Conversation — 3 messages") beside a
    // conversation you could see, and listed the acquisition automation twice.
    const user = userEvent.setup();
    mockFetchContact.mockResolvedValue(detail({
      automations: [{ id: 'f1', name: 'Guide automation', status: 'live', firstEnteredAt: '2026-08-01T10:00:00.000Z' }],
    }));
    renderInbox('/inbox?c=c1');

    await user.click(await screen.findByRole('button', { name: /About Curious Fan/ }));
    const panel = await screen.findByRole('complementary', { name: /About Curious Fan/ });

    expect(within(panel).queryByText('Conversation')).not.toBeInTheDocument();
    // One automation = the acquisition. From says it; no second block repeats it.
    expect(within(panel).getAllByText('Guide automation')).toHaveLength(1);
    expect(within(panel).queryByText('Also in')).not.toBeInTheDocument();
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

    const from = within(panel).getByText('From');
    expect(from).toBeInTheDocument();
    expect(within(panel).getAllByRole('link', { name: 'Guide automation' })[0])
      .toHaveAttribute('href', '/automations/f1');
    expect(within(panel).queryByText(/Lead score/i)).not.toBeInTheDocument();
    // Stage exists — it is a real field — but it FOLLOWS the human context
    // rather than leading it: the acquisition renders above the relationship
    // controls in the panel's reading order.
    const stage = within(panel).getByRole('combobox', { name: 'Stage' });
    expect(from.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('overlapping panel edits each keep their own field', async () => {
    // A slow note save and a quick stage change. Whichever response lands
    // last must merge its ONE field into the current state — a full snapshot
    // from before the other edit would quietly revert it in the UI even
    // though both saves succeeded on the server.
    const user = userEvent.setup();
    renderInbox('/inbox?c=c1');

    await user.click(await screen.findByRole('button', { name: /About Curious Fan/ }));
    const panel = await screen.findByRole('complementary', { name: /About Curious Fan/ });

    let finishNoteSave!: (v: ContactRecord) => void;
    mockUpdateContact.mockImplementation(async (_id: string, patch: { notes?: string; stage?: string }) => {
      if (patch.notes !== undefined) {
        return new Promise<ContactRecord>(r => { finishNoteSave = r; });
      }
      return contactRecord({ stage: patch.stage });
    });

    // Start the slow note save…
    await user.click(within(panel).getByRole('button', { name: /Add note/ }));
    await user.type(within(panel).getByRole('textbox', { name: 'Note' }), 'Prefers weekends');
    await user.click(within(panel).getByRole('button', { name: 'Save note' }));

    // …change the stage while it is still in flight…
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Stage' }), 'warm');
    await waitFor(() =>
      expect(within(panel).getByRole('combobox', { name: 'Stage' })).toHaveValue('warm'));

    // …then let the note save land. The stage must survive it.
    finishNoteSave(contactRecord({ notes: 'Prefers weekends' }));
    await waitFor(() => expect(within(panel).getByText('Prefers weekends')).toBeInTheDocument());
    expect(within(panel).getByRole('combobox', { name: 'Stage' })).toHaveValue('warm');
  });

  it('a contact acquired by a post keeps that attribution', async () => {
    // No automation on record, but the post that brought them in is known —
    // the retired profile said so, and retiring it must not erase the only
    // acquisition attribution these contacts have.
    const user = userEvent.setup();
    mockFetchContact.mockResolvedValue(detail({
      automations: [],
      sourceAutomation: null,
      sourcePost: { id: 'p1', caption: 'Drop your favorite venue below', url: null, platform: 'instagram' },
    }));
    renderInbox('/inbox?c=c1');

    await user.click(await screen.findByRole('button', { name: /About Curious Fan/ }));
    const panel = await screen.findByRole('complementary', { name: /About Curious Fan/ });

    expect(within(panel).getByText('From')).toBeInTheDocument();
    expect(within(panel).getByText(/Drop your favorite venue below/)).toBeInTheDocument();
  });

  it('tells the relationship\'s story, not the engine\'s diary', async () => {
    const user = userEvent.setup();
    mockFetchContact.mockResolvedValue(detail({
      automations: [{ id: 'f1', name: 'Culture', status: 'live', firstEnteredAt: '2026-08-01T10:00:00.000Z' }],
      messages: [message({ created_at: '2026-08-02T09:00:00.000Z' })],
      events: [{
        id: 'e1', automation_id: null, contact_id: 'c1', event_type: 'no_match',
        status: 'ok', detail: 'No automation matched — queued for a personal reply.',
        error: null, contact_handle: null, contact_name: null, automation_name: null,
        created_at: '2026-08-02T09:00:00.000Z',
      }],
    }));
    renderInbox('/inbox?c=c1');

    await user.click(await screen.findByRole('button', { name: /About Curious Fan/ }));
    const panel = await screen.findByRole('complementary', { name: /About Curious Fan/ });

    // Human activity, from data we hold…
    expect(within(panel).getByText('Entered through Culture')).toBeInTheDocument();
    expect(within(panel).getByText('Started a conversation')).toBeInTheDocument();
    // …never the runtime's phrasing.
    expect(within(panel).queryByText(/queued for a personal reply/i)).not.toBeInTheDocument();
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
