import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Background, BackgroundVariant, ReactFlow, ReactFlowProvider,
  useReactFlow, useNodesInitialized,
  type Edge, type Node, type NodeChange, type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FlowNodeCard, type FlowNodeData } from './FlowNodeCard';
import { NODE_HEIGHT, NODE_WIDTH } from '../../lib/flowLayout';
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
}

function CanvasInner({
  graph, selectedNodeId, highlighted, problems, posts, activePath,
  onSelect, onMove, onConnect, onAddAfter, fitSignal, focusNodeId = null, focusSignal = 0,
}: FlowCanvasProps) {
  const { fitView, setCenter } = useReactFlow();
  const initialized = useNodesInitialized();

  const problemByNode = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of problems) {
      if (p.nodeId && !map.has(p.nodeId)) map.set(p.nodeId, p.message);
    }
    return map;
  }, [problems]);

  const postById = useMemo(() => new Map(posts.map(p => [String(p.id), p])), [posts]);

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
        problem: problemByNode.get(node.id) ?? null,
        post: node.type === 'trigger'
          ? postById.get(String((node.config as { postId?: string }).postId ?? '')) ?? null
          : null,
        onAddAfter,
        hasOutgoing,
      } satisfies FlowNodeData,
    })),
    [graph.nodes, selectedNodeId, highlighted, problemByNode, postById, onAddAfter, hasOutgoing],
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
        type: 'smoothstep',
        animated: active,
        // Yes/No live on the edge itself, close to the connector, so the
        // answer reads without tracing the line to its end.
        label: edge.branch === 'next' ? undefined : edge.branch === 'yes' ? 'Yes' : 'No',
        labelShowBg: true,
        labelBgPadding: [5, 2] as [number, number],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: '#FFFFFF', stroke: '#E8E4DF' },
        labelStyle: { fill: '#6B6B6B', fontSize: 10, fontWeight: 500 },
        style: {
          stroke: active ? '#C5FF3D' : '#D8D3CC',
          strokeWidth: active ? 2.5 : 1.5,
        },
      };
    }),
    [graph.edges, activePath],
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

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={handleNodesChange}
      onConnect={handleConnect}
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
      defaultEdgeOptions={{ type: 'smoothstep' }}
      className="bg-[#F7F5F2]"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#DED9D2" />
    </ReactFlow>
  );
}

export default function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
