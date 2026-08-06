import type { CSSProperties } from 'react';

/**
 * The X brand glyph. lucide-react only ships the legacy Twitter bird (and
 * `X`, which is its close/dismiss icon, not the brand) — the beta renames
 * the platform to "X" everywhere users can see it, so the icon has to
 * follow. Prop-compatible with how LucideIcon is used across the app
 * (size / className / style with `color` picked up via currentColor).
 */
export default function XLogo({
  size = 24,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" />
    </svg>
  );
}
