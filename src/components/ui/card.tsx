import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * The surface almost everything in Populr sits on: off-white, softly
 * bordered, generously rounded. It existed as a CSS class (`pop-card`) that
 * every page repeated by name; as a component it can carry the behaviours
 * that came with it — the hover lift a clickable card wants, the selected
 * state a choice wants — instead of each page remembering a second class.
 *
 * `interactive` is for a card that DOES something when clicked. It lifts a
 * single pixel, which is deliberately almost imperceptible: on a list, the
 * point is that the row under the cursor separates from the page, not that
 * it announces itself. Only the three properties that change are
 * transitioned, and the movement is motion-safe.
 */
/**
 * The surface as a class string, for the elements that can't be a div: a
 * <section> that means a section, a <Link> that means a link. Same rule as
 * buttonVariants — one definition, worn by whatever element the meaning
 * requires.
 */
const cardVariants = cva('rounded-2xl border bg-card shadow-card', {
  variants: {
    interactive: {
      true: `transition-[transform,box-shadow,border-color] duration-200 ease-out
             hover:shadow-card-hover motion-safe:hover:-translate-y-px
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chartreuse/50`,
      false: '',
    },
    selected: {
      true: 'border-chartreuse ring-2 ring-chartreuse/25',
      false: 'border-border/80',
    },
  },
  compoundVariants: [
    { interactive: true, selected: false, class: 'hover:border-border-strong' },
  ],
  defaultVariants: { interactive: false, selected: false },
});

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>
>(function Card({ interactive = false, selected = false, className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-selected={selected || undefined}
      className={cn(cardVariants({ interactive, selected }), className)}
      {...props}
    />
  );
});

export { Card, cardVariants };
