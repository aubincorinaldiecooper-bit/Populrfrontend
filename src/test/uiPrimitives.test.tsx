import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, buttonVariants } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Switch } from '../components/ui/switch';
import { Separator } from '../components/ui/separator';
import { Skeleton } from '../components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip';

/* The primitive layer's contract, pinned once.
 *
 * These are deliberately shallow: pages own their behavior tests; this file
 * only guarantees that the foundation stays a foundation — a Button never
 * silently becomes a submit button, a Checkbox always answers to the
 * keyboard, a Tooltip actually appears. If one of these fails, every later
 * migration PR is building on sand.
 */

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('lime is the default; the other variants exist and differ', () => {
    expect(buttonVariants()).toContain('bg-primary');
    expect(buttonVariants({ variant: 'secondary' })).toContain('bg-secondary');
    expect(buttonVariants({ variant: 'outline' })).toContain('border');
    expect(buttonVariants({ variant: 'destructive' })).toContain('bg-destructive');
    expect(buttonVariants({ variant: 'ghost' })).not.toContain('bg-primary');
  });

  it('a caller className wins over the primitive (tailwind-merge)', () => {
    render(<Button className="px-2">Tight</Button>);
    const cls = screen.getByRole('button', { name: 'Tight' }).className;
    expect(cls).toContain('px-2');
    expect(cls).not.toContain('px-5');
  });

  it('disabled is real, not just visual', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button disabled onClick={onClick}>Nope</Button>);
    await user.click(screen.getByRole('button', { name: 'Nope' })).catch(() => {});
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('form primitives', () => {
  it('Label reaches its Input through htmlFor', () => {
    render(
      <div>
        <Label htmlFor="email">Their email</Label>
        <Input id="email" placeholder="teammate@example.com" />
      </div>,
    );
    expect(screen.getByLabelText('Their email')).toHaveAttribute(
      'placeholder',
      'teammate@example.com',
    );
  });

  it('Checkbox toggles by click and reports through onCheckedChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Checkbox aria-label="Edit automations" onCheckedChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Edit automations' });
    expect(box).toHaveAttribute('aria-checked', 'false');
    await user.click(box);
    expect(box).toHaveAttribute('aria-checked', 'true');
    expect(onChange).toHaveBeenCalledWith(true, expect.anything());
  });

  it('Switch answers the keyboard', async () => {
    const user = userEvent.setup();
    render(<Switch aria-label="Pause automations" />);
    const sw = screen.getByRole('switch', { name: 'Pause automations' });
    sw.focus();
    await user.keyboard(' ');
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Tooltip', () => {
  it('appears on focus and is tied to its trigger', async () => {
    render(
      <TooltipProvider delay={0}>
        <Tooltip>
          <TooltipTrigger render={<button>Pause</button>} />
          <TooltipContent>Pause this automation</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    screen.getByRole('button', { name: 'Pause' }).focus();
    await waitFor(() => expect(screen.getByText('Pause this automation')).toBeInTheDocument());
  });
});

describe('structure primitives', () => {
  it('Separator carries the separator role', () => {
    render(<Separator />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('Skeleton is invisible to assistive tech and shimmers the Populr way', () => {
    const { container } = render(<Skeleton className="h-4 w-24" />);
    const el = container.firstElementChild!;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el.className).toContain('pop-skeleton');
  });
});

/* The toast door: feature code calls AppContext.showToast exactly as it
 * always has; Sonner renders. The adapter must hand Sonner the message,
 * the type, AND the action — toast-with-Undo is a load-bearing pattern
 * (deleting an automation offers its restoration there). */
describe('showToast → Sonner adapter', () => {
  it('maps message, type, duration and the Undo action through', async () => {
    vi.resetModules();
    const sonnerMock = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      dismiss: vi.fn(),
    };
    vi.doMock('sonner', () => ({ toast: sonnerMock, Toaster: () => null }));
    vi.doMock('../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
    const { AppProvider, useApp } = await import('../context/AppContext');

    const onUndo = vi.fn();
    function Fire() {
      const { showToast, toasts } = useApp();
      return (
        <div>
          <button onClick={() => showToast('Automation removed', 'success', { action: { label: 'Undo', onClick: onUndo } })}>
            fire
          </button>
          <span data-testid="mirror">{toasts.map(t => t.message).join('|')}</span>
        </div>
      );
    }
    const user = userEvent.setup();
    render(
      <AppProvider>
        <Fire />
      </AppProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'fire' }));

    expect(sonnerMock.success).toHaveBeenCalledWith(
      'Automation removed',
      expect.objectContaining({
        duration: 7000,
        action: expect.objectContaining({ label: 'Undo' }),
      }),
    );
    // The observable record keeps working — anything reading `toasts`
    // (tests included) sees what was raised.
    expect(screen.getByTestId('mirror')).toHaveTextContent('Automation removed');
    vi.doUnmock('sonner');
    vi.doUnmock('../context/AuthContext');
  });
});
