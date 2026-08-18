/**
 * The names of the things the server knows.
 *
 * A key is an identity, not a label: two surfaces asking for the same key
 * are asking for the same fact, which is what makes the nav badge and the
 * page it links to incapable of disagreeing. It's also what lets one of
 * them answer for both — the Inbox page's own fetch seeds the key the badge
 * reads, and a page opened while the badge is already loading joins the
 * request in flight instead of starting a second one.
 */
export const queryKeys = {
  notifications: ['notifications'] as const,
  /** The empty search is the unfiltered list — the one the badge counts. */
  conversations: (search = '') => ['conversations', search] as const,
  contact: (contactId: string) => ['contact', contactId] as const,
};
