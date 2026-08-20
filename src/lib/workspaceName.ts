/**
 * A workspace's name, but only if it is one.
 *
 * The server decides what a workspace is called and now sends a real answer.
 * This is the second line: the same rule, applied where the text is actually
 * painted, so a cached payload from before the fix, a browser tab left open
 * across a deploy, or a future column that starts arriving raw cannot put an
 * internal id on screen again.
 *
 * That last case is the reason this exists rather than trusting the server.
 * The workspace label was an internal id in the switcher, in the sidebar, in
 * the notice you get when your access ends, and in the subject line of every
 * invitation email — for months, with nobody noticing, because each surface
 * simply rendered the string it was handed. A rule that lives only at the
 * source is a rule that holds only until the next surface is written.
 *
 * Kept a leaf module, like lib/voice.ts, for the same reason: several
 * components need it and none of them should import each other for it.
 */

/** The label the backend writes for a new per-user workspace. `krew-` is the
 *  same shape under the product's former name. */
const INTERNAL_LABEL = /^(?:populr|krew)-user-/i;

/** An address is not a name — and usually somebody else's address at that. */
const EMAIL_SHAPED = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A token with digits scattered through it: generated, not typed.
 *
 * This began as "long, no spaces, mixed case, has a digit", which is also an
 * exact description of `Formula1RacingAcademy`. Review caught it, and it was
 * this same bug wearing the other coat — a product refusing to say the name
 * its creator chose. Erasing somebody's own words is worse than the false
 * negative the broad rule was guarding against.
 *
 * The real difference is WHERE the digits sit. A person puts a number in one
 * place: Formula1Racing, Populr2026, Studio 54. A base62 id scatters them —
 * the reported label had three separate digit runs in thirty-two characters.
 * Three runs is the bar, and no typed name reaches it by accident.
 *
 * See services/workspaceLabel.ts in the backend: same rule, same reasoning,
 * and it must stay the same rule.
 */
// `\D+` between the runs, not `\D*`: with the latter "2026" counts as three
// adjacent runs and Populr2026Enterprise is read as an id. The separator has
// to be real.
const SCATTERED_DIGITS = /^(?=\D*\d+(?:\D+\d+){2})\S{20,}$/;

/** True when this string is machinery rather than something to show. */
export function looksInternal(name: string | null | undefined): boolean {
  const value = name?.trim() ?? '';
  if (value === '') return true;
  return INTERNAL_LABEL.test(value) || EMAIL_SHAPED.test(value) || SCATTERED_DIGITS.test(value);
}

/**
 * What to put on screen for this workspace.
 *
 * `yours` changes only the fallback: someone looking at their own account
 * does not need to be introduced to it, and "Your workspace" is the honest
 * thing to say when nobody has given it a name.
 */
export function workspaceName(
  name: string | null | undefined,
  options: { yours?: boolean } = {},
): string {
  const value = name?.trim() ?? '';
  if (!looksInternal(value)) return value;
  return options.yours ? 'Your workspace' : 'A shared workspace';
}
