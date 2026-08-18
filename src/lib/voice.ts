/**
 * The line between Populr talking and software talking.
 *
 * A creator's screen only ever shows sentences written for a creator. Any
 * text that arrives from outside the interface — a backend message, a
 * provider echo, a stored warning — passes through `isCreatorSafe` before it
 * is rendered, and text that reads like software (provider names, HTTP,
 * endpoints, status codes) is replaced by a calm generic sentence instead.
 *
 * This is a leaf module on purpose: the API client and the error-copy map
 * both need it, and neither should import the other for it.
 */

/** Markers that mean "software talking" — never shown to a creator. A bare
 *  number is NOT a marker ("Instagram allows 500 characters" is fine), and
 *  neither is "http://" in an instruction about typing an address ("a full
 *  http:// or https:// address") — but a real URL (protocol + host) or
 *  HTTP-failure phrasing is. */
const TECHNICAL =
  /\b(?:zernio|provider|endpoint|webhook|payload|api\b|https?:\/\/[^\s/]|http\s+(?:error|request|status|\d)|status\s*code|failed with \d+|error \d+|json\b|sql\b|undefined\b|null\b)/i;

/** A SCREAMING_SNAKE identifier is also software talking: env vars and
 *  error codes wear that shape and nothing Populr says to a creator does.
 *  This class walked through both filters once — an invite error that named
 *  the env var it wanted set. Case-sensitive on purpose: "first_name" in a
 *  hint is Populr talking; POPULR_FRONTEND_URL never is. */
const IDENTIFIER = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;

/** The one sentence that stands in when a message can't be shown. */
export const GENERIC_ERROR = "Couldn't finish that. Try again in a moment.";

export const UNREACHABLE_ERROR =
  "Populr couldn't reach the server. Check your connection and try again.";

/** True when a sentence is safe to show a creator as-is. */
export function isCreatorSafe(text: string | null | undefined): text is string {
  return (
    typeof text === 'string' &&
    text.trim().length > 0 &&
    text.length <= 240 &&
    !TECHNICAL.test(text) &&
    !IDENTIFIER.test(text)
  );
}
