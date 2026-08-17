import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Populr's Button. One implementation, five variants — the same hierarchy
 * the pop-btn-* classes established, expressed through the token layer:
 *
 *  - default:     lime, charcoal text — the ONE action that matters here
 *  - secondary:   charcoal fill — strong but not the headline
 *  - outline:     bordered, quiet — the workhorse tertiary action
 *  - ghost:       text only — actions that shouldn't add chrome
 *  - destructive: red fill — deletion and its relatives
 *
 * For link-shaped buttons use `buttonVariants()` on a <Link>/<a> rather
 * than nesting a button in an anchor:
 *
 *   <Link to="/x" className={buttonVariants({ variant: 'outline' })}>…
 */
const buttonVariants = cva(
  `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl
   text-sm font-semibold transition-all
   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chartreuse/50
   focus-visible:ring-offset-2 focus-visible:ring-offset-cream
   disabled:pointer-events-none disabled:opacity-60
   [&_svg]:pointer-events-none [&_svg]:shrink-0`,
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-chartreuse-hover',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-[#333]',
        outline: 'border border-border bg-transparent font-medium text-foreground hover:bg-muted',
        ghost: 'font-medium text-muted-foreground hover:text-foreground hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'px-5 py-2.5',
        sm: 'px-3.5 py-2 text-[12.5px]',
        lg: 'px-6 py-3',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    // type="button" by default: almost every Button in Populr lives outside
    // a form, and the browser's implicit type="submit" has caused real
    // accidental submits. Forms opt in explicitly with type="submit".
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export { Button, buttonVariants };
