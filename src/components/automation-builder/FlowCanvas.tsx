import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, NodeToolbar, Position, ReactFlow, ReactFlowProvider,
  useReactFlow, useNodesInitialized,
  type Edge, type Node, type NodeChange, type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FlowNodeCard, type FlowNodeData } from './FlowNodeCard';
import DrawnEdge, { type DrawnEdgeData } from './DrawnEdge';
import { NODE_HEIGHT, NODE_WIDTH, viewportAfterResize } from '../../lib/flowLayout';
import { useNodeEntrance } from '../../lib/nodeEntrance';
import type { FlowGraph } from '../../lib/flowSchema';
import type { FlowProblem, PostLibraryItem } from '../../lib/api';

/**
 * The canvas: pan, zoom, select, drag, connect.
 *
 * Controls are deliberately close to absent. React Flow ships a control panel,
 * a minimap and an attribution badge; all three are off. What a creator needs
 * is to move around and see their flow — zoom buttons and a minimap are chrome
 * for graphs far larger than these ever get.
 */

const nodeTypes = { step: FlowNodeCard };
const edgeTypes = { drawn: DrawnEdge };

export interface FlowCanvasProps {
  graph: FlowGraph;
  selectedNodeId: string | null;
  highlighted: string[];
  problems: FlowProblem[];
  posts: PostLibraryItem[];
  /** Steps the running test has reached, in order — animates the path. */
  activePath: string[];
  onSelect: (nodeId: string | null) => void;
  onMove: (nodeId: string, position: { x: number; y: number }) => void;
  onConnect: (source: string, target: string, branch: 'next' | 'yes' | 'no') => void;
  onAddAfter: (nodeId: string, branch: 'next' | 'yes' | 'no') => void;
  /** Bumped by the parent to request a re-fit (after AI generation, say). */
  fitSignal: number;
  /** A step to bring into view — a notification the creator just tapped. */
  focusNodeId?: string | null;
  /** Bumped alongside focusNodeId, so asking for the same step twice works. */
  focusSignal?: number;
  /**
   * The contextual step editor, anchored to the selected node. The canvas
   * only places it — the page owns its content — so the editor rides the
   * node through pans, zooms and drags without the page knowing about any
   * of them.
   */
  editorSlot?: React.ReactNode;
}

