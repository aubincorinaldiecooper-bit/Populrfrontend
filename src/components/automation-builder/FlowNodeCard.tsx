import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Zap, GitBranch, Send, Clock, Sparkles, Plus, MessageCircle, Bell, Tag, TrendingUp,
} from 'lucide-react';
import {
  NODE_LABEL, branchesFor, describeDuration,
  readAction, readCondition, readSend, readTrigger, readWait,
  type FlowNode, type FlowNodeType,
} from '../../lib/flowSchema';
import { platformMeta } from '../../lib/platformMeta';
import type { PostLibraryItem } from '../../lib/api';

/**
 * One step on the canvas.
 *
 * Every node is the same white card with the same subtle border. Type is
 * carried by a small monochrome glyph and a word, never by colour — colouring
 * five node types would turn a calm canvas into a chart, and the brief's whole
 * point is that this should feel quieter than the tools it replaces. Lime is
 * spent on exactly two things here: the selected outline and the just-changed
 * highlight.
 *
 * Nodes are not numbered. A number implies a sequence, and the moment a
 * creator adds a branch or inserts a step the numbers say something false.
 */

const ICONS: Record<FlowNodeType, typeof Zap> = {
  trigger: Zap,
  condition: GitBranch,
  send: Send,
  wait: Clock,
  action: Sparkles,
};

const ACTION_ICONS: Record<string, typeof Zap> = {
  add_tag: Tag,
  remove_tag: Tag,
  set_stage: TrendingUp,
  notify_creator: Bell,
};

export interface FlowNodeData extends Record<string, unknown> {
  node: FlowNode;
  selected: boolean;
  highlighted: boolean;
  /** A validation problem belonging to this step, if any. */
  problem: string | null;
  post: PostLibraryItem | null;
  onAddAfter: (nodeId: string, branch: 'next' | 'yes' | 'no') => void;
  hasOutgoing: (nodeId: string, branch: 'next' | 'yes' | 'no') => boolean;
}

/** The one-line description under the node's title. */
function summarize(node: FlowNode): string {
  switch (node.type) {
    case 'trigger': {
      const cfg = readTrigger(node);
      const where = cfg.kind === 'dm' ? 'sends a DM' : 'comments';
      if (cfg.matchMode === 'any') return `Someone ${where}`;
      if (!cfg.keywords.length) return `Someone ${where} a keyword`;
      return `Someone ${where} ${cfg.keywords.map(k => `“${k}”`).join(' or ')}`;
    }
    case 'condition': {
      const cfg = readCondition(node);
      if (cfg.kind === 'replied') return 'They replied';
      if (cfg.kind === 'has_tag') return cfg.tag ? `Tagged “${cfg.tag}”` : 'Has a tag';
      if (cfg.matchMode === 'any') return 'Any message';
      return cfg.keywords.length
        ? `Message contains ${cfg.keywords.map(k => `“${k}”`).join(' or ')}`
        : 'Message contains…';
    }
    case 'send': {
      const cfg = readSend(node);
      const text = cfg.text.trim();
      if (text) return text.length > 64 ? `${text.slice(0, 64)}…` : text;
      if (cfg.mediaUrl) return 'An attachment';
      return cfg.kind === 'dm' ? 'Write the DM' : 'Write the reply';
    }
    case 'wait':
      return describeDuration(readWait(node).minutes);
    case 'action': {
      const cfg = readAction(node);
      if (cfg.kind === 'add_tag') return cfg.tag ? `Add tag: ${cfg.tag}` : 'Add a tag';
      if (cfg.kind === 'remove_tag') return cfg.tag ? `Remove tag: ${cfg.tag}` : 'Remove a tag';
      if (cfg.kind === 'set_stage') return cfg.stage ? `Stage: ${cfg.stage}` : 'Set the stage';
      return 'Notify me';
    }
  }
}

/** The word in the node header — the type, refined by its kind where useful. */
function heading(node: FlowNode): string {
  if (node.type === 'send') return readSend(node).kind === 'dm' ? 'Send DM' : 'Reply';
  return NODE_LABEL[node.type];
}

function NodeIcon({ node }: { node: FlowNode }) {
  if (node.type === 'action') {
    const Icon = ACTION_ICONS[readAction(node).kind] ?? Sparkles;
    return <Icon size={13} strokeWidth={2} />;
  }
  if (node.type === 'send' && readSend(node).kind === 'comment_reply') {
    return <MessageCircle size={13} strokeWidth={2} />;
  }
  const Icon = ICONS[node.type];
  return <Icon size={13} strokeWidth={2} />;
}

/**
 * The trigger's content preview: the actual post the automation watches.
 * Showing the real thumbnail is what connects an abstract graph to the
 * creator's own work — "the Free Creator Guide reel", not "post 12".
 */
