import * as React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * A search field: the magnifying glass, and the room it needs.
 *
 * This was a class (`pop-search`) whose entire job was to leave 36px of
 * left padding for an icon each caller drew separately — the class knew
 * about the icon, the icon didn't know about the class, and nothing kept
 * them in step. As a composition there is one thing to place, it carries
 * `type="search"` and its own accessible name, and it inherits every
 * change to the Input primitive underneath it.
 */
const SearchInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentPropsWithoutRef<typeof Input>, 'type'>
>(function SearchInput({ className, 'aria-label': ariaLabel, placeholder, ...props }, ref) {
  return (
    <div className="relative">
      <Search
        size={15}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-subtle"
      />
      <Input
        ref={ref}
        type="search"
        // A placeholder is not a label — it leaves with the first keystroke.
        aria-label={ariaLabel ?? placeholder ?? 'Search'}
        placeholder={placeholder}
        className={cn('pl-9', className)}
        {...props}
      />
    </div>
  );
});

export { SearchInput };
