import { useCallback } from 'react';
import { useConversationsQuery } from './conversations';
import { useContactConversation } from './useContactConversation';
import { errorMessage } from '../../lib/errorCopy';
import type { Conversation, ContactDetail } from '../../lib/api';

/**
 * The conversations, and whichever one is open.
 *
 * Two facts, each cached under its own name: the list for a search term, and
 * the person at `contactId`. Neither is fetched here — the list is the same
 * query the nav badge reads, and the thread is the same hook the Contacts
 * page runs. This hook is the Inbox's arrangement of them, nothing more.
 *
 * What that replaced was two hand-rolled loads with a monotonic request id
 * each, because both could be asked again before the last answer arrived —
 * search is un-debounced, and threads are opened by clicking down a list. A
 * counter comparing "is this still the newest request?" is the right answer
 * to that question and the wrong shape for it: it has to be got right once
 * per call site, it silently discards the answer rather than keeping it, and
 * it can only ever protect the one piece of state it was written beside.
 *
 * Keys answer it structurally instead. A slow response lands in the entry for
 * the term or the person it was ASKED about, so it can't overwrite an answer
 * to a different question — and it's still there, warm, if the creator comes
 * back to it.
 *
 * Which conversation is open is not state here either: it's the `contactId`
 * argument, which the page reads from the URL. The URL was already the source
 * of truth; keeping a copy beside it meant an effect to hold the two in step.
 */

export interface ConversationsState {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  /** The open thread's contact detail, or null while nothing is open. */
  thread: ContactDetail | null;
  threadLoading: boolean;
  /** Why the open conversation couldn't be loaded, if it couldn't. */
  threadError: string | null;
  sending: boolean;
  /** The inbox item the open thread replies through — from the thread's own
   *  detail, so an open conversation is answerable no matter how it was
   *  reached or what the list is currently filtered to. */
  replyTarget: string | null;
  refresh: () => void;
  /** Ask for the open conversation again — the way back from threadError. */
  reloadThread: () => void;
  send: (text: string) => Promise<boolean>;
  /** Panel edits (notes, stage, tags) merge into the open thread — an
   *  updater, so overlapping edits each land their own field. */
  updateThread: (update: (current: ContactDetail) => ContactDetail) => void;
}

export function useConversations(search: string, contactId: string | null): ConversationsState {
  const list = useConversationsQuery(search);
  const conversation = useContactConversation(contactId);
  const { refetch } = list;

  const refresh = useCallback(() => { void refetch(); }, [refetch]);

  return {
    conversations: list.data?.conversations ?? [],
    // isLoading, not isPending: a query held back because the backend isn't
    // configured is not loading, and a background refetch of a list already
    // on screen shouldn't replace it with skeletons.
    loading: list.isLoading,
    error: list.isError
      ? errorMessage(list.error, 'Could not load your conversations.')
      : null,
    thread: conversation.detail,
    threadLoading: conversation.loading,
    threadError: conversation.error,
    sending: conversation.sending,
    replyTarget: conversation.detail?.latestInboxItemId ?? null,
    refresh,
    reloadThread: conversation.reload,
    send: conversation.send,
    updateThread: conversation.updateDetail,
  };
}
