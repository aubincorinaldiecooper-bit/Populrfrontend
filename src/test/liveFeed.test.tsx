import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from './render';
import { useLiveFeed, useFeedIsLive } from '../components/app/useLiveFeed';
import { useConversationsQuery } from '../components/inbox/conversations';
import { useNotifications } from '../components/app/useNotifications';
import { pollRate, POLL_MS, FEED_SAFETY_NET_MS } from '../lib/pollRates';
import type { Conversation } from '../lib/api';

/* The connection that lets the app stop asking every minute.
 *
 * What matters about it isn't the wire format — it's what a creator gets:
 * a message arriving on their phone shows up in the tab they left open,
 * without them touching anything, and without the app having spent the last
 * hour asking whether it had.
 *
 * So these tests hold a real stream open through a stubbed fetch and drive
 * events down it, rather than calling the parser directly. What they pin:
 * an event refreshes what's on screen, each topic refreshes only its own
 * surface, an event nobody has heard of is ignored rather than guessed at,
 * a dropped connection comes back, and the fallback poll knows which of the
 * two it currently is.
 */

const fetchConversationsMock = vi.fn();
const fetchNotificationsMock = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    API_BASE_URL: '',
    isBackendConfigured: () => true,
    fetchConversations: (...args: unknown[]) => fetchConversationsMock(...args),
    fetchNotifications: (...args: unknown[]) => fetchNotificationsMock(...args),
  };
});

vi.mock('../lib/authClient', () => ({
  getApiAuthToken: async () => 'test-token',
  clearApiAuthToken: () => {},
}));

function conversation(contactId: string, name: string, waiting: number): Conversation {
  return {
    contactId, handle: name.toLowerCase(), name, avatarUrl: null, platform: 'instagram',
    lastMessage: { text: 'hi', direction: 'inbound', channel: 'dm', at: '2026-08-14T10:00:00.000Z' },
    waiting, latestInboxItemId: waiting > 0 ? `i_${contactId}` : null,
  };
}

/** One open stream, with a handle to write frames into it from a test. */
interface OpenStream {
  push: (frame: string) => void;
  /** End it the way a server restart or a dropped network would. */
  drop: () => void;
}
let streams: OpenStream[] = [];
/** How many times the client has asked for a stream, reconnects included. */
let connectAttempts = 0;

/** A fetch that answers /api/feed with a stream a test can write into. */
function stubFeedFetch(open: () => boolean = () => true) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (!String(url).includes('/api/feed')) return Promise.reject(new Error('unexpected fetch'));
      connectAttempts += 1;
      if (!open()) return Promise.resolve({ ok: false, status: 503, body: null });

      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
          c.enqueue(encoder.encode('retry: 3000\n\nevent: open\ndata: {}\n\n'));
        },
      });
      streams.push({
        push: frame => controller.enqueue(encoder.encode(frame)),
        drop: () => controller.close(),
      });
      return Promise.resolve({ ok: true, status: 200, body });
    }),
  );
}

