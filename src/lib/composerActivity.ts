import { NODE_LABEL, describeDuration, type FlowGraph, type FlowNodeType } from './flowSchema';

/**
 * What Populr just did, said one line at a time.
 *
 * The composer answers once — a request goes out, a validated graph comes
 * back — so there is no live stream of the model's thinking to show, and
 * inventing one would be theatre. What there IS, in the response, is the list
 * of operations that were parsed, applied and saved: a real record of what
 * changed, in order. These lines are that record in the creator's language.
 *
 * Read from the ALREADY-VALIDATED operations, never from a partial proposal.
 * Nothing here can describe a change that wasn't made.
 *
 * Deliberately not one line per operation. `connect` and `move_node` are how a
 * graph is wired and laid out, not things that happened to the automation —
 * "Connected send-2 to wait-1" is the graph talking about itself. Steps are
 * what a creator recognises.
 */

export type FlowOperation =
  | { op: 'create_node'; id: string; type: FlowNodeType; config?: Record<string, unknown>; position?: unknown }
  | { op: 'update_node'; id: string; config: Record<string, unknown> }
  | { op: 'move_node'; id: string; position: unknown }
  | { op: 'delete_node'; id: string }
  | { op: 'connect'; source: string; target: string; branch?: string }
  | { op: 'disconnect'; source: string; branch?: string }
  | { op: 'rename_flow'; name: string };

/** How many lines are worth reading before the rest becomes a number. */
const MAX_LINES = 6;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** The operations the API sent, kept only if they match the closed vocabulary. */
export function parseOperations(input: unknown): FlowOperation[] {
  if (!Array.isArray(input)) return [];
  const known = ['create_node', 'update_node', 'move_node', 'delete_node', 'connect', 'disconnect', 'rename_flow'];
  return input.filter((raw): raw is FlowOperation =>
    !!raw && typeof raw === 'object' && known.includes(String((raw as { op?: unknown }).op ?? '')));
}

function describeCreate(op: Extract<FlowOperation, { op: 'create_node' }>): string {
  const cfg = op.config ?? {};
  const kind = str(cfg.kind);
  switch (op.type) {
    case 'trigger':
      // "When" is the step's name; "trigger" is the engine's word for it.
      return kind === 'dm' ? 'Added the When step — someone DMs you' : 'Added the When step — someone comments';
    case 'send':
      return kind === 'comment_reply' ? 'Added a public reply' : 'Added a message';
    case 'wait': {
      const minutes = typeof cfg.minutes === 'number' ? cfg.minutes : null;
      // "a wait of 2 days" rather than "a 2 days wait": describeDuration
      // yields a phrase, and gluing it in front of a noun reads as broken.
      return minutes ? `Added a wait of ${describeDuration(minutes)}` : 'Added a wait';
    }
    case 'condition':
      return kind === 'replied' ? 'Added a check for a reply' : 'Added a check';
    case 'action':
      if (kind === 'add_tag') return 'Added a tag step';
      if (kind === 'remove_tag') return 'Added a step that removes a tag';
      if (kind === 'set_stage') return 'Added a step that moves them along';
      if (kind === 'run_integration') return 'Added a step that uses a connected app';
      return 'Added a heads-up for you';
  }
}

/**
 * The activity lines for one composer answer.
 *
 * `graph` is the graph as it now stands, used only to name the step an
 * update touched — the operation carries an id, and "Updated the Wait step"
 * is worth more than "Updated a step".
 */
export function activityLines(operations: FlowOperation[], graph: FlowGraph): string[] {
  const typeById = new Map(graph.nodes.map(n => [n.id, n.type]));
  const lines: string[] = [];
  let rewired = false;

  for (const op of operations) {
    switch (op.op) {
      case 'create_node':
        lines.push(describeCreate(op));
        break;
      case 'update_node': {
        const type = typeById.get(op.id);
        lines.push(type ? `Updated the ${NODE_LABEL[type]} step` : 'Updated a step');
        break;
      }
      case 'delete_node':
        lines.push('Removed a step');
        break;
      case 'rename_flow':
        lines.push(`Named it “${op.name}”`);
        break;
      case 'connect':
      case 'disconnect':
        rewired = true;
        break;
      case 'move_node':
        // Layout, not behaviour.
        break;
    }
  }

  // Wiring only earns a line when it is the whole change. Adding a step
  // connects it by definition, and saying both would report one act twice.
  if (rewired && !lines.length) lines.push('Reconnected the steps');

  if (lines.length <= MAX_LINES) return lines;
  const rest = lines.length - MAX_LINES;
  return [...lines.slice(0, MAX_LINES), `…and ${rest} more change${rest === 1 ? '' : 's'}`];
}
