import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The margin every page is written inside: comfortable padding, wider on a
 * large screen, and a maximum width so a line of text never runs the whole
 * span of a monitor.
 *
 * A page that wants to be narrower says so — `className="max-w-[720px]"`
 * merges over the default rather than fighting it, which is why this takes
 * a className at all instead of a size prop: the widths in use are chosen
 * per page from what the content is, not from a scale.
 */
const Page = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Page({ className, ...props }, ref) {
    return (
      <div ref={ref} className={cn('mx-auto max-w-[1200px] p-6 lg:p-8', className)} {...props} />
    );
  },
);

export { Page };
