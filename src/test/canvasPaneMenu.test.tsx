import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import FlowCanvas from '../components/automation-builder/FlowCanvas';
import type { FlowGraph } from '../lib/flowSchema';

/* Right-clicking a bare spot on the canvas.
 *
 * A note about nothing in particular still has to be about SOMEWHERE, and
 * the somewhere is wherever the pointer was. The menu exists so the gesture
 * announces itself — a composer appearing unbidden under the cursor is a
 * surprise — and it carries exactly one line, because there is nothing else
 * you can do to an empty patch of canvas. That is also why a view-only guest
 * gets the identical menu: saying something is not changing anything, so
 * there was never a second command to withhold from them.
 */

// React Flow measures its container on mount, and jsdom has no ResizeObserver.
// Local to this file: the app's own components branch on whether one exists,
// and a global stub would quietly change which branch every other suite takes.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const graph = {
  nodes: [{
    id: 'trigger', type: 'trigger', position: { x: 0, y: 0 },
    config: { kind: 'comment', allPosts: true },
  }],
  edges: [],
} as unknown as FlowGraph;

function renderCanvas(over: Partial<React.ComponentProps<typeof FlowCanvas>> = {}) {
  return render(
    <FlowCanvas
      graph={graph}
      selectedNodeId={null}
      highlighted={[]}
      problems={[]}
      posts={[]}
      activePath={[]}
      onSelect={() => {}}
      onMove={() => {}}
      onConnect={() => {}}
      onAddAfter={() => {}}
      onDeleteNode={() => {}}
      fitSignal={0}
      {...over}
    />,
  );
}

const pane = (container: HTMLElement) =>
  container.querySelector('.react-flow__pane') as HTMLElement;

describe('right-clicking empty canvas', () => {
  it('offers to leave a note, and nothing that would edit the graph', async () => {
    const { container } = renderCanvas({ onLeaveNoteAt: vi.fn() });
    fireEvent.contextMenu(pane(container), { clientX: 300, clientY: 200 });

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Leave a note here' })).toBeInTheDocument();
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
  });

  it('reports the spot that was pointed at, not the one before it', async () => {
    const onLeaveNoteAt = vi.fn();
    const { container } = renderCanvas({ onLeaveNoteAt });

    // Twice, at different points: one click proves a number arrives, two
    // prove it is the click's own and not a constant.
    for (const at of [{ clientX: 300, clientY: 200 }, { clientX: 412, clientY: 233 }]) {
      fireEvent.contextMenu(pane(container), at);
      const menu = await screen.findByRole('menu');
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Leave a note here' }));
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    }

    // jsdom has no layout, so the canvas sits at the origin at zoom 1 and a
    // world coordinate is the screen one. What is pinned here is that the
    // point travels from the click to the note at all.
    expect(onLeaveNoteAt).toHaveBeenNthCalledWith(1, { x: 300, y: 200 });
    expect(onLeaveNoteAt).toHaveBeenNthCalledWith(2, { x: 412, y: 233 });
  });

  it('offers a view-only guest exactly the same thing', async () => {
    const { container } = renderCanvas({ readOnly: true, onLeaveNoteAt: vi.fn() });
    fireEvent.contextMenu(pane(container), { clientX: 120, clientY: 90 });

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Leave a note here' })).toBeInTheDocument();
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
  });

  it('opens nothing at all when notes are unavailable', async () => {
    const { container } = renderCanvas();
    fireEvent.contextMenu(pane(container), { clientX: 300, clientY: 200 });
    // An empty menu would be worse than none: it promises a command and
    // then has nothing to offer.
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});
