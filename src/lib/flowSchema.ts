/**
 * The automation flow graph, client side.
 *
 * Deliberately a mirror of populrbackend/src/flows/schema.ts rather than a
 * looser client-only shape: the backend is the authority (it validates every
 * write and refuses anything outside this vocabulary), so the builder's job is
 * to never construct something the server would reject. Keeping the readers
 * identical means a graph edited here and a graph executed there can't drift.
 *
 * The vocabulary is five words — When, If, Send, Wait, Action. That is the
 * entire surface a creator learns. New capability arrives as a new `kind`
 * inside one of them, not as a sixth shape on the canvas.
 */

export const FLOW_SCHEMA_VERSION = 1;

export type FlowNodeType = 'trigger' | 'condition' | 'send' | 'wait' | 'action';
export type BranchLabel = 'next' | 'yes' | 'no';
export type MatchMode = 'contains' | 'exact' | 'any';

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  branch: BranchLabel;
}

export interface FlowGraph {
  schemaVersion: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export function emptyGraph(): FlowGraph {
  return { schemaVersion: FLOW_SCHEMA_VERSION, nodes: [], edges: [] };
}

/** The creator-facing word for each step type. Used everywhere: node headers,
 *  the add-step menu, Review's prose, the composer's context chip.
 *
 *  The test for every word here: would a ten-year-old know what happens when
 *  they click it? The canvas should read like a sentence — WHEN someone
 *  comments "menu", MESSAGE here's tonight's menu, WAIT 2 days, IF they
 *  replied… "Message" describes what the creator wants; where it goes (DM or
 *  public) is configuration inside the step, not its name. These are labels
 *  only — the stored node types underneath never change. */
export const NODE_LABEL: Record<FlowNodeType, string> = {
  trigger: 'When',
  condition: 'If',
  send: 'Message',
  wait: 'Wait',
  // "Action" named the category and "Then do" sounded like the flow engine
  // talking. "Do something" is what it is.
  action: 'Do something',
};

export const NODE_KINDS = {
  trigger: ['comment', 'dm'],
  condition: ['text_contains', 'replied', 'has_tag'],
  send: ['dm', 'comment_reply'],
  wait: ['duration'],
  action: ['add_tag', 'remove_tag', 'set_stage', 'notify_creator'],
} as const satisfies Record<FlowNodeType, readonly string[]>;

export const LEAD_STAGES = ['cold', 'interested', 'warm', 'hot', 'converted'] as const;

// ---------------------------------------------------------------------------
// Config readers — every access narrows with a defined fallback, because a
// stored graph may have been written by the AI or an older build.
// ---------------------------------------------------------------------------

export interface TriggerConfig {
  kind: 'comment' | 'dm';
  accountId: string | null;
  platform: string | null;
  postId: string | null;
  allPosts: boolean;
  keywords: string[];
  matchMode: MatchMode;
  allowMultipleRuns: boolean;
}

export interface ConditionConfig {
  kind: 'text_contains' | 'replied' | 'has_tag';
  keywords: string[];
  matchMode: MatchMode;
  tag: string | null;
  /** 0 = answer from what already happened; the Wait node carries the delay. */
  withinMinutes: number;
}

export interface SendConfig {
  kind: 'dm' | 'comment_reply';
  text: string;
  linkUrl: string | null;
  mediaUrl: string | null;
  buttons: { label: string; url?: string }[];
}

export interface WaitConfig {
  kind: 'duration';
  minutes: number;
}

export interface ActionConfig {
  kind: 'add_tag' | 'remove_tag' | 'set_stage' | 'notify_creator';
  tag: string | null;
  stage: string | null;
  note: string | null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter((x): x is string => x !== null) : [];
}
function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(v as string) ? (v as T) : fallback;
}

export function readTrigger(node: FlowNode): TriggerConfig {
  const c = node.config ?? {};
  return {
    kind: oneOf(c.kind, NODE_KINDS.trigger, 'comment'),
    accountId: str(c.accountId),
    platform: str(c.platform),
    postId: str(c.postId),
    allPosts: c.allPosts === true,
    keywords: strArray(c.keywords),
    matchMode: oneOf(c.matchMode, ['contains', 'exact', 'any'] as const, 'contains'),
    allowMultipleRuns: c.allowMultipleRuns === true,
  };
}

export function readCondition(node: FlowNode): ConditionConfig {
  const c = node.config ?? {};
  return {
    kind: oneOf(c.kind, NODE_KINDS.condition, 'text_contains'),
    keywords: strArray(c.keywords),
    matchMode: oneOf(c.matchMode, ['contains', 'exact', 'any'] as const, 'contains'),
    tag: str(c.tag),
    withinMinutes: Math.max(0, Math.round(num(c.withinMinutes, 0))),
  };
}

