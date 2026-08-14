import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  isBackendConfigured, fetchConversations, fetchContact, sendInboxReply, ApiError,
} from '../../lib/api';
import type { Conversation, ContactDetail } from '../../lib/api';

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
  select: (contactId: string | null) => void;
  refresh: () => void;
  send: (text: string) => Promise<boolean>;
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

  const select = useCallback((contactId: string | null) => {
    setSelectedId(contactId);
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

  const send = useCallback(async (text: string): Promise<boolean> => {
    const conversation = conversations.find(c => c.contactId === selectedId);
    if (!conversation) return false;
    if (!conversation.latestInboxItemId) {
      // Replies go out through an inbox item — it carries the channel and the
      // message being answered. Saying so is better than a send that fails.
      showToast("There's nothing to reply to on this conversation yet.", 'error');
      return false;
    }
    setSending(true);
    try {
      const result = await sendInboxReply(conversation.latestInboxItemId, { text });
      showToast(`Reply sent on ${result.channel === 'dm' ? 'DM' : 'the comment thread'}.`, 'success');
      refresh();
      if (selectedId) loadThread(selectedId);
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
  }, [conversations, selectedId, showToast, refresh, loadThread]);

  return {
    conversations, loading, error, thread, threadLoading, selectedId, sending,
    select, refresh, send,
  };
}
