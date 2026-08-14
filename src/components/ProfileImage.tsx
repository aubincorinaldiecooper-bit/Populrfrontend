import { useState, type CSSProperties, type ReactNode } from 'react';

/**
 * A profile picture that knows how to not be one.
 *
 * Platform avatar URLs are signed and short-lived — Instagram's expire — so a
 * URL that worked when we stored it can 403 weeks later. A bare <img> answers
 * that with the browser's torn-image glyph, which reads as "Populr is broken"
 * rather than "we don't have a photo of this person".
 *
 * Each surface keeps its own fallback, because they genuinely differ: a
 * contact falls back to their initial, a connected account to its platform
 * mark. This owns only the part that was being repeated and forgotten —
 * noticing the image didn't load, and stepping out of the way when it didn't.
 */

export interface ProfileImageProps {
  src: string | null | undefined;
  /** Shown when there is no src, or when the one we had fails to load. */
  fallback: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Decorative by default: the name is always beside it in the same block. */
  alt?: string;
}

export default function ProfileImage({ src, fallback, className, style, alt = '' }: ProfileImageProps) {
  // WHICH url failed, not whether one did.
  //
  // A boolean looks equivalent and isn't: rows are recycled as the creator
  // scrolls, so this component survives the person in it changing. A flag set
  // by one broken avatar would still be set for whoever took that slot next,
  // and they would render as initials forever despite having a working
  // picture. Keying the <img> doesn't help — the state lives out here, and
  // the element remounting doesn't reset it.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) return <>{fallback}</>;

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailedSrc(src)}
      // Platform CDNs reject requests carrying our origin as the referrer,
      // which is one of the ways these 403 for no other reason.
      referrerPolicy="no-referrer"
      className={className}
      style={style}
    />
  );
}
