import ProfileImage from '../ProfileImage';
import { platformMeta } from '../../lib/platformMeta';

/**
 * The person, at whatever size the surface needs.
 *
 * One component because the same face appears in four places now — the
 * conversation list, the conversation header, the contact panel and the
 * top-bar drawer — and four hand-rolled circles would drift apart on the
 * fallback, which is the case that actually shows up. Platforms don't always
 * give us an avatar, so initials are the normal state, not the error state.
 *
 * The platform badge is optional and small: in a list where every row is
 * Instagram it is noise, and on a contact panel it is the answer to "where do
 * I know them from".
 */

export interface AvatarProps {
  handle: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  platform?: string | null;
  size?: 'sm' | 'md' | 'lg';
  /** Show the small platform mark at the corner. */
  showPlatform?: boolean;
}

const SIZES = {
  sm: { box: 'w-8 h-8', text: 'text-[11px]', badge: 12 },
  md: { box: 'w-10 h-10', text: 'text-[13px]', badge: 13 },
  lg: { box: 'w-14 h-14', text: 'text-[17px]', badge: 15 },
} as const;

/** First letter of whatever we know them by. Never the empty string. */
function initial(handle: string | null, name?: string | null): string {
  const source = (name?.trim() || handle?.trim() || '').replace(/^@+/, '');
  return source ? source[0]!.toUpperCase() : '?';
}

export default function Avatar({
  handle, name, avatarUrl, platform, size = 'md', showPlatform = false,
}: AvatarProps) {
  const s = SIZES[size];
  const PlatformIcon = platform ? platformMeta(platform).icon : null;

  // Spans, not divs: every surface that uses this puts it inside a <button>,
  // and a button may only contain phrasing content.
  return (
    <span className={`relative block shrink-0 ${s.box}`}>
      <ProfileImage
        src={avatarUrl}
        className={`${s.box} rounded-full object-cover bg-[#F0EDE8]`}
        fallback={
          <span
            aria-hidden
            className={`${s.box} ${s.text} rounded-full bg-[#F0EDE8] text-[#6B6B6B]
              font-semibold flex items-center justify-center select-none`}
          >
            {initial(handle, name)}
          </span>
        }
      />
      {showPlatform && PlatformIcon && (
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-[2px]
            ring-1 ring-[#EFECE6]"
        >
          <PlatformIcon size={s.badge} className="text-[#6B6B6B]" />
        </span>
      )}
    </span>
  );
}
