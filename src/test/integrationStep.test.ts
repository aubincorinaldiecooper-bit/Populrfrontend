import { describe, it, expect } from 'vitest';
import { readAction, NODE_KINDS, ACTION_OPTIONS } from '../lib/flowSchema';
import { describeFlow } from '../lib/flowSummary';
import { coerceArgument, displayArgument } from '../lib/toolArguments';
import type { FlowGraph, FlowNode } from '../lib/flowSchema';

/* "Use a connected app" as an automation step, on the frontend side.
 *
 * The step is a new `kind` on the existing action node rather than a sixth
 * node type — the schema is explicitly built for that — so what needs pinning
 * is the reading of it: a stored graph is plain JSON that may have been
 * written by an older build or by the AI composer, and every access narrows
 * with a fallback. A graph written before this step existed must still parse,
 * and a malformed one must not hand a broken shape to the editor. */

function actionNode(config: Record<string, unknown>): FlowNode {
  return { id: 'a1', type: 'action', position: { x: 0, y: 0 }, config } as FlowNode;
}

describe('the run_integration step', () => {
  it('is offered as a thing a step can do', () => {
    expect(NODE_KINDS.action).toContain('run_integration');
    expect(ACTION_OPTIONS.map(o => o.value)).toContain('run_integration');
  });

  it('explains itself where the creator chooses it', () => {
    const option = ACTION_OPTIONS.find(o => o.value === 'run_integration');
    // The dropdown exists precisely so each option can say why you'd want it.
    expect(option?.description).toBeTruthy();
    expect(option?.label).toMatch(/app/i);
  });

  it('reads the app, the action and its arguments back out', () => {
    const cfg = readAction(
      actionNode({
        kind: 'run_integration',
        toolkitSlug: 'GoogleCalendar',
        toolSlug: 'GOOGLECALENDAR_CREATE_EVENT',
        toolArguments: { summary: 'Call with {{contact.name}}', minutes: 30 },
      }),
    );
    expect(cfg.kind).toBe('run_integration');
    // Lowercased on the way in: the slug is both a database key and a
    // provider identifier, and those two must never disagree on case.
    expect(cfg.toolkitSlug).toBe('googlecalendar');
    expect(cfg.toolSlug).toBe('GOOGLECALENDAR_CREATE_EVENT');
    expect(cfg.toolArguments).toEqual({ summary: 'Call with {{contact.name}}', minutes: 30 });
  });

  it('survives a graph written before this step existed', () => {
    const cfg = readAction(actionNode({ kind: 'add_tag', tag: 'warm_lead' }));
    expect(cfg.kind).toBe('add_tag');
    expect(cfg.toolkitSlug).toBeNull();
    expect(cfg.toolSlug).toBeNull();
    // An object, not undefined — the editor spreads this to add a field.
    expect(cfg.toolArguments).toEqual({});
  });

  it('refuses a malformed arguments blob rather than passing it on', () => {
    // A composer or an older build could write anything here; an array or a
    // string spread into the editor's field map would be a crash, and sent
    // to a third-party API would be worse.
    for (const bad of [['a', 'b'], 'nope', 42, null]) {
      expect(readAction(actionNode({ kind: 'run_integration', toolArguments: bad })).toolArguments).toEqual({});
    }
  });

  it('reads as plain English in the automation summary', () => {
    const graph: FlowGraph = {
      schemaVersion: 1,
      nodes: [
        {
          id: 'trigger', type: 'trigger', position: { x: 0, y: 0 },
          config: { kind: 'comment', accountId: 'acc_1', platform: 'instagram', allPosts: true, keywords: ['book'], matchMode: 'contains' },
        } as FlowNode,
        actionNode({ kind: 'run_integration', toolkitSlug: 'googlecalendar', toolSlug: 'GOOGLECALENDAR_CREATE_EVENT' }),
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'a1', branch: 'next' }],
    };
    const summary = describeFlow(graph);
    expect(JSON.stringify(summary).toLowerCase()).toContain('googlecalendar');
  });

  it('still says something useful before an app has been chosen', () => {
    const graph: FlowGraph = {
      schemaVersion: 1,
      nodes: [
        {
          id: 'trigger', type: 'trigger', position: { x: 0, y: 0 },
          config: { kind: 'comment', accountId: 'acc_1', platform: 'instagram', allPosts: true, keywords: ['book'], matchMode: 'contains' },
        } as FlowNode,
        actionNode({ kind: 'run_integration' }),
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'a1', branch: 'next' }],
    };
    // A half-built step is normal mid-edit; the summary must describe it
    // rather than render "uses undefined".
    expect(JSON.stringify(describeFlow(graph))).not.toContain('undefined');
  });
});

describe('tool arguments keep the type the tool asked for', () => {
  /* Every argument used to be stored as the raw string from its input, which
   * quietly broke anything that wasn't text: a duration of 30 became "30", a
   * flag couldn't be expressed at all, and the provider rejected otherwise
   * valid steps on schema validation. */

  it('stores a numeric argument as a number', () => {
    expect(coerceArgument('30', 'number')).toBe(30);
    expect(coerceArgument('30', 'integer')).toBe(30);
    expect(coerceArgument('  2.5  ', 'number')).toBe(2.5);
  });

  it('parses a structured argument rather than sending JSON as text', () => {
    expect(coerceArgument('{"a":1}', 'object')).toEqual({ a: 1 });
    expect(coerceArgument('[1,2]', 'array')).toEqual([1, 2]);
  });

  it('leaves a placeholder alone whatever the declared type', () => {
    // Resolved server-side at run time. Coercing it here turns it into NaN
    // before the substitution that would have given it a value.
    expect(coerceArgument('{{contact.name}}', 'number')).toBe('{{contact.name}}');
    expect(coerceArgument('{{contact.handle}}', 'object')).toBe('{{contact.handle}}');
  });

  it('does not destroy a half-typed value mid-keystroke', () => {
    // "-" and "not json yet" are on the way to something valid; turning them
    // into NaN would clear the field as the creator types.
    expect(coerceArgument('-', 'number')).toBe('-');
    expect(coerceArgument('not json', 'object')).toBe('not json');
  });

  it('round-trips a structured value back into the field as JSON', () => {
    expect(displayArgument({ a: 1 })).toBe('{"a":1}');
    expect(displayArgument([1, 2])).toBe('[1,2]');
    expect(displayArgument(30)).toBe('30');
    // Never "[object Object]", and never the string "undefined".
    expect(displayArgument(undefined)).toBe('');
    expect(displayArgument(null)).toBe('');
  });
});