export function readSend(node: FlowNode): SendConfig {
  const c = node.config ?? {};
  const buttons = Array.isArray(c.buttons)
    ? (c.buttons as Record<string, unknown>[])
        .filter(b => !!b && typeof b === 'object')
        .map(b => ({ label: str(b.label) ?? '', url: str(b.url) ?? undefined }))
        .filter(b => b.label)
    : [];
  return {
    kind: oneOf(c.kind, NODE_KINDS.send, 'dm'),
    text: typeof c.text === 'string' ? c.text : '',
    linkUrl: str(c.linkUrl),
    mediaUrl: str(c.mediaUrl),
    buttons,
  };
}

export function readWait(node: FlowNode): WaitConfig {
  return { kind: 'duration', minutes: Math.max(1, Math.round(num(node.config?.minutes, 60))) };
}

export function readAction(node: FlowNode): ActionConfig {
  const c = node.config ?? {};
  return {
    kind: oneOf(c.kind, NODE_KINDS.action, 'add_tag'),
    tag: str(c.tag),
    stage: str(c.stage),
    note: str(c.note),
  };
}

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

export function nodeById(graph: FlowGraph, id: string | null | undefined): FlowNode | null {
  return id ? graph.nodes.find(n => n.id === id) ?? null : null;
}

export function triggerNodes(graph: FlowGraph): FlowNode[] {
  return graph.nodes.filter(n => n.type === 'trigger');
}

export function nextNodeId(graph: FlowGraph, nodeId: string, branch: BranchLabel = 'next'): string | null {
  return graph.edges.find(e => e.source === nodeId && e.branch === branch)?.target ?? null;
}

/** The branches a node type can leave on — one for most, Yes/No for an If. */
export function branchesFor(type: FlowNodeType): BranchLabel[] {
  return type === 'condition' ? ['yes', 'no'] : ['next'];
}

/** Human duration, matching the backend's wording so Review and the run log agree. */
export function describeDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  if (minutes < 60 * 24) {
    const hours = Math.round((minutes / 60) * 10) / 10;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.round((minutes / (60 * 24)) * 10) / 10;
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** A short, unique id for a new node — readable in the graph JSON and in ops. */
export function newNodeId(type: FlowNodeType, graph: FlowGraph): string {
  const base = { trigger: 'trigger', condition: 'if', send: 'send', wait: 'wait', action: 'action' }[type];
  let i = 1;
  let id = base;
  while (graph.nodes.some(n => n.id === id)) {
    i += 1;
    id = `${base}-${i}`;
  }
  return id;
}

/** The add-step menu's options, in the plain language the brief asks for.
 *  Lives here rather than beside the canvas component so a component file
 *  exports only components (fast refresh). */
export const STEP_OPTIONS: { type: FlowNodeType; label: string; hint: string }[] = [
  { type: 'send', label: 'Message', hint: 'Reply to them' },
  { type: 'wait', label: 'Wait', hint: 'Pause before the next step' },
  { type: 'condition', label: 'If', hint: 'Choose what happens based on their reply' },
  { type: 'action', label: 'Do something', hint: 'Tag them, update them, or notify you' },
];

/**
 * What each "Then do" option does, in one line.
 *
 * These descriptions are the whole reason the builder uses its own dropdown
 * rather than a native select: "Add a tag" doesn't explain why you'd want one,
 * and the moment of choosing is exactly when that's worth saying.
 */
export const ACTION_OPTIONS: { value: string; label: string; description: string }[] = [
  {
    value: 'add_tag',
    label: 'Add a tag',
    description: 'Labels them in Contacts so you can filter for this group later.',
  },
  {
    value: 'remove_tag',
    label: 'Remove a tag',
    description: 'Takes a label off — useful once they\'ve converted or replied.',
  },
  {
    value: 'set_stage',
    label: 'Move them to a stage',
    description: 'Advances them through your funnel: cold → interested → warm → hot.',
  },
  {
    value: 'notify_creator',
    label: 'Tell me about them',
    description: 'Puts them in Needs Reply so you can follow up personally.',
  },
];

/** The trigger's two starting points, with what each one means. */
export const TRIGGER_OPTIONS: { value: string; label: string; description: string }[] = [
  {
    value: 'comment',
    label: 'Someone comments on a post',
    description: 'Runs when a new comment lands on the post you pick.',
  },
  {
    value: 'dm',
    label: 'Someone sends a DM',
    description: 'Runs when a new direct message arrives.',
  },
];

/** What an If step can ask about. */
export const CONDITION_OPTIONS: { value: string; label: string; description: string }[] = [
  {
    value: 'text_contains',
    label: 'What they said',
    description: 'Splits on whether their message contains certain words.',
  },
  {
    value: 'replied',
    label: 'Whether they replied',
    description: 'Splits on whether they\'ve messaged you back yet.',
  },
  {
    value: 'has_tag',
    label: 'Whether they have a tag',
    description: 'Splits on a label already on their contact.',
  },
];

/** How a Send step goes out. */
export const SEND_OPTIONS: { value: string; label: string; description: string }[] = [
  {
    value: 'dm',
    label: 'Direct message',
    description: 'Private. Can carry a tracked link only they see.',
  },
  {
    value: 'comment_reply',
    label: 'Public reply',
    description: 'Visible under the post. Never carries a tracked link.',
  },
];
