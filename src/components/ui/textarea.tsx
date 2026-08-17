import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      `w-full min-h-[72px] rounded-xl border border-input bg-card px-4 py-2.5
       text-sm text-foreground placeholder:text-foreground-subtle transition-all
       disabled:cursor-not-allowed disabled:opacity-60`,
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
