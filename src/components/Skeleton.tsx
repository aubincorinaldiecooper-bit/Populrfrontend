/**
 * Loading placeholders shaped like the content that's arriving.
 *
 * Every page previously showed a centered spinner over an empty page, so the
 * layout jumped when data landed and nothing hinted at what was coming. These
 * hold the real shape instead: same row heights, same grid, same card
 * chrome — the page fills in rather than reflowing.
 *
 * Deliberately not shadcn's ui/skeleton.tsx, which pulses `bg-accent` — that
 * token is Populr's lime (#C5FF3D), so a loading list would strobe brand
 * green. These use the warm neutrals the surfaces are already built from.
 *
 * The shimmer is a background sweep rather than an opacity pulse: it reads as
 * quieter at this density, and it collapses to a flat tint under
 * prefers-reduced-motion (see index.css).
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`pop-skeleton ${className}`} />;
}

/**
 * One list row: media square, two text lines, trailing action. Matches the
 * automation/contact/draft row cards, which all share this anatomy.
 */
function ListRow({ compact = false }: { compact?: boolean }) {
  return (
    <div className="pop-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 rounded w-[45%]" />
            <Skeleton className="h-3 rounded w-[28%]" />
            {!compact && (
              <div className="flex gap-1.5 pt-0.5">
                <Skeleton className="h-4 w-14 rounded-full" />
                <Skeleton className="h-4 w-10 rounded-full" />
              </div>
            )}
          </div>
        </div>
        <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
      </div>
    </div>
  );
}

/**
 * `count` rows of the list shape above. Rows are identical on purpose —
 * randomized widths draw the eye to the placeholder instead of past it.
 */
export function ListSkeleton({ count = 4, compact = false, label = 'Loading' }: {
  count?: number; compact?: boolean; label?: string;
}) {
  return (
    <div className="space-y-3" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: count }, (_, i) => <ListRow key={i} compact={compact} />)}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Rows inside an existing bordered container (Contacts' table-style card). */
export function TableSkeleton({ count = 6, label = 'Loading' }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-[#F0EEEA] last:border-0">
          <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-3.5 rounded w-[30%]" />
            <Skeleton className="h-3 rounded w-[18%]" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full flex-shrink-0" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** The wizard's post-selection grid — square thumbnail over a caption line. */
export function PostGridSkeleton({ count = 6, label = 'Loading your posts' }: {
  count?: number; label?: string;
}) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 gap-3"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="pop-card overflow-hidden">
          <Skeleton className="w-full aspect-square rounded-none" />
          <div className="p-2.5 space-y-1.5">
            <Skeleton className="h-3 rounded w-[80%]" />
            <Skeleton className="h-2.5 rounded w-[45%]" />
          </div>
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Stat tiles on Home. */
export function StatGridSkeleton({ count = 4, label = 'Loading your numbers' }: {
  count?: number; label?: string;
}) {
  return (
    <div
      className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="pop-card p-4 space-y-2.5">
          <Skeleton className="h-3 rounded w-[55%]" />
          <Skeleton className="h-6 rounded w-[35%]" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
