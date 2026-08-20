import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
 * from, and — for someone who may only read — exactly one command, because
 * saying something about a step is not changing it.
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

describe('leaving a note on a step', () => {
  it('offers it beside the things you do to a step', async () => {
    const { container } = renderCard({ onLeaveNote: () => {} });
    const menu = await openMenu(container);
    expect(within(menu).getByRole('menuitem', { name: 'Leave a note' })).toBeInTheDocument();
  });

  it('reports the point that was actually right-clicked', async () => {
    const onLeaveNote = vi.fn();
    const { container } = renderCard({ onLeaveNote });
    // The card records the pointer as the menu opens; by the time an item is
    // clicked the event is long gone, and a note placed at "wherever the menu
    // ended up" is not a note about the thing that was pointed at.
    fireEvent.contextMenu(container.firstElementChild as HTMLElement, { clientX: 412, clientY: 233 });
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Leave a note' }));

    expect(onLeaveNote).toHaveBeenCalledWith('send', { x: 412, y: 233 });
  });

  it('is the ONE thing a view-only guest is offered', async () => {
    const { container } = renderCard({ readOnly: true, onLeaveNote: () => {} });
    const menu = await openMenu(container);

    // They used to get no menu at all — right, when every command in it
    // would have been refused. One of them isn't.
    expect(within(menu).getByRole('menuitem', { name: 'Leave a note' })).toBeInTheDocument();
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
    expect(within(menu).queryByRole('menuitem', { name: /Remove this step/ })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /After this step/ })).not.toBeInTheDocument();
  });

  it('still gives a view-only guest nothing when notes are unavailable', async () => {
    const { container } = renderCard({ readOnly: true });
    fireEvent.contextMenu(container.firstElementChild as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});

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
