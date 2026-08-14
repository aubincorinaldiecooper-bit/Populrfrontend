import { platformMeta } from './platformMeta';

/**
 * A link to someone's profile on the platform they messaged from — but only
 * when we actually know it.
 *
 * The handle here is not a guess. It arrives on the webhook that delivered
 * their message, attached to the platform's own id for that user, so it names
 * the person Populr is talking to. What this function refuses to do is the
 * other thing: constructing a URL for a platform whose profile URLs can't be
 * built from a handle, and quietly sending a creator to a stranger.
 *
 * Facebook is the one that matters. A Facebook contact can be a person or a
 * page, its profile lives under a numeric id as often as a vanity name, and
 * the handle we hold is frequently neither — so there is no shape to build.
 * No link is the honest answer, and the panel simply doesn't offer one.
 */

const URL_SHAPE: Record<string, (handle: string) => string> = {
  instagram: h => `https://instagram.com/${h}`,
  twitter: h => `https://x.com/${h}`,
  tiktok: h => `https://tiktok.com/@${h}`,
  linkedin: h => `https://linkedin.com/in/${h}`,
};

export interface ExternalProfile {
  url: string;
  /** "View on Instagram" — the platform's display name, never its internal id. */
  label: string;
}

export function externalProfile(
  platform: string | null | undefined,
  handle: string | null | undefined,
): ExternalProfile | null {
  if (!platform || !handle) return null;
  const clean = handle.trim().replace(/^@+/, '');
  // A handle with a slash or a space isn't a handle; it's something else that
  // ended up in the field, and interpolating it would build a URL to anywhere.
  if (!clean || !/^[A-Za-z0-9._-]+$/.test(clean)) return null;

  const shape = URL_SHAPE[platform];
  if (!shape) return null;

  return { url: shape(clean), label: `View on ${platformMeta(platform).name}` };
}
