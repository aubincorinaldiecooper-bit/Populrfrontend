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
 * The fan's replies live in the steps themselves: each answered "did they
 * reply?" carries the text it consumed, and an unanswered one parks the walk
 * (result.awaitingReply) exactly where a live run would suspend. So this
 * transform never has to guess where a reply belongs or which question is
 * open — the server's walk already says.
 *
 * Waits are the reason this exists as a transform rather than a renderer over
 * steps. "Wait 2 days" is not an event in a conversation; it's the gap between
 * two messages, and drawing it as a line saying "2 days later" is both truer to
 * what the fan experiences and shorter than a step card explaining itself.
 */

export type PreviewItem =
  /** The fan's comment on a post — how a comment-triggered flow starts. */
  | { id: string; kind: 'comment'; text: string }
  /** The fan's DM. Either the message that started it, or one of their replies. */
  | { id: string; kind: 'incoming'; text: string }
  | { id: string; kind: 'outgoing'; text: string; problem: string | null }
  /** A public reply carries its own failure: it is as refusable as a DM. */
  | { id: string; kind: 'public_reply'; text: string; problem: string | null }
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
    case 'run_integration':
      // Named, not performed: preview never reaches outside Populr, and the
      // note has to make that obvious rather than reading like it booked
      // something.
      return cfg.toolkitSlug ? `Populr would use ${cfg.toolkitSlug}` : null;
    default:
      return null;
  }
}

export function buildConversation(input: ConversationInput): Conversation {
  const { graph, result, channel, triggerText } = input;
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

  /** The step the walk parked on, when it parked — the open question. It is
   *  drawn as the reply box, not as a line of the transcript. */
  const parkedIndex = result.awaitingReply === true ? result.steps.length - 1 : -1;

  /** The reply an answered check consumed, straight from the executor. */
  const replyOf = (step: FlowSimulationStep | undefined): string | null =>
    step?.branch === 'yes' ? stringField(step.output, 'text') : null;

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
      // A step the executor refused is the most important thing Preview can
      // show — a flow that DMs a commenter on a platform that won't allow it
      // looks perfect until it silently sends nothing.
      const problem = step.status === 'failed' ? step.detail : null;
      items.push(
        cfg.kind === 'comment_reply'
          ? { id, kind: 'public_reply', text, problem }
          : { id, kind: 'outgoing', text, problem },
      );
      continue;
    }

    if (node.type === 'wait') {
      const minutes = readWait(node).minutes;
      const next = result.steps[i + 1];
      const nextIsReplyCheck = isReplyCheck(graph, next);

      // The question after this wait is the open one: hold before drawing the
      // gap. Answering as the fan comes first; the line describing the wait
      // can only be written once they have.
      if (nextIsReplyCheck && i + 1 === parkedIndex) return { items, awaitingReply: true };

      if (nextIsReplyCheck && next?.branch === 'no') {
        items.push({ id, kind: 'separator', text: `No reply after ${describeDuration(minutes)}` });
        i++; // the check is told by the same line
        continue;
      }
      // They replied during the wait, so their message belongs before the
      // line describing it — and the check it answered is told by the bubble.
      if (nextIsReplyCheck && next?.branch === 'yes') {
        const reply = replyOf(next);
        if (reply) items.push({ id: `reply-${next.nodeId}-${i + 1}`, kind: 'incoming', text: reply });
        items.push({ id, kind: 'separator', text: `${describeDuration(minutes)} later` });
        i++;
        continue;
      }
      items.push({ id, kind: 'separator', text: `${describeDuration(minutes)} later` });
      continue;
    }

    if (node.type === 'condition') {
      if (!isReplyCheck(graph, step)) continue;
      // The open question: everything up to here is the transcript, and the
      // reply box is how it continues.
      if (i === parkedIndex) return { items, awaitingReply: true };
      if (step.branch === 'yes') {
        const reply = replyOf(step);
        if (reply) items.push({ id: `reply-${step.nodeId}-${i}`, kind: 'incoming', text: reply });
      } else {
        items.push({ id, kind: 'separator', text: 'No reply' });
      }
      continue;
    }

    if (node.type === 'action') {
      const note = actionNote(node);
      if (note) items.push({ id, kind: 'note', text: note });
      continue;
    }
  }

  return { items, awaitingReply: result.awaitingReply === true };
}
