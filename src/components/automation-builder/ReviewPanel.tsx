import { X, Check, AlertTriangle, Loader2 } from 'lucide-react';
import {
  describeDuration, nextNodeId, readAction, readCondition, readSend, readTrigger, readWait,
  triggerNodes, type FlowGraph,
} from '../../lib/flowSchema';
import { platformMeta } from '../../lib/platformMeta';
import type { ConnectedAccount, FlowProblem, PostLibraryItem } from '../../lib/api';

/**
 * Review: the automation as a paragraph, plus everything standing between it
 * and going live.
 *
 * The graph is the truth, but a graph is not what someone reads before
 * switching something on that will message their audience unattended. This
 * walks the same edges the runtime walks and says, in order, what will happen
 * — so "activate" is a decision made with the whole picture rather than a leap
 * of faith.
 */

export interface ReviewPanelProps {
  graph: FlowGraph;
  problems: FlowProblem[];
  accounts: ConnectedAccount[];
  posts: PostLibraryItem[];
  checking: boolean;
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
}

interface Line {
  lead: string;
  body: string;
  nodeId: string;
  depth: number;
}

/** Walk the graph depth-first, in execution order, producing readable lines. */
function describe(
  graph: FlowGraph,
  posts: PostLibraryItem[],
  accounts: ConnectedAccount[],
): Line[] {
  const lines: Line[] = [];
  const seen = new Set<string>();

  const walk = (nodeId: string | null, depth: number, lead: string) => {
    if (!nodeId || seen.has(nodeId)) return;
    seen.add(nodeId);
    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) return;

    switch (node.type) {
      case 'trigger': {
        const cfg = readTrigger(node);
        const account = accounts.find(a => a.id === cfg.accountId);
        const where = account
          ? `${platformMeta(account.platform).name} (@${account.username ?? account.id})`
          : 'your account';
        if (cfg.kind === 'dm') {
          lines.push({
            lead: 'When',
            body: `someone sends a DM on ${where}${cfg.matchMode === 'any' ? '' : ` saying ${quoted(cfg.keywords)}`}`,
            nodeId, depth,
          });
        } else {
          const post = posts.find(p => String(p.id) === cfg.postId);
          const target = cfg.allPosts
            ? 'any of your posts'
            : post?.caption?.trim()
              ? `“${truncate(post.caption.trim(), 48)}”`
              : 'the post you chose';
          lines.push({
            lead: 'When',
            body: `someone comments on ${target} on ${where}${cfg.matchMode === 'any' ? '' : ` with ${quoted(cfg.keywords)}`}`,
            nodeId, depth,
          });
        }
        walk(nextNodeId(graph, nodeId), depth, 'Populr will');
        break;
      }

      case 'send': {
        const cfg = readSend(node);
        const what = cfg.kind === 'dm' ? 'send them a DM' : 'reply publicly';
        const body = cfg.text.trim()
          ? `${what}: “${truncate(cfg.text.trim(), 90)}”`
          : `${what}`;
        lines.push({
          lead,
          body: cfg.linkUrl ? `${body} with a tracked link` : body,
          nodeId, depth,
        });
        walk(nextNodeId(graph, nodeId), depth, 'Then');
        break;
      }

      case 'wait': {
        lines.push({ lead: 'Then', body: `wait ${describeDuration(readWait(node).minutes)}`, nodeId, depth });
        walk(nextNodeId(graph, nodeId), depth, 'Then');
        break;
      }

      case 'action': {
        const cfg = readAction(node);
        const body =
          cfg.kind === 'add_tag' ? `tag them “${cfg.tag ?? '…'}”`
          : cfg.kind === 'remove_tag' ? `remove the tag “${cfg.tag ?? '…'}”`
          : cfg.kind === 'set_stage' ? `move them to ${cfg.stage ?? '…'}`
          : 'flag them for you in Needs Reply';
        lines.push({ lead, body, nodeId, depth });
        walk(nextNodeId(graph, nodeId), depth, 'Then');
        break;
      }

      case 'condition': {
        const cfg = readCondition(node);
        const question =
          cfg.kind === 'replied'
            ? cfg.withinMinutes > 0
              ? `they reply within ${describeDuration(cfg.withinMinutes)}`
              : 'they have replied'
            : cfg.kind === 'has_tag'
              ? `they're tagged “${cfg.tag ?? '…'}”`
              : cfg.matchMode === 'any'
                ? 'they said anything'
                : `their message contains ${quoted(cfg.keywords)}`;

        const yes = nextNodeId(graph, nodeId, 'yes');
        const no = nextNodeId(graph, nodeId, 'no');

        if (yes) {
          lines.push({ lead: 'If', body: question, nodeId, depth });
          walk(yes, depth + 1, 'Populr will');
        }
        if (no) {
          lines.push({ lead: yes ? 'If not' : `If they haven't${cfg.kind === 'replied' ? ' replied' : ''}`, body: yes ? '' : question, nodeId, depth });
          walk(no, depth + 1, 'Populr will');
        }
        if (!yes && !no) {
          lines.push({ lead: 'If', body: `${question} — but nothing happens either way yet`, nodeId, depth });
        }
        break;
      }
    }
  };

  for (const trigger of triggerNodes(graph)) walk(trigger.id, 0, 'Populr will');
  return lines;
}

