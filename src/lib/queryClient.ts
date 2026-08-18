import { QueryClient, focusManager } from '@tanstack/react-query';

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
/**
 * Which session's answers the cache currently holds.
 *
 * A mutation that was in flight when a session ended still runs its
 * callbacks — that is the property the optimistic rollback depends on, and
 * it does not stop being true because the creator signed out. Without a way
 * to tell "before" from "after", a read that failed on the way out would
 * write the previous person's notifications back into the cache their
 * sign-out had just cleared.
 *
 * So work started under one session carries that session's number, and a
 * write is refused if the number has moved on. Module-level rather than
 * React state because the code that has to check it — a mutation callback —
 * has no component left to read state from.
 */
let epoch = 0;

export function serverStateEpoch(): number {
  return epoch;
}

/** Everything cached and everything in flight now belongs to nobody. */
export function endServerStateSession(queryClient: QueryClient): void {
  epoch += 1;
  // Pending mutations go first: their callbacks are what would otherwise
  // write into the cache we are about to empty.
  queryClient.getMutationCache().clear();
  // Reset before clearing. Emptying the store does not tell a mounted
  // observer anything — it keeps rendering the last result it was given,
  // which on an account switch is the previous person's numbers still on
  // screen. resetQueries puts live queries back to "nothing yet" and asks
  // again; clear then drops what nobody is watching.
  void queryClient.resetQueries();
  queryClient.clear();
}

/**
 * What counts as the creator coming back.
 *
 * The cache's own answer is `visibilitychange` alone, which fires for tab
 * switches and for a minimised window — but NOT for clicking back into an
 * already-visible window from another application. The store this replaced
 * listened to window focus as well, and that is the common desktop case:
 * the browser was on screen the whole time, the creator was in Instagram,
 * and what they want on return is a badge that tells the truth.
 *
 * Installed once, before any query mounts, because the manager only runs a
 * setup function when its first subscriber arrives.
 */
export function listenForCreatorsReturn(): void {
  focusManager.setEventListener(onFocus => {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    const listener = () => onFocus();
    window.addEventListener('visibilitychange', listener, false);
    window.addEventListener('focus', listener, false);
    return () => {
      window.removeEventListener('visibilitychange', listener);
      window.removeEventListener('focus', listener);
    };
  });
}

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
