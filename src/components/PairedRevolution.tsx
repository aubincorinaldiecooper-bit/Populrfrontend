/**
 * The orbiting loader.
 *
 * Two dots circling a fixed centre, half a revolution apart. Used where Populr
 * is working on something the creator asked for and can't be shown a real
 * percentage — building an automation, running a preview — because a spinner
 * that pretends to measure progress it can't see is worse than one that
 * doesn't claim to.
 *
 * Colour comes from `currentColor`, so a caller sets it the way it sets text:
 * ink on the canvas, lime on a dark surface. Nothing here hard-codes a hue.
 */

export type LoaderSize = 'sm' | 'md' | 'lg' | 'xl';

export interface PairedRevolutionProps {
  size?: LoaderSize;
  className?: string;
  /** Announced to screen readers; the visual is decorative on its own. */
  label?: string;
}

const SIZES: Record<LoaderSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
};

/** Shared by both dots — they differ only by half the cycle. */
const DOT = {
  width: '25%',
  height: '25%',
  top: '50%',
  left: '50%',
  transform: 'rotate(0deg) translate(155%)',
  animation: 'pairedRevolution 1.4s ease infinite',
  marginTop: '-12.5%',
  marginLeft: '-12.5%',
} as const;

export default function PairedRevolution({
  size = 'md', className = '', label,
}: PairedRevolutionProps) {
  return (
    <div
      className={`${SIZES[size]} relative flex items-center justify-center ${className}`}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* Scoped by an app-specific animation name rather than a generic one,
          so it can't collide with a keyframe set defined elsewhere. */}
      <style>{`
        @keyframes pairedRevolution {
          100% { transform: rotate(360deg) translate(155%); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes pairedRevolution {
            0%, 100% { transform: rotate(0deg) translate(155%); }
          }
        }
      `}</style>
      <div className="absolute rounded-full bg-current" style={{ width: '25%', height: '25%', zIndex: 10 }} />
      <div className="absolute w-full h-full">
        <div className="absolute rounded-full bg-current" style={DOT} />
        <div className="absolute rounded-full bg-current" style={{ ...DOT, animationDelay: '0.7s' }} />
      </div>
    </div>
  );
}
