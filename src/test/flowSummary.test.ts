import { describe, expect, it } from 'vitest';
import type { AutomationFlow } from '../lib/api';
import { automationsUsingToolkit } from '../lib/flowSummary';

function flow(id: string, nodes: AutomationFlow['graph']['nodes']): AutomationFlow {
  return {
    id,
    name: id,
    status: 'live',
    accountId: null,
    platform: 'instagram',
    graph: { schemaVersion: 1, nodes, edges: [] },
    version: 1,
    legacyAutomationId: null,
    activatedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const action = (id: string, toolkitSlug: string) => ({
  id,
  type: 'action' as const,
  position: { x: 0, y: 0 },
  config: { kind: 'run_integration', toolkitSlug },
});

describe('automationsUsingToolkit', () => {
  it('returns flows with a matching integration action and compares the requested slug case-insensitively', () => {
    const flows = [
      flow('shopify-flow', [action('action-1', 'shopify')]),
      flow('calendar-flow', [action('action-2', 'googlecalendar')]),
      flow('other-node-type', [{
        ...action('send-1', 'shopify'),
        type: 'trigger',
      }]),
      flow('different-action', [{
        ...action('action-3', 'shopify'),
        config: { kind: 'add_tag', toolkitSlug: 'shopify' },
      }]),
    ];

    expect(automationsUsingToolkit(flows, 'SHOPIFY').map(item => item.id)).toEqual([
      'shopify-flow',
    ]);
  });
});