/** The whole wiring: the connection, plus the two surfaces that read it. */
function Surfaces() {
  useLiveFeed();
  const live = useFeedIsLive();
  const conversations = useConversationsQuery();
  const notifications = useNotifications();
  return (
    <>
      <span data-testid="live">{live ? 'connected' : 'not connected'}</span>
      <span data-testid="conversations">
        {conversations.data?.conversations.map(c => c.name).join(', ') ?? '—'}
      </span>
      <span data-testid="unread">{notifications.data?.unread ?? '—'}</span>
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  streams = [];
  connectAttempts = 0;
  fetchConversationsMock.mockResolvedValue({ conversations: [conversation('c1', 'Jordan', 1)] });
  fetchNotificationsMock.mockResolvedValue({ notifications: [], unread: 0 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the live feed', () => {
  it('refreshes what is on screen when the server says something changed', async () => {
    stubFeedFetch();
    render(<Surfaces />);

    await waitFor(() => expect(screen.getByTestId('conversations')).toHaveTextContent('Jordan'));
    await waitFor(() => expect(screen.getByTestId('live')).toHaveTextContent('connected'));

    // Someone new writes in while the creator is looking at the tab.
    fetchConversationsMock.mockResolvedValue({
      conversations: [conversation('c2', 'Maya', 1), conversation('c1', 'Jordan', 1)],
    });
    streams[0].push('event: conversations\ndata: {}\n\n');

    await waitFor(() => expect(screen.getByTestId('conversations')).toHaveTextContent('Maya'));
  });

  it('each topic refreshes its own surface and leaves the other alone', async () => {
    stubFeedFetch();
    render(<Surfaces />);
    await waitFor(() => expect(screen.getByTestId('live')).toHaveTextContent('connected'));
    await waitFor(() => expect(fetchNotificationsMock).toHaveBeenCalledTimes(1));
    const conversationCalls = fetchConversationsMock.mock.calls.length;

    fetchNotificationsMock.mockResolvedValue({ notifications: [], unread: 3 });
    streams[0].push('event: notifications\ndata: {}\n\n');

    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('3'));
    // The conversation list was not woken for news that wasn't about it.
    expect(fetchConversationsMock).toHaveBeenCalledTimes(conversationCalls);
  });

  it('ignores an event it has never heard of', async () => {
    // A newer server may name a family this build knows nothing about.
    // Guessing which surface it meant is worse than doing nothing.
    stubFeedFetch();
    render(<Surfaces />);
    await waitFor(() => expect(screen.getByTestId('live')).toHaveTextContent('connected'));
    await waitFor(() => expect(fetchConversationsMock).toHaveBeenCalled());
    const before = fetchConversationsMock.mock.calls.length + fetchNotificationsMock.mock.calls.length;

    streams[0].push('event: invoices\ndata: {}\n\n');
    // The heartbeat and the open frame are not news either.
    streams[0].push(': keep-alive\n\n');
    streams[0].push('event: open\ndata: {}\n\n');
    await Promise.resolve();

    expect(fetchConversationsMock.mock.calls.length + fetchNotificationsMock.mock.calls.length)
      .toBe(before);
    expect(screen.getByTestId('live')).toHaveTextContent('connected');
  });

  it('reads a frame that arrived in pieces', async () => {
    // TCP does not respect line boundaries, and a frame split across two
    // chunks is a real message a creator is waiting on.
    stubFeedFetch();
    render(<Surfaces />);
    await waitFor(() => expect(screen.getByTestId('live')).toHaveTextContent('connected'));
    await waitFor(() => expect(screen.getByTestId('conversations')).toHaveTextContent('Jordan'));

    fetchConversationsMock.mockResolvedValue({ conversations: [conversation('c2', 'Maya', 1)] });
    streams[0].push('event: conver');
    streams[0].push('sations\ndata: {}\n\n');

    await waitFor(() => expect(screen.getByTestId('conversations')).toHaveTextContent('Maya'));
  });

  it('comes back after the connection drops', async () => {
    stubFeedFetch();
    render(<Surfaces />);
    await waitFor(() => expect(screen.getByTestId('live')).toHaveTextContent('connected'));

    // A deploy ends every open stream; the client is expected to notice and
    // reconnect to the new instance on its own.
    streams[0].drop();
    await waitFor(() => expect(screen.getByTestId('live')).toHaveTextContent('not connected'));
    await waitFor(() => expect(connectAttempts).toBeGreaterThan(1), { timeout: 3_000 });
    await waitFor(() => expect(screen.getByTestId('live')).toHaveTextContent('connected'));

    // And the reconnected stream carries news like the first one did.
    fetchConversationsMock.mockResolvedValue({ conversations: [conversation('c3', 'Sam', 1)] });
    streams[streams.length - 1].push('event: conversations\ndata: {}\n\n');
    await waitFor(() => expect(screen.getByTestId('conversations')).toHaveTextContent('Sam'));
  });

  it('says it is not connected when the server will not open one', async () => {
    // Which is what puts the polls back on their old rate: the fallback has
    // to know it is the mechanism again.
    stubFeedFetch(() => false);
    render(<Surfaces />);

    await waitFor(() => expect(fetchConversationsMock).toHaveBeenCalled());
    await waitFor(() => expect(connectAttempts).toBeGreaterThan(0));
    expect(screen.getByTestId('live')).toHaveTextContent('not connected');
  });
});

describe('the fallback poll', () => {
  it('is the mechanism when the feed is down, and a safety net when it is up', () => {
    // Not "the feed made polling unnecessary" — the server's hub is
    // per-instance, so an event can land on an instance a tab isn't
    // connected to, and a quiet tick is the honest answer to that.
    expect(pollRate(false)).toBe(POLL_MS);
    expect(pollRate(true)).toBe(FEED_SAFETY_NET_MS);
    expect(FEED_SAFETY_NET_MS).toBeGreaterThan(POLL_MS);
  });
});
