import type { Person } from './api';

/**
 * How Populr names a teammate on screen.
 *
 * There are three things we might know and no guarantee of any of them: the
 * name they signed in with, the address the invitation went to, and nothing.
 * The order matters — the invited address is where an invite was SENT, which
 * is not always where the person who accepted it lives — and the last step
 * matters most: the fallback is a word, never an account id. An id is not a
 * name, and a team page that shows one has stopped naming people.
 */
export function displayName(person: Person | null | undefined): string {
  return person?.name?.trim() || person?.email?.trim() || 'A teammate';
}

/**
 * The line under the name, when there is one worth adding.
 *
 * Null when the address is already what we're calling them — repeating it
 * under itself is the kind of detail that makes a roster look automated.
 */
export function contactLine(person: Person | null | undefined): string | null {
  const email = person?.email?.trim();
  if (!email) return null;
  return person?.name?.trim() ? email : null;
}
