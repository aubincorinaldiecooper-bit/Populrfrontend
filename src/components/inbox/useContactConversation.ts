import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/AppContext';
import { isBackendConfigured, fetchContact, sendInboxReply, ApiError } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import { errorMessage } from '../../lib/errorCopy';
import type { ContactDetail } from '../../lib/api';

/**
 * One person's conversation, loaded by their id.
 *
 * This is the whole of the thread half, for both entrances. Contacts calls it
 * directly — a person opened from the directory has no list beside them —
 * and useConversations composes it under the Inbox's list, so there is one
 * fetch (GET /api/contacts/:id), one send path, and one set of decisions
 * about what a reply refreshes. The two entrances can't disagree about who
 * someone is or how a reply goes out, because there is nothing to disagree
 * with: they are running the same hook.
 *
 * The monotonic request id this used to keep is gone: contacts are opened by
 * clicking down a list, and the guarantee that an older response can't land
 * over a newer one is the cache's now — each person is their own key, so a
 * slow answer arrives at the person it was asked about, not at whoever is
 * open when it lands.
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
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.contact(contactId ?? ''),
    queryFn: () => fetchContact(contactId!),
    enabled: Boolean(contactId) && isBackendConfigured(),
  });

  const reply = useMutation({
    mutationFn: ({ target, text }: { sentFor: string; target: string; text: string }) =>
      sendInboxReply(target, { text }),
    onSuccess: result => {
      showToast(`Reply sent on ${result.channel === 'dm' ? 'DM' : 'the comment thread'}.`, 'success');
    },
    onSettled: (_result, _err, { sentFor }) => {
      // The thread has a new message in it, and this reply may have answered
      // the thing the nav badge was counting. Both are asked again — and the
      // person refreshed is the one this reply was SENT to, read back off the
      // mutation's own variables rather than off whoever is open when it
      // lands. Clicking someone else mid-send is ordinary, and the difference
      // between those two readings is a thread landing under the wrong name.
      void queryClient.invalidateQueries({ queryKey: queryKeys.contact(sentFor) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversationLists });
    },
  });

  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const target = query.data?.latestInboxItemId ?? null;
      if (!contactId || !target) {
        showToast("There's nothing to reply to on this conversation yet.", 'error');
        return false;
      }
      try {
        await reply.mutateAsync({ sentFor: contactId, target, text });
        return true;
      } catch (err) {
        // 422 means the platform genuinely can't carry this reply — say that,
        // not a generic failure.
        showToast(
          err instanceof ApiError && err.code === 'not_supported_on_platform'
            ? err.message
            : errorMessage(err),
          'error',
        );
        return false;
      }
    },
    [contactId, query.data, reply, showToast],
  );

  const updateDetail = useCallback(
    (update: (current: ContactDetail) => ContactDetail) => {
      if (!contactId) return;
      queryClient.setQueryData<ContactDetail>(queryKeys.contact(contactId), prev =>
        prev ? update(prev) : prev,
      );
    },
    [contactId, queryClient],
  );

  return {
    detail: query.data ?? null,
    // isLoading, not isPending: with nothing open — or no backend to ask —
    // this query is held back rather than in flight, and a spinner for a
    // request that was never made never stops.
    loading: query.isLoading,
    error: query.isError ? errorMessage(query.error) : null,
    sending: reply.isPending,
    send,
    updateDetail,
    reload: () => {
      if (contactId) void queryClient.invalidateQueries({ queryKey: queryKeys.contact(contactId) });
    },
  };
}
