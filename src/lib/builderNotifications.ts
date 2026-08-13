import type { FlowProblem } from './api';
import { NODE_LABEL, nodeById, type FlowGraph } from './flowSchema';

/**
 * What Populr needs from the creator, as notifications.
 *
 * There is exactly one source of truth for whether an automation can go live:
 * the backend's activationProblems. This file does not add a second one. It
 * takes that list and says the same things in Populr's voice — "Which post
 * should this watch?" rather than "Choose the post or reel to watch" — and
 * remembers which control on the step answers each one, so the feed can be an
 * index into the builder rather than a report about it.
 *
 * Two rules keep it honest:
 *
 *  - A problem we don't have a phrasing for is still shown, using the
 *    validator's own sentence. Silence would hide a real activation blocker
 *    behind a missing translation.
 *  - Nothing here decides whether a flow is ready. Activate asks the server,
 *    every time (see AutomationBuilderPage.onActivate).
 */

export type BuilderNotificationKind = 'question' | 'warning' | 'resolved';

export interface BuilderNotification {
  /** Stable across refreshes of the same problem, so time-since survives. */
  id: string;
  kind: BuilderNotificationKind;
  nodeId: string | null;
  /** The step's control that answers it — the inspector opens there. */
  field: string | null;
  title: string;
  /** "When", "Send" — the step it belongs to. */
  stepLabel: string | null;
  /**
   * The validator's original sentence, so the step's own panel can avoid
   * printing the same thing twice in two different voices.
   */
  sourceMessage: string;
  createdAt: number;
}

interface Phrasing {
  /** Part of the notification id — must not change once shipped. */
  key: string;
  test: RegExp;
  kind: 'question' | 'warning';
  /** Populr's phrasing. Omitted when the validator's sentence is already right. */
  ask?: string;
  /** What the feed says once it's been answered. */
  done?: string;
  field?: string;
}

/**
 * Ordered — first match wins.
 *
 * A question is something the creator chooses. A warning is a fact about the
 * world they may have to act on but cannot answer here ("that account needs
 * reconnecting"). Only questions can resolve, because only a question has an
 * answer; a warning goes away when the situation does.
 */
const PHRASINGS: Phrasing[] = [
  {
    key: 'account',
    test: /connected account this automation watches/i,
    kind: 'question',
    ask: 'Which connected account should this automation use?',
    done: 'Account chosen',
    field: 'account',
  },
  { key: 'account-gone', test: /isn't connected to this workspace any more/i, kind: 'warning', field: 'account' },
  { key: 'account-stale', test: /needs reconnecting before this automation/i, kind: 'warning', field: 'account' },
  {
    key: 'post',
    test: /post or reel to watch/i,
    kind: 'question',
    ask: 'Which post should this automation watch?',
    done: 'Post chosen',
    field: 'post',
  },
  {
    key: 'trigger-keywords',
    test: /at least one keyword/i,
    kind: 'question',
    ask: 'Which word should Populr watch out for?',
    done: 'Keyword set',
    field: 'keywords',
  },
  {
    key: 'condition-keywords',
    test: /needs a word to look for/i,
    kind: 'question',
    ask: 'Which word should this step check for?',
    done: 'Word set',
    field: 'keywords',
  },
  {
    key: 'condition-tag',
    test: /needs a tag to check/i,
    kind: 'question',
    ask: 'Which tag should this step check for?',
    done: 'Tag set',
    field: 'tag',
  },
  {
    key: 'action-tag',
    test: /This step needs a tag\.?$/i,
    kind: 'question',
    ask: 'Which tag should Populr add?',
    done: 'Tag set',
    field: 'tag',
  },
  {
    key: 'stage',
    test: /needs a stage/i,
    kind: 'question',
    ask: 'Which stage should they move to?',
    done: 'Stage set',
    field: 'stage',
  },
  {
    key: 'message',
    test: /Send step is empty/i,
    kind: 'question',
    ask: 'What should this message say?',
    done: 'Message is ready',
    field: 'text',
  },
  { key: 'link', test: /full http:\/\/ or https:\/\/ address/i, kind: 'warning', field: 'link' },
  {
    key: 'no-trigger',
    test: /needs a When step to start it/i,
    kind: 'question',
    ask: 'What should start this automation?',
    done: 'Starting step added',
  },
  { key: 'two-triggers', test: /only start from one When step/i, kind: 'warning' },
  {
    key: 'nothing-after-trigger',
    test: /at least one step after the trigger/i,
    kind: 'question',
    ask: 'What should happen once it starts?',
    done: 'First step added',
  },
  { key: 'orphan', test: /isn't connected to anything/i, kind: 'warning' },
  {
    key: 'condition-empty',
    test: /If step has no steps after it/i,
    kind: 'question',
    ask: 'What should happen after this question?',
    done: 'Both answers go somewhere',
  },
  {
    key: 'wait-empty',
    test: /Nothing happens after this wait/i,
    kind: 'question',
    ask: 'What should happen after the wait?',
    done: 'Step added after the wait',
    field: 'duration',
  },
  { key: 'wait-cap', test: /capped at 30 days/i, kind: 'warning', field: 'duration' },
];

function phrasingFor(message: string): Phrasing {
  return (
    PHRASINGS.find(p => p.test.test(message)) ?? {
      // Everything else — platform capability limits, delegation problems —
      // already reads as plain English from the validator, and copying each
      // one here would be a second place to keep them right.
      key: 'other',
      test: /$^/,
      kind: 'warning',
    }
  );
}

/**
 * The open items, in the validator's order (which walks the flow from its
 * trigger outwards, so the feed reads in the order the creator built it).
 *
 * `createdAt` is left to the caller: it is the one part that has to be
 * remembered across refreshes rather than derived.
 */
export function derivedNotifications(
  problems: FlowProblem[],
  graph: FlowGraph,
): Omit<BuilderNotification, 'createdAt'>[] {
  const used = new Set<string>();

  return problems.map(problem => {
    const phrasing = phrasingFor(problem.message);
    const node = nodeById(graph, problem.nodeId);

    // Two problems of the same kind on the same step would otherwise collide
    // into one id and one would vanish from the feed.
    let id = `${problem.nodeId ?? 'flow'}:${phrasing.key}`;
    for (let n = 2; used.has(id); n++) id = `${problem.nodeId ?? 'flow'}:${phrasing.key}:${n}`;
    used.add(id);

    return {
      id,
      kind: phrasing.kind,
      nodeId: problem.nodeId,
      field: phrasing.field ?? null,
      title: phrasing.ask ?? problem.message,
      stepLabel: node ? NODE_LABEL[node.type] : null,
      sourceMessage: problem.message,
    };
  });
}

/** The "✓ Message is ready" entry left behind when a question is answered. */
export function resolvedFrom(
  notification: Omit<BuilderNotification, 'createdAt'>,
  at: number,
): BuilderNotification {
  const phrasing = PHRASINGS.find(p => notification.id.endsWith(`:${p.key}`));
  return {
    ...notification,
    id: `${notification.id}:resolved:${at}`,
    kind: 'resolved',
    title: phrasing?.done ?? 'Sorted',
    createdAt: at,
  };
}

/**
 * "2m" — compact enough to sit on a notification's second line beside the
 * step it belongs to, where "2 minutes ago" would wrap.
 */
export function shortAgo(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
