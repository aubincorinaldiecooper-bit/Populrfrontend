import type React from 'react';
import { describe, it, expect } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { FlowNodeCard, type FlowNodeData } from '../components/automation-builder/FlowNodeCard';
import { useNodeEntrance, NODE_STAGGER_MS } from '../lib/nodeEntrance';
import type { FlowNode } from '../lib/flowSchema';

/* Which steps animate in, and which don't.
 *
 * The rule is narrow on purpose. Steps that ARRIVE animate — that is what says
 * "Populr just made these, in this order" rather than "this page already had
 * four steps on it". Steps that were already on the canvas when it opened do
 * not: an existing automation cascading in every single time you open it would
 * make the tool feel slow at exactly the moment it should feel instant.
 *
 * The delays are computed during render rather than in an effect, because a
 * node's delay has to be on the very paint it first appears in — a frame late
 * and the stagger stutters. That makes idempotence load-bearing: re-rendering
 * with the same steps must not re-stage them, or every unrelated state change
 * in the builder would replay the whole animation.
 */

describe('staging the steps that arrive', () => {
  it('treats whatever is already on the canvas as already there', () => {
    const { result } = renderHook(() => useNodeEntrance(['trigger', 'send']));
    expect([...result.current.keys()]).toEqual([]);
  });

  it('stages the ones that arrive, in the order they run', () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useNodeEntrance(ids),
      { initialProps: { ids: [] as string[] } },
    );

    rerender({ ids: ['trigger', 'send', 'wait'] });

    expect(result.current.get('trigger')).toBe(0);
    expect(result.current.get('send')).toBe(NODE_STAGGER_MS);
    expect(result.current.get('wait')).toBe(NODE_STAGGER_MS * 2);
  });

  it('does not re-stage them when something unrelated re-renders', () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useNodeEntrance(ids),
      { initialProps: { ids: [] as string[] } },
    );
    rerender({ ids: ['trigger', 'send'] });

    // A save, a selection, a drag — the builder re-renders constantly.
    rerender({ ids: ['trigger', 'send'] });
    rerender({ ids: ['trigger', 'send'] });

    expect(result.current.get('trigger')).toBe(0);
    expect(result.current.get('send')).toBe(NODE_STAGGER_MS);
  });

  it('stages only the new one when a step is added to a built automation', () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useNodeEntrance(ids),
      { initialProps: { ids: ['trigger', 'send'] } },
    );

    rerender({ ids: ['trigger', 'send', 'wait'] });

    expect(result.current.has('trigger')).toBe(false);
    expect(result.current.has('send')).toBe(false);
    expect(result.current.get('wait')).toBe(0);
  });

  it('forgets a step that was removed, so undoing brings it back visibly', () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useNodeEntrance(ids),
      { initialProps: { ids: ['trigger', 'send'] } },
    );

    rerender({ ids: ['trigger'] });
    rerender({ ids: ['trigger', 'send'] });

    expect(result.current.get('send')).toBe(0);
  });
});

const step: FlowNode = {
  id: 'send', type: 'send', position: { x: 0, y: 0 },
  config: { kind: 'dm', text: 'Here you go' },
};

function renderCard(over: Partial<FlowNodeData> = {}) {
  const data: FlowNodeData = {
    node: step, selected: false, highlighted: false, problem: null,
    enterDelay: null, post: null, onAddAfter: () => {}, hasOutgoing: () => false,
    ...over,
  };
  return render(
    <ReactFlowProvider>
      {/* React Flow hands the node its data; everything else it passes is
          irrelevant to what this card renders. */}
      <FlowNodeCard {...({ data } as unknown as React.ComponentProps<typeof FlowNodeCard>)} />
    </ReactFlowProvider>,
  );
}

describe('a step arriving on the canvas', () => {
  it('waits its turn before appearing', () => {
    const { container } = renderCard({ enterDelay: 140 });
    const card = container.querySelector('.relative') as HTMLElement;

    expect(card.className).toContain('pop-node-in');
    expect(card.style.animationDelay).toBe('140ms');
  });

  it('but a step that was already here just is', () => {
    const { container } = renderCard();
    const card = container.querySelector('.relative') as HTMLElement;

    expect(card.className).not.toContain('pop-node-in');
    expect(card.style.animationDelay).toBe('');
  });
});

describe('a step Populr needs something about', () => {
  it('carries a marker that survives being zoomed out', () => {
    // The message is printed on the card too, but at anything under full zoom
    // it is unreadable — which is exactly when a creator is looking at the
    // whole automation wondering which step the bell means.
    const { container } = renderCard({ problem: 'Choose which account this watches.' });

    expect(screen.getByText('Choose which account this watches.')).toBeInTheDocument();
    expect(container.querySelector('.bg-\\[\\#E8A33D\\]')).not.toBeNull();
  });

  it('and no marker when nothing is being asked', () => {
    const { container } = renderCard();
    expect(container.querySelector('.bg-\\[\\#E8A33D\\]')).toBeNull();
  });
});
