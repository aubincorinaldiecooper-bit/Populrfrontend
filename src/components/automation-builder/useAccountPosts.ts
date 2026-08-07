import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPostsLibrary, isBackendConfigured, syncPostsLibrary, type PostLibraryItem } from '../../lib/api';

/**
 * The posts a trigger can watch, for exactly one account.
 *
 * Extracted from the builder page because both of its rules are invisible
 * until they're broken, and both produce the same symptom a creator reports as
 * "it's showing the wrong Instagram":
 *
 *  - Responses are matched to the account that asked for them. Switching
 *    accounts quickly can land the replies out of order, and applying a late
 *    one puts account A's posts in front of a trigger configured for B — which
 *    is how a mismatched postId gets saved.
 *
 *  - A sync that answers 200 with a non-empty `errors` array has not
 *    succeeded. Zernio's auth, rate-limit and scope failures all arrive that
 *    way rather than as a rejected promise, and swallowing them makes a real
 *    "couldn't read this account" indistinguishable from "no posts here",
 *    which is the exact ambiguity Refresh exists to settle.
 */
export interface AccountPosts {
  posts: PostLibraryItem[];
  loading: boolean;
  /** Re-sync from the platform, then reload. Reports a sync that didn't work. */
  refresh: (accountId: string) => Promise<void>;
}

export function useAccountPosts(
  accountId: string | null,
  onError: (message: string) => void,
): AccountPosts {
  const [posts, setPosts] = useState<PostLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  /** The account the newest in-flight request was made for. */
  const requested = useRef<string | null>(null);

  const load = useCallback((target: string | null) => {
    requested.current = target;

    if (!target || !isBackendConfigured()) {
      setPosts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchPostsLibrary({ accountId: target, limit: 200 })
      .then(list => {
        if (requested.current !== target) return;
        // Belt and braces: the endpoint already scopes by account, and this
        // drops anything that somehow still doesn't belong to it rather than
        // offering a creator someone else's post.
        setPosts(list.filter(p => p.account_id === target));
      })
      .catch(() => {
        if (requested.current === target) setPosts([]);
      })
      .finally(() => {
        // The spinner belongs to the newest request too — clearing it from a
        // superseded one would say "loaded" while the real load is in flight.
        if (requested.current === target) setLoading(false);
      });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(accountId);
  }, [accountId, load]);

  const refresh = useCallback(async (target: string) => {
    setLoading(true);
    try {
      const result = await syncPostsLibrary(target);
      if (result.errors?.length) {
        onError(`Sync didn't fully succeed: ${result.errors[0]}`);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not refresh posts.');
    } finally {
      load(target);
    }
  }, [load, onError]);

  return { posts, loading, refresh };
}
