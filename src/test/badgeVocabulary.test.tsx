import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../components/ui/badge';
import StatusPill from '../components/StatusPill';
import EmptyState from '../components/EmptyState';

/* The restrained badge vocabulary: a soft tint and a strong word. These pin
 * the tone map pages rely on — a live automation reads as success, a
 * disconnected account as trouble, an unknown status stays neutral instead
 * of guessing — and that the pill is a tint, never a saturated block. */

describe('Badge', () => {
  it('soft tints, not saturated fills', () => {
    render(<Badge variant="success">Live</Badge>);
    const el = screen.getByText('Live');
    expect(el.className).toContain('bg-success-soft');
    expect(el.className).toContain('text-success');
    expect(el.className).toContain('rounded-full');
  });
});

describe('StatusPill tone map', () => {
  const cases: Array<[string, string]> = [
    ['live', 'bg-success-soft'],
    ['active', 'bg-success-soft'],
    ['paused', 'bg-warning-soft'],
    ['draft', 'bg-muted'],
    ['disconnected', 'text-destructive'],
    ['needs-attention', 'text-destructive'],
  ];
  it.each(cases)('%s wears %s', (status, cls) => {
    const { container } = render(<StatusPill status={status} />);
    expect((container.firstElementChild as HTMLElement).className).toContain(cls);
  });

  it('an unknown status stays neutral rather than guessing', () => {
    const { container } = render(<StatusPill status="somenewthing" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('bg-muted');
  });

  it('label overrides the raw status text', () => {
    render(<StatusPill status="reconnect_required" label="Reconnect needed" />);
    expect(screen.getByText('Reconnect needed')).toBeInTheDocument();
    expect(screen.queryByText('reconnect_required')).not.toBeInTheDocument();
  });
});

describe('EmptyState without Astryx', () => {
  it('renders icon block, title, description and the action', () => {
    render(
      <EmptyState
        icon="automations"
        title="No automations yet"
        description="Describe what should happen and Populr builds the steps."
        action={<button type="button">New automation</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'No automations yet' })).toBeInTheDocument();
    expect(screen.getByText(/Populr builds the steps/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New automation' })).toBeInTheDocument();
  });
});
