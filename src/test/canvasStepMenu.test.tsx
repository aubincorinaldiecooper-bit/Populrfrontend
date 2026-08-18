import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { FlowNodeCard, type FlowNodeData } from '../components/automation-builder/FlowNodeCard';
import type { FlowNode } from '../lib/flowSchema';

/* The commands a step carries, reached by right-click.
 *
 * The hover controls are the discoverable path and stay exactly as they
 * were; this is the fast one — and on a phone, where nothing hovers, the
 * long-press this menu also answers to is the ONLY one. What it offers has
 * to agree with what the canvas would allow: no second step on a branch
 * that already has one, no removing the When step the automation starts
 * from, and nothing at all for someone who may only read.
 */

function stepOf(over: Partial<FlowNode> = {}): FlowNode {
  return {
    id: 'send', type: 'send', position: { x: 0, y: 0 },
    config: { kind: 'dm', text: 'Here you go' },
    ...over,
  } as FlowNode;
}

function renderCard(over: Partial<FlowNodeData> = {}) {
  const data: FlowNodeData = {
    node: stepOf(), selected: false, highlighted: false, problem: null,
    enterDelay: null, post: null, onAddAfter: () => {}, onDeleteNode: () => {},
    hasOutgoing: () => false,
    ...over,
  };
  return render(
    <ReactFlowProvider>
      <FlowNodeCard {...({ data } as unknown as React.ComponentProps<typeof FlowNodeCard>)} />
    </ReactFlowProvider>,
  );
}

/** Base UI opens the menu on contextmenu; the popup mounts asynchronously. */
async function openMenu(container: HTMLElement) {
  fireEvent.contextMenu(container.firstElementChild as HTMLElement);
  return screen.findByRole('menu');
}

describe('right-clicking a step', () => {
  it('offers the step it is on, and removes that step — not the selected one', async () => {
    const onDeleteNode = vi.fn();
    const { container } = renderCard({ node: stepOf({ id: 'send-2' }), onDeleteNode });

    await openMenu(container);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove this step' }));

    expect(onDeleteNode).toHaveBeenCalledWith('send-2');
  });

  it('adds a step on the branch that is still free, and never on a taken one', async () => {
    const onAddAfter = vi.fn();
    const { container } = renderCard({
      node: stepOf({ id: 'if-1', type: 'condition', config: { kind: 'replied' } }),
      // Yes already leads somewhere; No is still open.
      hasOutgoing: (_id, branch) => branch === 'yes',
      onAddAfter,
    });

    await openMenu(container);
    expect(screen.queryByRole('menuitem', { name: 'On Yes' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'On No' }));

    expect(onAddAfter).toHaveBeenCalledWith('if-1', 'no');
  });

  it('never offers to remove the step the automation starts from', async () => {
    const { container } = renderCard({
      node: stepOf({ id: 'trigger', type: 'trigger', config: { kind: 'comment', allPosts: true } }),
    });

    await openMenu(container);
    expect(screen.getByRole('menuitem', { name: 'After this step' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Remove this step' })).not.toBeInTheDocument();
  });

  it('offers nothing at all to someone who may only read', async () => {
    const { container } = renderCard({ readOnly: true });

    fireEvent.contextMenu(container.firstElementChild as HTMLElement);
    // Nothing to wait for — but give the menu a chance to appear if it would.
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});
