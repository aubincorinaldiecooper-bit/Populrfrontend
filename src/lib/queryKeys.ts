/**
 * The names of the things the server knows.
 *
 * A key is an identity, not a label: two surfaces asking for the same key
 * are asking for the same fact, which is what makes the nav badge and the
 * page it links to incapable of disagreeing. It is also why there is one
 * request rather than two — whoever asks first fetches, whoever asks second
 * joins that request, and the answer arrives at both.
 */
export const queryKeys = {
  notifications: ['notifications'] as const,
  /** The empty search is the unfiltered list — the one the badge counts. */
  conversations: (search = '') => ['conversations', search] as const,
  /**
   * Every conversation list at once, whatever each is filtered to. A reply
   * changes who is waiting and what was last said, which is true of the
   * unfiltered list AND of every search that person appears in — so the
   * thing a send invalidates is the prefix, not one key.
   */
  conversationLists: ['conversations'] as const,
  contact: (contactId: string) => ['contact', contactId] as const,
};
