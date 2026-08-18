import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isBackendConfigured, fetchConversations, type Conversation } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

/**
 * The conversations, cached under one key per search.
 *
 * The nav badge and the Inbox page used to ask this question separately —
 * two requests for the same list, two answers that could differ, and a
 * hand-written bridge between them so the page could tell the badge what it
 * had just learned. They share the key now: whoever asks first fetches,
 * whoever asks second joins that request, and an answer arriving anywhere
 * updates everywhere.
 */

export interface ConversationsData {
  conversations: Conversation[];
}

/**
 * How many PEOPLE are waiting, not how many messages — one person with
 * three flagged messages is one conversation waiting, which is what the
 * Inbox itself says in its subtitle. Counted from the same rows the page
 * lists, so the two can't drift.
 */
export function countWaiting(conversations: Conversation[]): number {
  return conversations.filter(c => c.waiting > 0).length;
}

/** The unfiltered list is the one the badge counts; a search is a filter. */
export function useConversationsQuery(search = '') {
  const term = search.trim();
  return useQuery({
    queryKey: queryKeys.conversations(term),
    queryFn: () => fetchConversations(term ? { search: term } : {}),
    enabled: isBackendConfigured(),
    // Polled only for the unfiltered list, and paused on a hidden tab: a
    // laptop left open overnight costs nothing, and the creator coming back
    // to the tab is itself a refresh.
    refetchInterval: term ? false : 60_000,
  });
}

/**
 * The badge on the Inbox nav item, in the sidebar and the builder's rail
 * alike — however many render, one cached list answers all of them.
 */
export function useInboxWaiting(): { count: number; refresh: () => void } {
  const queryClient = useQueryClient();
  const { data } = useConversationsQuery();
  return {
    count: data ? countWaiting(data.conversations) : 0,
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations('') });
    },
  };
}
