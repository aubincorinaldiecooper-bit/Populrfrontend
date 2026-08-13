import {
  describeDuration, nodeById, readAction, readSend, readWait,
  type FlowGraph, type FlowNode,
} from './flowSchema';
import type { FlowSimulationResult, FlowSimulationStep } from './api';

/**
 * The simulation, as a conversation.
 *
 * The server still decides what happens: /api/flows/:id/test runs the real
 * executors with sending switched off, and the path it returns is the path the
 * live automation would take. This file only chooses how to *show* that — as
 * messages between a fan and the creator's account rather than as a list of
 * executed nodes.
 *
 * Waits are the reason this exists as a transform rather than a renderer over
 * steps. "Wait 2 days" is not an event in a conversation; it's the gap between
 * two messages, and drawing it as a line saying "2 days later" is both truer to
 * what the fan experiences and shorter than a step card explaining itself.
 */

export type PreviewItem =
  /** The fan's comment on a post — how a comment-triggered flow starts. */
  | { id: string; kind: 'comment'; text: string }
  /** The fan's DM. Either the message that started it, or their reply. */
  | { id: string; kind: 'incoming'; text: string }
  | { id: string; kind: 'outgoing'; text: string; problem: string | null }
  | { id: string; kind: 'public_reply'; text: string }
  | { id: string; kind: 'separator'; text: string }
  /** Something Populr does that the fan never sees — a tag, a stage move. */
  | { id: string; kind: 'note'; text: string }
  /** Why this message wouldn't have started the automation at all. */
  | { id: string; kind: 'blocked'; text: string };

export interface ConversationInput {
  graph: FlowGraph;
  result: FlowSimulationResult;
  channel: 'comment' | 'dm';
  /** What the creator typed to start it. */
  triggerText: string;
  /** Their reply, once they've given one. */
  replyText: string | null;
  /**
   * Stop at the first "did they reply?" and hand control back, so the creator
   * can answer as the fan instead of being shown one outcome as if it were
   * the only one.
   */
  pauseAtReplyCheck: boolean;
}

export interface Conversation {
  items: PreviewItem[];
  /** True when the flow is waiting on the creator to reply, or not to. */
  awaitingReply: boolean;
}

function stringField(output: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = output?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function isReplyCheck(graph: FlowGraph, step: FlowSimulationStep | undefined): boolean {
  if (!step) return false;
  const node = nodeById(graph, step.nodeId);
  return node?.type === 'condition' && (node.config as { kind?: string }).kind === 'replied';
}

/** What a step in Populr — a tag, a stage, a flag — reads as in a chat. */
function actionNote(node: FlowNode): string | null {
  const cfg = readAction(node);
  switch (cfg.kind) {
    case 'add_tag':
      return cfg.tag ? `Populr tags them “${cfg.tag}”` : null;
    case 'remove_tag':
      return cfg.tag ? `Populr removes the tag “${cfg.tag}”` : null;
    case 'set_stage':
      return cfg.stage ? `Populr moves them to ${cfg.stage}` : null;
    case 'notify_creator':
      return 'Populr flags them for you';
    default:
      return null;
  }
}

export function buildConversation(input: ConversationInput): Conversation {
  const { graph, result, channel, triggerText, replyText, pauseAtReplyCheck } = input;
  const items: PreviewItem[] = [];

  items.push(
    channel === 'comment'
      ? { id: 'trigger', kind: 'comment', text: triggerText }
      : { id: 'trigger', kind: 'incoming', text: triggerText },
  );

  if (!result.matched) {
    items.push({
      id: 'blocked',
      kind: 'blocked',
      text: result.reason ?? "This wouldn't start the automation.",
    });
    return { items, awaitingReply: false };
  }

  let replyShown = false;
  const showReply = () => {
    if (replyShown || !replyText) return;
    replyShown = true;
    items.push({ id: 'reply', kind: 'incoming', text: replyText });
  };

  for (let i = 0; i < result.steps.length; i++) {
    const step = result.steps[i];
    const node = nodeById(graph, step.nodeId);
    if (!node || node.type === 'trigger') continue;
    const id = `${step.nodeId}-${i}`;

    if (node.type === 'send') {
      const cfg = readSend(node);
      // The executor's own rendered body, so the preview shows the greeting
      // filled in and the tracked link in place rather than the template.
      const text = stringField(step.output, 'text') ?? cfg.text;
      items.push(
        cfg.kind === 'comment_reply'
          ? { id, kind: 'public_reply', text }
          : { id, kind: 'outgoing', text, problem: step.status === 'failed' ? step.detail : null },
      );
      continue;
    }

    if (node.type === 'wait') {
      const minutes = readWait(node).minutes;
      const next = result.steps[i + 1];
      const nextIsReplyCheck = isReplyCheck(graph, next);

      // Hold here rather than showing a wait the creator is about to decide
      // the outcome of. Answering as the fan comes first; the line describing
      // the gap can only be written once they have.
      if (nextIsReplyCheck && pauseAtReplyCheck) return { items, awaitingReply: true };

      if (nextIsReplyCheck && next?.branch === 'no') {
        items.push({ id, kind: 'separator', text: `No reply after ${describeDuration(minutes)}` });
        i++; // the check is told by the same line
        continue;
      }
      // They replied during the wait, so their message belongs before it.
      if (nextIsReplyCheck && next?.branch === 'yes') showReply();
      items.push({ id, kind: 'separator', text: `${describeDuration(minutes)} later` });
      continue;
    }

    if (node.type === 'condition') {
      if (!isReplyCheck(graph, step)) continue;
      if (pauseAtReplyCheck) return { items, awaitingReply: true };
      if (step.branch === 'yes') showReply();
      else items.push({ id, kind: 'separator', text: 'No reply' });
      continue;
    }

    if (node.type === 'action') {
      const note = actionNote(node);
      if (note) items.push({ id, kind: 'note', text: note });
      continue;
    }
  }

  return { items, awaitingReply: false };
}
