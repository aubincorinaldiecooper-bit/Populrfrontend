/* The builder's pure logic: layout, graph reading, and the plain-English
 * Review translation.
 *
 * These are the parts that decide whether a creator can understand their own
 * automation, and they're pure functions — so they're worth pinning precisely
 * rather than exercising through a rendered canvas.
 */
import { describe, it, expect } from 'vitest';
import { layoutGraph, needsLayout, graphBounds, NODE_WIDTH } from '../lib/flowLayout';
import {
  describeDuration, newNodeId, nextNodeId, readCondition, readSend, readTrigger, readWait,
  branchesFor, emptyGraph, type FlowGraph,
} from '../lib/flowSchema';

function graph(nodes: [string, string][], edges: [string, string, string][]): FlowGraph {
  return {
    schemaVersion: 1,
    nodes: nodes.map(([id, type]) => ({
      id, type: type as never, position: { x: 0, y: 0 }, config: {},
    })),
    edges: edges.map(([source, target, branch]) => ({
      id: `${source}-${branch}-${target}`, source, target, branch: branch as never,
    })),
  };
}

/** The brief's canonical flow. */
const canonical = graph(
  [['trigger', 'trigger'], ['send', 'send'], ['wait', 'wait'], ['ask', 'condition'],
   ['followup', 'send'], ['tag', 'action']],
  [['trigger', 'send', 'next'], ['send', 'wait', 'next'], ['wait', 'ask', 'next'],
   ['ask', 'followup', 'no'], ['followup', 'tag', 'next']],
);

describe('flow layout', () => {
  it('places each step to the right of the one before it', () => {
    const laid = layoutGraph(canonical);
    const x = (id: string) => laid.nodes.find(n => n.id === id)!.position.x;
    expect(x('trigger')).toBeLessThan(x('send'));
    expect(x('send')).toBeLessThan(x('wait'));
    expect(x('wait')).toBeLessThan(x('ask'));
    expect(x('ask')).toBeLessThan(x('followup'));
  });

  it('steps a No branch down so it reads as a detour, not a fork of equals', () => {
    const laid = layoutGraph(canonical);
    const y = (id: string) => laid.nodes.find(n => n.id === id)!.position.y;
    expect(y('followup')).toBeGreaterThan(y('ask'));
  });

  it('keeps the Yes branch on the main line', () => {
    const withYes = graph(
      [['trigger', 'trigger'], ['ask', 'condition'], ['yes', 'send'], ['no', 'send']],
      [['trigger', 'ask', 'next'], ['ask', 'yes', 'yes'], ['ask', 'no', 'no']],
    );
    const laid = layoutGraph(withYes);
    const y = (id: string) => laid.nodes.find(n => n.id === id)!.position.y;
    expect(y('yes')).toBe(y('ask'));
    expect(y('no')).toBeGreaterThan(y('yes'));
  });

  it('is deterministic — the AI regenerating a graph must not reshuffle it', () => {
    const a = layoutGraph(canonical);
    const b = layoutGraph(canonical);
    expect(a.nodes.map(n => n.position)).toEqual(b.nodes.map(n => n.position));
  });

  it('parks a disconnected step somewhere visible instead of stacking it at the origin', () => {
    const withOrphan: FlowGraph = {
      ...canonical,
      nodes: [...canonical.nodes, { id: 'lonely', type: 'action', position: { x: 0, y: 0 }, config: {} }],
    };
    const laid = layoutGraph(withOrphan);
    const lonely = laid.nodes.find(n => n.id === 'lonely')!;
    const trigger = laid.nodes.find(n => n.id === 'trigger')!;
    expect(lonely.position).not.toEqual(trigger.position);
  });

  it('never places a node twice in the same spot', () => {
    const laid = layoutGraph(canonical);
    const seen = new Set(laid.nodes.map(n => `${n.position.x},${n.position.y}`));
    expect(seen.size).toBe(laid.nodes.length);
  });

  it('only claims a graph needs layout when nothing has been placed', () => {
    expect(needsLayout(canonical)).toBe(true);
    expect(needsLayout(layoutGraph(canonical))).toBe(false);
    expect(needsLayout(emptyGraph())).toBe(false);
  });

  it('bounds cover every node', () => {
    const laid = layoutGraph(canonical);
    const bounds = graphBounds(laid);
    const maxX = Math.max(...laid.nodes.map(n => n.position.x));
    expect(bounds.width).toBeGreaterThanOrEqual(maxX - bounds.x + NODE_WIDTH);
  });
});

describe('graph reading', () => {
  it('follows the branch it was asked for', () => {
    expect(nextNodeId(canonical, 'ask', 'no')).toBe('followup');
    expect(nextNodeId(canonical, 'ask', 'yes')).toBeNull();
    expect(nextNodeId(canonical, 'trigger')).toBe('send');
  });

  it('gives an If two exits and everything else one', () => {
    expect(branchesFor('condition')).toEqual(['yes', 'no']);
    expect(branchesFor('send')).toEqual(['next']);
    expect(branchesFor('trigger')).toEqual(['next']);
  });

  it('mints ids that do not collide', () => {
    const g = graph([['send', 'send']], []);
    expect(newNodeId('send', g)).toBe('send-2');
    expect(newNodeId('wait', g)).toBe('wait');
  });
});

describe('config readers tolerate whatever is stored', () => {
  const node = (config: Record<string, unknown>, type = 'trigger') =>
    ({ id: 'n', type, position: { x: 0, y: 0 }, config }) as never;

  it('defaults a trigger rather than throwing on an empty config', () => {
    const cfg = readTrigger(node({}));
    expect(cfg.kind).toBe('comment');
    expect(cfg.keywords).toEqual([]);
    expect(cfg.allowMultipleRuns).toBe(false);
  });

  it('drops junk out of a keyword list instead of rendering it', () => {
    expect(readTrigger(node({ keywords: ['guide', 42, null, '  ', 'menu'] })).keywords)
      .toEqual(['guide', 'menu']);
  });

  it('falls back on an unrecognised kind rather than trusting it', () => {
    expect(readTrigger(node({ kind: 'telepathy' })).kind).toBe('comment');
  });

  it('defaults a reply check to answering now, so a preceding Wait is the only delay', () => {
    expect(readCondition(node({ kind: 'replied' }, 'condition')).withinMinutes).toBe(0);
  });

  it('never lets a wait round down to zero and busy-loop the runtime', () => {
    expect(readWait(node({ minutes: 0 }, 'wait')).minutes).toBe(1);
    expect(readWait(node({ minutes: -5 }, 'wait')).minutes).toBe(1);
    expect(readWait(node({ minutes: 'nonsense' }, 'wait')).minutes).toBe(60);
  });

  it('keeps only buttons that have a label', () => {
    const cfg = readSend(node({ buttons: [{ label: 'Open' }, { url: 'https://x.com' }, null] }, 'send'));
    expect(cfg.buttons).toEqual([{ label: 'Open', url: undefined }]);
  });
});

describe('duration wording', () => {
  it('reads the way a creator would say it', () => {
    expect(describeDuration(1)).toBe('1 minute');
    expect(describeDuration(45)).toBe('45 minutes');
    expect(describeDuration(60)).toBe('1 hour');
    expect(describeDuration(1440)).toBe('1 day');
    expect(describeDuration(2880)).toBe('2 days');
  });
});
