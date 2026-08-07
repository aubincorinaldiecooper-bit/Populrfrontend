/* Which posts the builder offers, and why it sometimes offered the wrong ones.
 *
 * Both rules here are invisible until broken, and both produce the same
 * symptom a creator reports as "it's showing a different Instagram". Neither
 * shows up without deliberately racing the requests, so both are pinned.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAccountPosts } from '../components/automation-builder/useAccountPosts';
import type { PostLibraryItem } from '../lib/api';

const fetchPostsLibrary = vi.fn();
const syncPostsLibrary = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchPostsLibrary: (...a: unknown[]) => fetchPostsLibrary(...a),
    syncPostsLibrary: (...a: unknown[]) => syncPostsLibrary(...a),
  };
});

function post(id: string, accountId: string): PostLibraryItem {
  return {
    id, account_id: accountId, platform: 'instagram', external_post_id: `x${id}`,
    url: null, caption: `Post ${id}`, media_url: null, published_at: new Date().toISOString(),
    likes: '1', comments: '1', shares: null, saves: null, views: null, impressions: null,
    reach: null, engagement_rate: null, account_username: accountId,
    contacts_generated: '0', warm_leads: '0', hot_leads: '0', dms_sent: '0', funnels_attached: '0',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchPostsLibrary.mockResolvedValue([]);
  syncPostsLibrary.mockResolvedValue({ accounts: 1, postsStored: 0, errors: [] });
});

describe('posts are scoped to the chosen account', () => {
  it('asks the server for one account rather than filtering everything client-side', async () => {
    renderHook(() => useAccountPosts('acc_a', vi.fn()));
    await waitFor(() => expect(fetchPostsLibrary).toHaveBeenCalled());
    expect(fetchPostsLibrary).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc_a' }));
  });

  it('drops anything the server returned that belongs to another account', async () => {
    fetchPostsLibrary.mockResolvedValue([post('a1', 'acc_a'), post('b1', 'acc_b')]);
    const { result } = renderHook(() => useAccountPosts('acc_a', vi.fn()));

    await waitFor(() => expect(result.current.posts).toHaveLength(1));
    expect(result.current.posts[0].id).toBe('a1');
  });

  it('ignores a response for an account that is no longer selected', async () => {
    // A resolves LAST, after the creator has moved to B. Applying it would put
    // A's posts in front of a trigger configured for B, and let a mismatched
    // postId be saved — the exact "wrong Instagram" symptom.
    let resolveA: (v: PostLibraryItem[]) => void = () => {};
    fetchPostsLibrary
      .mockImplementationOnce(() => new Promise<PostLibraryItem[]>(r => { resolveA = r; }))
      .mockResolvedValueOnce([post('b1', 'acc_b')]);

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useAccountPosts(id, vi.fn()),
      { initialProps: { id: 'acc_a' } },
    );
    await waitFor(() => expect(fetchPostsLibrary).toHaveBeenCalledTimes(1));

    rerender({ id: 'acc_b' });
    await waitFor(() => expect(result.current.posts.map(p => p.id)).toEqual(['b1']));

    await act(async () => { resolveA([post('a1', 'acc_a')]); });

    expect(result.current.posts.map(p => p.id)).toEqual(['b1']);
  });

  it('does not clear the spinner from a superseded request', async () => {
    let resolveA: (v: PostLibraryItem[]) => void = () => {};
    fetchPostsLibrary
      .mockImplementationOnce(() => new Promise<PostLibraryItem[]>(r => { resolveA = r; }))
      .mockImplementationOnce(() => new Promise<PostLibraryItem[]>(() => {})); // B still loading

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useAccountPosts(id, vi.fn()),
      { initialProps: { id: 'acc_a' } },
    );
    rerender({ id: 'acc_b' });

    await act(async () => { resolveA([]); });

    // B's load is genuinely still in flight; saying "loaded" here would show
    // an empty list as though it were the answer.
    expect(result.current.loading).toBe(true);
  });

  it('empties the list when no account is chosen', async () => {
    const { result } = renderHook(() => useAccountPosts(null, vi.fn()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.posts).toEqual([]);
    expect(fetchPostsLibrary).not.toHaveBeenCalled();
  });
});

describe('refresh reports a sync that did not work', () => {
  it('surfaces an errors array returned alongside a 200', async () => {
    // Zernio auth / rate-limit / scope failures arrive this way rather than as
    // a rejected promise. Unread, a real failure looks exactly like "this
    // account has no posts" — the ambiguity Refresh exists to settle.
    syncPostsLibrary.mockResolvedValue({
      accounts: 1, postsStored: 0, errors: ['Instagram rejected the request (rate limited)'],
    });
    const onError = vi.fn();
    const { result } = renderHook(() => useAccountPosts('acc_a', onError));

    await act(async () => { await result.current.refresh('acc_a'); });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('rate limited'));
  });

  it('reports a thrown failure too', async () => {
    syncPostsLibrary.mockRejectedValue(new Error('Network unreachable'));
    const onError = vi.fn();
    const { result } = renderHook(() => useAccountPosts('acc_a', onError));

    await act(async () => { await result.current.refresh('acc_a'); });

    expect(onError).toHaveBeenCalledWith('Network unreachable');
  });

  it('says nothing when the sync genuinely succeeded', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useAccountPosts('acc_a', onError));

    await act(async () => { await result.current.refresh('acc_a'); });

    expect(onError).not.toHaveBeenCalled();
  });

  it('reloads the list after syncing, so corrected rows actually appear', async () => {
    const { result } = renderHook(() => useAccountPosts('acc_a', vi.fn()));
    await waitFor(() => expect(fetchPostsLibrary).toHaveBeenCalledTimes(1));

    fetchPostsLibrary.mockResolvedValue([post('fresh', 'acc_a')]);
    await act(async () => { await result.current.refresh('acc_a'); });

    await waitFor(() => expect(result.current.posts.map(p => p.id)).toEqual(['fresh']));
  });
});