function quoted(keywords: string[]): string {
  if (!keywords.length) return 'a keyword';
  return keywords.map(k => `“${k}”`).join(' or ');
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function ReviewPanel({
  graph, problems, accounts, posts, checking, onClose, onSelectNode,
}: ReviewPanelProps) {
  const lines = describe(graph, posts, accounts);
  const ready = problems.length === 0;

  return (
    <aside
      className="absolute right-0 top-0 bottom-0 z-30 w-[380px] max-w-[92vw] bg-white
        border-l border-[#E8E4DF] shadow-[-4px_0_24px_rgba(17,17,17,0.06)]
        flex flex-col animate-in slide-in-from-right-2 fade-in duration-150"
      aria-label="Review this automation"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#F0EDE8]">
        <h2 className="text-[15px] font-semibold text-[#111111]">Your automation</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 -mr-1.5 rounded-lg text-[#6B6B6B] hover:bg-[#F7F5F2] hover:text-[#111111]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
          aria-label="Close review"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-2.5">
          {lines.length === 0 && (
            <p className="text-[12.5px] text-[#8A857E]">
              Nothing here yet — describe what should happen and Populr will build it.
            </p>
          )}
          {lines.map((line, i) => (
            <button
              key={`${line.nodeId}-${i}`}
              type="button"
              onClick={() => onSelectNode(line.nodeId)}
              style={{ paddingLeft: `${line.depth * 14}px` }}
              className="block w-full text-left group focus-visible:outline-none
                focus-visible:ring-2 focus-visible:ring-[#C5FF3D] rounded px-1 -mx-1 py-0.5"
            >
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#8A857E]">
                {line.lead}
              </span>
              {line.body && (
                <span className="block text-[13.5px] leading-snug text-[#111111] group-hover:underline
                  underline-offset-2 decoration-[#D8D3CC]">
                  {line.body}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-[#F0EDE8]">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#8A857E] mb-2">
            Before it goes live
          </h3>

          {checking && (
            <p className="flex items-center gap-1.5 text-[12.5px] text-[#6B6B6B]">
              <Loader2 size={13} className="animate-spin" /> Checking…
            </p>
          )}

          {!checking && ready && (
            <p className="flex items-start gap-1.5 text-[12.5px] text-[#3F6212]">
              <Check size={14} className="mt-0.5 shrink-0" />
              Everything's ready — this can go live.
            </p>
          )}

          {!checking && problems.map((problem, i) => (
            <button
              key={i}
              type="button"
              onClick={() => problem.nodeId && onSelectNode(problem.nodeId)}
              disabled={!problem.nodeId}
              className="flex items-start gap-1.5 w-full text-left py-1 text-[12.5px] text-[#9A3412]
                enabled:hover:underline underline-offset-2 focus-visible:outline-none
                focus-visible:ring-2 focus-visible:ring-[#C5FF3D] rounded"
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{problem.message}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
