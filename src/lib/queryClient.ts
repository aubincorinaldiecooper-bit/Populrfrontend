import { QueryClient } from '@tanstack/react-query';

/**
 * One cache for everything the server knows, and one place where the rules
 * about it are written down.
 *
 * Before this, every surface answered the same questions for itself: how
 * long an answer stays good, what a second request while the first is still
 * out means, what happens to what's on screen when a request fails. The
 * answers drifted — one badge refetched when the tab came back and another
 * didn't; a failed refresh cleared one count to zero and left another
 * standing. Those are policies, not per-component decisions, so they live
 * here now.
 *
 * The one worth stating out loud, because getting it wrong is what brought
 * us here: A FAILED REQUEST NEVER PRODUCES A VALUE. The last thing the
 * server actually said stays on screen and the failure is reported
 * alongside it. Zero is an answer, and we only ever show it if the server
 * said it.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Long enough that moving between two pages backed by the same data
        // doesn't re-ask, short enough that coming back to a tab is honest.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        // The creator's attention is the best refresh signal there is: back
        // from another tab, back from a lost connection, ask again. This
        // replaces the hand-rolled visibility and focus listeners.
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        // One retry, because the first failure is usually a blip and the
        // second usually isn't. Beyond that the surface says so.
        retry: 1,
      },
      mutations: {
        // A mutation is the creator doing something deliberate. Retrying it
        // is our decision to make on their behalf, and we decline: the
        // surfaces that need one ask again explicitly.
        retry: 0,
      },
    },
  });
}
