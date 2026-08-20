import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/AppContext';
import { isOwnerView } from '../../lib/access';
import { queryKeys } from '../../lib/queryKeys';
import {
  addComment,
  deleteComment,
  fetchComments,
  isBackendConfigured,
  resolveComment,
  type CommentThread,
} from '../../lib/api';

/**
 * The notes on one canvas, and what this session may do to them.
 *
 * Notes are collaboration metadata: they say things ABOUT the automation
 * without changing it. That is what makes a view-only seat worth having —
 * a viewer who can leave a note is a reviewer, and one who can't is a
 * spectator — so nothing in here is gated on editAutomations.
 *
 * Where a note goes is decided by the canvas (see lib/notePlacement) and
 * carried through unchanged. This hook only knows that a note has a place.
 */

export type Placement =
  | { nodeId: string; at: { relX: number; relY: number } }
  | { at: { x: number; y: number } };

export interface CanvasNotes {
  threads: CommentThread[];
  /** Unresolved only — what paints a pin and what the header counts. */
  open: CommentThread[];
  resolved: CommentThread[];
  loading: boolean;
  /** Whether this session may settle a given thread: its author, or the
   *  workspace owner. The server enforces it; this decides what to offer. */
  maySettle: (thread: CommentThread) => boolean;
  leave: (placement: Placement, body: string) => Promise<void>;
  reply: (threadId: string, body: string) => Promise<void>;
  settle: (threadId: string, resolved: boolean) => Promise<void>;
  remove: (commentId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useCanvasNotes(flowId: string | null): CanvasNotes {
  const queryClient = useQueryClient();
  const { workspaceAccess } = useApp();
  const enabled = Boolean(flowId) && isBackendConfigured();

  const { data, isPending } = useQuery({
    queryKey: queryKeys.comments(flowId ?? ''),
    queryFn: () => fetchComments(flowId!),
    enabled,
  });

  const threads = useMemo(() => data ?? [], [data]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.comments(flowId ?? '') });
  }, [queryClient, flowId]);

  const owner = isOwnerView(workspaceAccess);
  const maySettle = useCallback(
    (thread: CommentThread) => owner || thread.you,
    [owner],
  );

  const leave = useCallback(
    async (placement: Placement, body: string) => {
      if (!flowId) return;
      await addComment(
        flowId,
        'nodeId' in placement
          ? { body, nodeId: placement.nodeId, at: placement.at }
          : { body, at: placement.at },
      );
      await refresh();
    },
    [flowId, refresh],
  );

  const reply = useCallback(
    async (threadId: string, body: string) => {
      if (!flowId) return;
      await addComment(flowId, { body, parentId: threadId });
      await refresh();
    },
    [flowId, refresh],
  );

  const settle = useCallback(
    async (threadId: string, resolved: boolean) => {
      if (!flowId) return;
      await resolveComment(flowId, threadId, resolved);
      await refresh();
    },
    [flowId, refresh],
  );

  const remove = useCallback(
    async (commentId: string) => {
      if (!flowId) return;
      await deleteComment(flowId, commentId);
      await refresh();
    },
    [flowId, refresh],
  );

  return {
    threads,
    open: useMemo(() => threads.filter(t => !t.resolved), [threads]),
    resolved: useMemo(() => threads.filter(t => t.resolved), [threads]),
    loading: enabled && isPending,
    maySettle,
    leave,
    reply,
    settle,
    remove,
    refresh,
  };
}

/**
 * The canvas's "I am placing a note" mode.
 *
 * Kept out of the canvas component because two surfaces start it — the index's
 * "Leave a note", and a right-click that goes straight to a placement — and
 * one of them is not on the canvas at all.
 */
export interface Placing {
  /** A placement chosen and waiting for words. */
  at: Placement | null;
  /** Armed and waiting for a click to choose a place. */
  arming: boolean;
}

export function usePlacing(): {
  placing: Placing;
  arm: () => void;
  place: (at: Placement) => void;
  cancel: () => void;
} {
  const [placing, setPlacing] = useState<Placing>({ at: null, arming: false });
  return {
    placing,
    arm: useCallback(() => setPlacing({ at: null, arming: true }), []),
    place: useCallback((at: Placement) => setPlacing({ at, arming: false }), []),
    cancel: useCallback(() => setPlacing({ at: null, arming: false }), []),
  };
}