function CanvasInner({
  graph, selectedNodeId, highlighted, problems, posts, activePath,
  onSelect, onMove, onConnect, onAddAfter, fitSignal, focusNodeId = null, focusSignal = 0,
  editorSlot = null,
}: FlowCanvasProps) {
  const { fitView, setCenter, getViewport, setViewport, flowToScreenPosition } = useReactFlow();
  const initialized = useNodesInitialized();
  // Bumped when a pan/zoom settles, so the editor's side of the node is
  // reconsidered — per gesture, not per frame.
  const [viewportTick, setViewportTick] = useState(0);

  // The canvas is a real column beside the contextual panel, so its width
  // changes whenever one opens or closes. Keep whatever is in the middle in
  // the middle — see viewportAfterResize for why this is a shift and not a
  // re-fit. Width only: the panel never changes the canvas's height.
  const host = useRef<HTMLDivElement>(null);
  const lastWidth = useRef<number | null>(null);
  useEffect(() => {
    const element = host.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0;
      // A zero width is the panel being unmounted or the tab being hidden,
      // not a resize. Recording it would make the next real measurement look
      // like a huge gain and throw the viewport across the screen.
      if (!width) return;
      const previous = lastWidth.current;
      lastWidth.current = width;
      if (previous === null || previous === width) return;
      setViewport(viewportAfterResize(getViewport(), previous, width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [getViewport, setViewport]);

  const problemByNode = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of problems) {
      if (p.nodeId && !map.has(p.nodeId)) map.set(p.nodeId, p.message);
    }
    return map;
  }, [problems]);

  const postById = useMemo(() => new Map(posts.map(p => [String(p.id), p])), [posts]);

  // Which steps and connectors are arriving on this paint, and in what order.
  // A connector takes its cue from the step it points at, so the line arrives
  // with its destination rather than chasing it.
  const nodeDelays = useNodeEntrance(graph.nodes.map(n => n.id));
  const arrivingEdges = useNodeEntrance(graph.edges.map(e => e.id));

  const hasOutgoing = useCallback(
    (nodeId: string, branch: 'next' | 'yes' | 'no') =>
      graph.edges.some(e => e.source === nodeId && e.branch === branch),
    [graph.edges],
  );

  const nodes: Node[] = useMemo(
    () => graph.nodes.map(node => ({
      id: node.id,
      type: 'step',
      position: node.position,
      // React Flow needs the size up front to route edges before measuring;
      // without it the first paint shows edges converging on the origin.
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      selected: node.id === selectedNodeId,
      data: {
        node,
        selected: node.id === selectedNodeId,
        highlighted: highlighted.includes(node.id),
        enterDelay: nodeDelays.get(node.id) ?? null,
        problem: problemByNode.get(node.id) ?? null,
        post: node.type === 'trigger'
          ? postById.get(String((node.config as { postId?: string }).postId ?? '')) ?? null
          : null,
        onAddAfter,
        hasOutgoing,
      } satisfies FlowNodeData,
    })),
    [graph.nodes, selectedNodeId, highlighted, problemByNode, postById, onAddAfter, hasOutgoing,
      nodeDelays],
  );

  const edges: Edge[] = useMemo(
    () => graph.edges.map(edge => {
      // An edge is "active" only when both ends are consecutive in the tested
      // path — otherwise a branch that merges back would light up wrongly.
      const from = activePath.indexOf(edge.source);
      const active = from !== -1 && activePath[from + 1] === edge.target;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.branch,
        type: 'drawn',
        animated: active,
        data: {
          drawDelay: arrivingEdges.has(edge.id) ? nodeDelays.get(edge.target) ?? 0 : null,
          active,
          branch: edge.branch,
        } satisfies DrawnEdgeData,
      };
    }),
    [graph.edges, activePath, arrivingEdges, nodeDelays],
  );

  // Fit once the nodes have been measured, and again whenever the parent asks
  // (a fresh AI generation, a manual re-layout).
  useEffect(() => {
    if (!initialized || !graph.nodes.length) return;
    const timer = setTimeout(() => {
      void fitView({ padding: 0.22, duration: 320, maxZoom: 1 });
    }, 40);
    return () => clearTimeout(timer);
  }, [initialized, fitSignal, fitView, graph.nodes.length]);

  // Pan to a step the creator asked for from somewhere else — today, a
  // notification. Guarded on the signal rather than the id so re-opening the
  // same question pans again, and so an unrelated re-render (a drag, a save)
  // never yanks the viewport back.
  const lastFocus = useRef(0);
  useEffect(() => {
    if (!focusSignal || focusSignal === lastFocus.current || !focusNodeId) return;
    lastFocus.current = focusSignal;
    const node = graph.nodes.find(n => n.id === focusNodeId);
    if (!node) return;
    void setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + NODE_HEIGHT / 2, {
      zoom: 1,
      duration: 360,
    });
  }, [focusSignal, focusNodeId, graph.nodes, setCenter]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      // Only commit the final position. Committing every intermediate frame
      // would push a save per pointermove.
      if (change.type === 'position' && change.position && change.dragging === false) {
        onMove(change.id, change.position);
      }
    }
  }, [onMove]);

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const branch = (connection.sourceHandle ?? 'next') as 'next' | 'yes' | 'no';
    onConnect(connection.source, connection.target, branch);
  }, [onConnect]);

  /**
   * Which side of the node the editor card sits on.
   *
   * Below the node by default — that's where the eye goes after clicking —
   * flipping above when the node is low in the viewport, and hugging the
   * nearer edge when it's close to one side, so the card stays whole instead
   * of sliding off-screen. Recomputed when the selection changes, the node is
   * dragged (its position flows through `graph`), or a pan/zoom settles —
   * measurement happens in an effect, where reading the DOM is honest.
   * Estimates rather than measures the card (~320×430): measuring would need
   * a second layout pass, and the flip only has to be right, not exact.
   */
  const [editorPlacement, setEditorPlacement] = useState<{
    position: Position; align: 'start' | 'center' | 'end';
  }>({ position: Position.Bottom, align: 'center' });
  useEffect(() => {
    if (!selectedNodeId) return;
    const node = graph.nodes.find(n => n.id === selectedNodeId);
    const rect = host.current?.getBoundingClientRect();
    if (!node || !rect || rect.height === 0) return;
    const bottomCenter = flowToScreenPosition({
      x: node.position.x + NODE_WIDTH / 2,
      y: node.position.y + NODE_HEIGHT,
    });
    const roomBelow = rect.bottom - bottomCenter.y;
    const roomAbove = bottomCenter.y - (getViewport().zoom * NODE_HEIGHT) - rect.top;
    const position = roomBelow < 440 && roomAbove > roomBelow ? Position.Top : Position.Bottom;
    const align =
      bottomCenter.x - rect.left < 170 ? ('start' as const)
      : rect.right - bottomCenter.x < 170 ? ('end' as const)
      : ('center' as const);
    setEditorPlacement(current =>
      current.position === position && current.align === align ? current : { position, align });
  }, [selectedNodeId, graph.nodes, viewportTick, flowToScreenPosition, getViewport]);

  return (
    <div ref={host} className="h-full w-full">
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={handleNodesChange}
      onConnect={handleConnect}
      onMoveEnd={() => setViewportTick(t => t + 1)}
      onNodeClick={(_, node) => onSelect(node.id)}
      // Clicking empty canvas closes the inspector — the brief's rule that no
      // panel is permanently open.
      onPaneClick={() => onSelect(null)}
      proOptions={{ hideAttribution: true }}
      nodesDraggable
      nodesConnectable
      elementsSelectable
      panOnScroll
      selectionOnDrag={false}
      minZoom={0.35}
      maxZoom={1.6}
      defaultEdgeOptions={{ type: 'drawn' }}
      className="bg-[#F7F5F2]"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#DED9D2" />
      {editorSlot && selectedNodeId && (
        // React Flow's own anchored-element primitive: rendered in a portal
        // above the canvas, tracking the node through pan and drag WITHOUT
        // scaling with zoom — form controls stay readable at any zoom level.
        <NodeToolbar
          nodeId={selectedNodeId}
          isVisible
          position={editorPlacement.position}
          align={editorPlacement.align}
          offset={12}
        >
          {editorSlot}
        </NodeToolbar>
      )}
    </ReactFlow>
    </div>
  );
}

export default function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
