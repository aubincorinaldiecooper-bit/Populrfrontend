import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  isBackendConfigured, fetchConversations, fetchContact, sendInboxReply, ApiError,
} from '../../lib/api';
import type { Conversation, ContactDetail } from '../../lib/api';
import { reportWaitingConversations } from './useInboxUnread';

/**
 * The conversations, and whichever one is open.
 *
 * Two requests, deliberately kept apart. The list is cheap and refetched on
 * search or after a send; the open thread is the contact's own detail —
 * `GET /api/contacts/:id`, the canonical record — which already carries the
 * message history, the automations they belong to and their activity. Reusing
 * it means the conversation and the Contact page can never disagree about who
 * someone is, because there is only one place that answers.
 *
 * Sending goes through the existing inbox reply endpoint, unchanged: one send
 * path for the drawer, the full Inbox and the page that came before both.
 */

export interface ConversationsState {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  /** The open thread's contact detail, or null while nothing is open. */
  thread: ContactDetail | null;
  threadLoading: boolean;
  selectedId: string | null;
  sending: boolean;
  /** The inbox item the open thread replies through — from the thread's own
   *  detail, so an open conversation is answerable no matter how it was
   *  reached or what the list is currently filtered to. */
  replyTarget: string | null;
  select: (contactId: string | null) => void;
  refresh: () => void;
  send: (text: string) => Promise<boolean>;
  /** Panel edits (notes, stage, tags) merge into the open thread — an
   *  updater, so overlapping edits each land their own field. */
  updateThread: (update: (current: ContactDetail) => ContactDetail) => void;
}

export function useConversations(search: string): ConversationsState {
  const { showToast } = useApp();
  const backendConfigured = isBackendConfigured();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(backendConfigured);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ContactDetail | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Monotonic request ids. Search is un-debounced and threads are opened by
  // clicking down a list, so without these an older response can land last and
  // show the wrong person's messages under the right person's name.
  const listSeq = useRef(0);
  const threadSeq = useRef(0);

  const refresh = useCallback(() => {
    if (!backendConfigured) return;
    const seq = ++listSeq.current;
    setLoading(true);
    setError(null);
    fetchConversations({ search: search.trim() || undefined })
      .then(res => {
        if (seq !== listSeq.current) return;
        setConversations(res.conversations);
        // The nav badge counts the same thing this list does. The page just
        // fetched the fresh answer, so hand it over rather than letting the
        // badge poll its way to it a minute later — but only from the
        // UNFILTERED list. A search that narrows to nobody is a filter, not
        // news that nobody is waiting.
        if (!search.trim()) {
          reportWaitingConversations(res.conversations.filter(c => c.waiting > 0).length);
        }
      })
      .catch(err => {
        if (seq !== listSeq.current) return;
        setError(err instanceof Error ? err.message : 'Could not load your conversations.');
      })
      .finally(() => {
        if (seq === listSeq.current) setLoading(false);
      });
  }, [backendConfigured, search]);

  useEffect(() => {
    // Data fetch from the backend, not derived state — see ContactsPage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const loadThread = useCallback((contactId: string) => {
    const seq = ++threadSeq.current;
    setThreadLoading(true);
    fetchContact(contactId)
      .then(detail => {
        if (seq !== threadSeq.current) return;
        setThread(detail);
      })
      .catch(err => {
        if (seq !== threadSeq.current) return;
        setThread(null);
        showToast(err instanceof Error ? err.message : 'Could not open this conversation.', 'error');
      })
      .finally(() => {
        if (seq === threadSeq.current) setThreadLoading(false);
      });
  }, [showToast]);

  // Mirrors selectedId for the async send path, which must be able to ask
  // "is this still the open conversation?" after an await — its closure's
  // captured selectedId is the answer to a question from before the await.
  const selectedRef = useRef<string | null>(null);

  const select = useCallback((contactId: string | null) => {
    setSelectedId(contactId);
    selectedRef.current = contactId;
    if (!contactId) {
      // Bump the sequence so a thread still in flight can't land on a closed
      // conversation and reopen it.
      threadSeq.current += 1;
      setThread(null);
      return;
    }
    setThread(null);
    loadThread(contactId);
  }, [loadThread]);

  // The thread's own record of how a reply goes out. The list used to be the
  // only carrier of this, which meant a search that filtered the open person
  // out silently made their conversation unanswerable — the detail carrying
  // its own target removed that whole class of problem.
  const replyTarget = thread?.latestInboxItemId ?? null;

  const send = useCallback(async (text: string): Promise<boolean> => {
    const target = thread?.latestInboxItemId ?? null;
    if (!target) {
      // Replies go out through an inbox item — it carries the channel and the
      // message being answered. Saying so is better than a send that fails,
      // and better than the silent `return false` this used to do when the
      // conversation simply wasn't in the filtered list.
      showToast("There's nothing to reply to on this conversation yet.", 'error');
      return false;
    }
    // Whose conversation this reply belongs to, fixed before the await. The
    // creator can click another person while this is in flight.
    const sentFor = selectedId;
    setSending(true);
    try {
      const result = await sendInboxReply(target, { text });
      showToast(`Reply sent on ${result.channel === 'dm' ? 'DM' : 'the comment thread'}.`, 'success');
      refresh();
      // Only reload the thread if it is still the open one. Reloading the
      // conversation we sent from would otherwise land AFTER the newly opened
      // one and win, showing that person's messages under this person's reply
      // target — and the next reply would go to the wrong recipient.
      if (sentFor && selectedRef.current === sentFor) loadThread(sentFor);
      return true;
    } catch (err) {
      // 422 means the platform genuinely can't carry this reply — say that,
      // not a generic failure.
      const message = err instanceof ApiError && err.code === 'not_supported_on_platform'
        ? err.message
        : err instanceof Error ? err.message : 'Could not send this reply.';
      showToast(message, 'error');
      return false;
    } finally {
      setSending(false);
    }
  }, [thread, selectedId, showToast, refresh, loadThread]);

  return {
    conversations, loading, error, thread, threadLoading, selectedId, sending,
    replyTarget, select, refresh, send,
    updateThread: (update: (current: ContactDetail) => ContactDetail) =>
      setThread(prev => (prev ? update(prev) : prev)),
  };
}
