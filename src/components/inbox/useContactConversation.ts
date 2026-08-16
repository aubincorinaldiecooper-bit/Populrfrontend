import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { fetchContact, sendInboxReply, ApiError } from '../../lib/api';
import type { ContactDetail } from '../../lib/api';

/**
 * One person's conversation, loaded by their id.
 *
 * This is the Contacts side of the canonical conversation view. Inbox keeps
 * useConversations because it owns a list beside the thread; a contact opened
 * from the directory has no list — just the person — so this hook carries
 * exactly what the shared view needs: the detail, the send path, and a way
 * for panel edits to update the open record.
 *
 * Same canonical fetch (GET /api/contacts/:id) and same send path
 * (sendInboxReply through the detail's own latestInboxItemId) as the Inbox —
 * the two entrances must never disagree about who someone is or how a reply
 * goes out.
 */

export interface ContactConversationState {
  detail: ContactDetail | null;
  loading: boolean;
  error: string | null;
  sending: boolean;
  send: (text: string) => Promise<boolean>;
  /** Merge a panel edit into the current detail (no-op once nothing is open). */
  updateDetail: (update: (current: ContactDetail) => ContactDetail) => void;
  reload: () => void;
}

export function useContactConversation(contactId: string | null): ContactConversationState {
  const { showToast } = useApp();
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(contactId));
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Monotonic request id: contacts are opened by clicking down a list, and an
  // older response landing last must not show the wrong person's messages.
  const seq = useRef(0);

  const load = useCallback(() => {
    if (!contactId) {
      setDetail(null);
      setLoading(false);
      return;
    }
    const mySeq = ++seq.current;
    setLoading(true);
    setError(null);
    fetchContact(contactId)
      .then(d => {
        if (mySeq !== seq.current) return;
        setDetail(d);
      })
      .catch(err => {
        if (mySeq !== seq.current) return;
        setDetail(null);
        setError(err instanceof Error ? err.message : 'Could not open this conversation.');
      })
      .finally(() => {
        if (mySeq === seq.current) setLoading(false);
      });
  }, [contactId]);

  useEffect(() => {
    // Data fetch from the backend, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const send = useCallback(async (text: string): Promise<boolean> => {
    const target = detail?.latestInboxItemId ?? null;
    if (!target) {
      showToast("There's nothing to reply to on this conversation yet.", 'error');
      return false;
    }
    // Whose conversation this reply belongs to, fixed before the await — the
    // creator can open someone else while it is in flight, and the reload
    // below must not resurrect the previous person over them.
    const sentFor = contactId;
    setSending(true);
    try {
      const result = await sendInboxReply(target, { text });
      showToast(`Reply sent on ${result.channel === 'dm' ? 'DM' : 'the comment thread'}.`, 'success');
      if (sentFor && sentFor === contactId) load();
      return true;
    } catch (err) {
      const message = err instanceof ApiError && err.code === 'not_supported_on_platform'
        ? err.message
        : err instanceof Error ? err.message : 'Could not send this reply.';
      showToast(message, 'error');
      return false;
    } finally {
      setSending(false);
    }
  }, [detail, contactId, load, showToast]);

  const updateDetail = useCallback(
    (update: (current: ContactDetail) => ContactDetail) =>
      setDetail(prev => (prev ? update(prev) : prev)),
    []
  );

  return { detail, loading, error, sending, send, updateDetail, reload: load };
}
