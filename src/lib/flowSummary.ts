import {
  describeDuration, nextNodeId, nodeById, readAction, readCondition, readSend,
  readTrigger, readWait, triggerNodes,
  type FlowGraph, type FlowNode,
} from './flowSchema';

/**
 * What an automation does, in the words a creator would use.
 *
 * The Automations list used to say `Someone comments “menu” → 1 Send · 1 Wait`,
 * which is the graph read out loud: it names the builder's parts rather than
 * the behaviour, so it takes a moment to translate and still doesn't say what
 * the person on the other end experiences. Two short lines instead —
 *
 *   Someone comments “menu”
 *   → Sends a DM, waits 2 days, then sends a DM
 *
 * — because the card's job is to let someone recognise an automation without
 * opening it.
 *
 * Walked from the trigger along the graph rather than counted by type, so the
 * order is the order things actually happen.
 */

export interface FlowSummary {
  /** The line that starts the sentence: what has to happen first. */
  when: string;
  /** What Populr then does, or null when nothing has been added yet. */
  then: string | null;
}

/** How many steps get named before the description starts to be a list. */
const NAMED_STEPS = 3;

function quoted(keywords: string[]): string {
  return keywords.map(k => `“${k}”`).join(' or ');
}

function describeStep(node: FlowNode): string | null {
  switch (node.type) {
    case 'send': {
      const cfg = readSend(node);
      return cfg.kind === 'comment_reply' ? 'replies to their comment' : 'sends a DM';
    }
    case 'wait': {
      return `waits ${describeDuration(readWait(node).minutes)}`;
    }
    case 'condition': {
      const cfg = readCondition(node);
      if (cfg.kind === 'replied') return 'checks whether they replied';
      if (cfg.kind === 'has_tag') return 'checks their tags';
      return 'checks what they said';
    }
    case 'action': {
      const cfg = readAction(node);
      if (cfg.kind === 'add_tag') return cfg.tag ? `tags them ${cfg.tag}` : 'tags them';
      if (cfg.kind === 'remove_tag') return 'removes a tag';
      if (cfg.kind === 'set_stage') return 'moves them along';
      return 'tells you about them';
    }
    default:
      // A second trigger has no place in a sentence about what happens next.
      return null;
  }
}

/**
 * Every step reachable from the trigger, in the order they run.
 *
 * A condition has two branches and the card has one line, so this follows the
 * Yes branch and lets the count of what's left carry the rest. Guarded against
 * revisiting a node: the validator rejects cycles, but this also runs on
 * graphs a future build might write.
 */
function walk(graph: FlowGraph, from: string): FlowNode[] {
  const out: FlowNode[] = [];
  const seen = new Set<string>([from]);
  let id: string | null = nextNodeId(graph, from) ?? nextNodeId(graph, from, 'yes');
  while (id && !seen.has(id)) {
    seen.add(id);
    const node = nodeById(graph, id);
    if (!node) break;
    out.push(node);
    id = nextNodeId(graph, id) ?? nextNodeId(graph, id, 'yes');
  }
  return out;
}

export function describeFlow(graph: FlowGraph): FlowSummary {
  const trigger = triggerNodes(graph)[0];
  if (!trigger) return { when: 'Not set up yet', then: null };

  const cfg = readTrigger(trigger);
  const words = cfg.matchMode === 'any' || !cfg.keywords.length ? '' : ` ${quoted(cfg.keywords)}`;
  const when = cfg.kind === 'dm' ? `Someone DMs${words}` : `Someone comments${words}`;

  const steps = walk(graph, trigger.id)
    .map(describeStep)
    .filter((s): s is string => s !== null);
  if (!steps.length) return { when, then: null };

  const named = steps.slice(0, NAMED_STEPS);
  const rest = steps.length - named.length;
  // "then" before the last one, so it reads as a sequence rather than a list.
  const sentence = named.length > 1
    ? `${named.slice(0, -1).join(', ')}, then ${named[named.length - 1]}`
    : named[0];
  const tail = rest > 0 ? `, and ${rest} more step${rest === 1 ? '' : 's'}` : '';

  return { when, then: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}${tail}` };
}
