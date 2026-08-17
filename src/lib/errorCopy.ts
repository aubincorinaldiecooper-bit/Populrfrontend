import { ApiError } from './api';
import { GENERIC_ERROR, UNREACHABLE_ERROR, isCreatorSafe } from './voice';

/**
 * Populr's words for known failure codes, plus the last-resort filter for
 * everything else. The API client already refuses to construct an ApiError
 * with software-talk in its message (lib/api.ts + lib/voice.ts), so most
 * callers can keep rendering err.message; this map is for surfaces that want
 * more specific copy for a code than the backend sentence.
 */

const CODE_COPY: Record<string, string> = {
  channel_unavailable: "Couldn't finish that. Try again in a moment.",
  internal_error: "Something went wrong on Populr's side. Try again in a moment.",
  subscription_required: 'This needs an active Populr subscription.',
  not_found: "That's gone — it may have been deleted.",
};

/**
 * The one sentence to show for `err`. Pass a `fallback` when the surface has
 * a better generic sentence than the default ("Couldn't send that…").
 */
export function errorMessage(err: unknown, fallback: string = GENERIC_ERROR): string {
  if (err instanceof ApiError) {
    if (err.code && CODE_COPY[err.code]) return CODE_COPY[err.code];
    if (isCreatorSafe(err.message)) return err.message;
    return fallback;
  }
  // A fetch that never reached Populr surfaces as a TypeError in every
  // browser; "Failed to fetch" is not a sentence anyone should read.
  if (err instanceof TypeError) return UNREACHABLE_ERROR;
  if (err instanceof Error && isCreatorSafe(err.message)) return err.message;
  return fallback;
}
