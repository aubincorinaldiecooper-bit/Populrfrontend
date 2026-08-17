import { cn } from '@/lib/utils';

/**
 * Loading placeholder in Populr's shimmer (the pop-skeleton sweep) — a
 * quiet background pass, not shadcn's whole-element pulse, which makes a
 * dense list throb. Under prefers-reduced-motion the sweep collapses to a
 * flat tint via the global rule; layout still holds.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('pop-skeleton rounded-lg', className)} {...props} />;
}

export { Skeleton };