function TriggerContent({ node, post }: { node: FlowNode; post: PostLibraryItem | null }) {
  const cfg = readTrigger(node);
  if (cfg.kind === 'dm') return null;

  if (cfg.allPosts) {
    return (
      <div className="mt-2 text-[11px] text-[#8A857E] border-t border-[#F0EDE8] pt-2">
        Any post or reel
      </div>
    );
  }

  if (!cfg.postId) {
    return (
      <div className="mt-2 text-[11px] text-[#B45309] border-t border-[#F0EDE8] pt-2">
        Choose a post
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2 border-t border-[#F0EDE8] pt-2">
      {post?.media_url ? (
        <img
          src={post.media_url}
          alt=""
          className="w-8 h-8 rounded object-cover shrink-0 bg-[#F0EDE8]"
          loading="lazy"
        />
      ) : (
        <div className="w-8 h-8 rounded bg-[#F0EDE8] shrink-0" />
      )}
      <span className="text-[11px] text-[#6B6B6B] leading-tight line-clamp-2">
        {post?.caption?.trim() || 'Selected post'}
      </span>
    </div>
  );
}

/**
 * The + control that adds a step after this one. Deliberately only present on
 * hover or selection: a canvas with a permanent + under every node is the
 * cluttered look this builder exists to avoid.
 */
function AddButton({
  onClick, label, className,
}: { onClick: () => void; label: string; className: string }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={`absolute w-6 h-6 rounded-full bg-white border border-[#E8E4DF] text-[#6B6B6B]
        flex items-center justify-center shadow-sm transition-colors
        hover:border-[#C5FF3D] hover:text-[#111111] focus-visible:outline-none
        focus-visible:ring-2 focus-visible:ring-[#C5FF3D] ${className}`}
      aria-label={label}
      title={label}
    >
      <Plus size={13} strokeWidth={2.5} />
    </button>
  );
}

function FlowNodeCardInner({ data }: NodeProps) {
  const { node, selected, highlighted, problem, post, onAddAfter, hasOutgoing } =
    data as unknown as FlowNodeData;
  const [hovered, setHovered] = useState(false);
  const showControls = hovered || selected;
  const branches = branchesFor(node.type);
  const platform = node.type === 'trigger' ? readTrigger(node).platform : null;
  const PlatformIcon = platform ? platformMeta(platform).icon : null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {node.type !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2 !h-2 !bg-[#D8D3CC] !border-0"
        />
      )}

      <div
        className={`w-[210px] rounded-xl bg-white px-3 py-2.5 transition-[box-shadow,border-color] duration-200
          ${selected
            ? 'border-2 border-[#C5FF3D] shadow-[0_2px_10px_rgba(17,17,17,0.06)]'
            : 'border border-[#E8E4DF] shadow-[0_1px_3px_rgba(17,17,17,0.04)]'}
          ${highlighted ? 'ring-2 ring-[#C5FF3D] ring-offset-2 ring-offset-[#F7F5F2]' : ''}
          ${problem && !selected ? 'border-[#E7C9A8]' : ''}`}
        style={{ padding: selected ? 'calc(0.625rem - 1px) calc(0.75rem - 1px)' : undefined }}
      >
        <div className="flex items-center gap-1.5 text-[#111111]">
          <NodeIcon node={node} />
          <span className="text-[11px] font-semibold tracking-wide uppercase">{heading(node)}</span>
          {PlatformIcon && (
            <PlatformIcon size={12} className="ml-auto text-[#8A857E]" />
          )}
        </div>

        <p className="mt-1 text-[13px] leading-snug text-[#111111] line-clamp-3">
          {summarize(node)}
        </p>

        {node.type === 'trigger' && <TriggerContent node={node} post={post} />}

        {problem && (
          <p className="mt-2 text-[11px] leading-tight text-[#B45309]">{problem}</p>
        )}
      </div>

      {/* Outgoing handles + the hover-revealed add controls. A condition gets
          two, labelled Yes and No right at the connector so the answer is
          readable without following the edge. */}
      {branches.map((branch, i) => (
        <Handle
          key={branch}
          id={branch}
          type="source"
          position={Position.Right}
          style={branches.length > 1 ? { top: `${35 + i * 30}%` } : undefined}
          className="!w-2 !h-2 !bg-[#D8D3CC] !border-0"
        />
      ))}

      {showControls && branches.map((branch, i) => (
        hasOutgoing(node.id, branch) ? null : (
          <AddButton
            key={branch}
            onClick={() => onAddAfter(node.id, branch)}
            label={branch === 'next' ? 'Add a step' : `Add a step for ${branch}`}
            className={branches.length > 1
              ? `-right-8 ${i === 0 ? 'top-[26%]' : 'top-[56%]'}`
              : '-right-8 top-1/2 -translate-y-1/2'}
          />
        )
      ))}
    </div>
  );
}

export const FlowNodeCard = memo(FlowNodeCardInner);
