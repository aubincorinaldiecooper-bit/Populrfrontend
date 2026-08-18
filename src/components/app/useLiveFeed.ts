import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectLiveFeed, feedIsLive, subscribeToFeedStatus } from '../../lib/liveFeed';
import { queryKeys } from '../../lib/queryKeys';

/**
 * The live feed, wired to the cache.
 *
 * An event says a family changed; this marks that family stale. Only
 * queries something is actually watching refetch, so an event that arrives
 * while the creator is on a page that doesn't care costs nothing at all —
 * and the moment they open the page, the entry is already known to be
 * stale, so it refreshes on arrival rather than showing yesterday first.
 *
 * The invalidation is deliberately coarse. A nudge names a family, not a
 * row; if it named a row this would have to know which rows each surface
 * derives from which fact, which is the coupling the cache exists to
 * remove. Coarse and correct beats precise and quietly wrong.
 *
 * Mounted once, in the app shell.
 */
export function useLiveFeed(): void {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      connectLiveFeed(topic => {
        if (topic === 'conversations') {
          // The list, and whichever person is open. Only mounted queries
          // refetch, so "every conversation" is at most the search on
          // screen, and "every contact" is at most the one being read.
          void queryClient.invalidateQueries({ queryKey: queryKeys.conversationLists });
          void queryClient.invalidateQueries({ queryKey: queryKeys.contactThreads });
        } else {
          void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
        }
      }),
    [queryClient],
  );
}

/**
 * Whether the live feed is currently connected.
 *
 * The polls read this to decide how often to ask: rarely while something is
 * listening, at the old rate when nothing is. That is the fallback the feed
 * was built on top of rather than in place of — the server's hub is
 * per-instance, so a creator on one instance can miss an event that landed
 * on another, and the answer to that is a slow poll, not a promise.
 */
export function useFeedIsLive(): boolean {
  return useSyncExternalStore(subscribeToFeedStatus, feedIsLive, () => false);
}
