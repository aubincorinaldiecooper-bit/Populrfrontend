/* The controls a creator actually operates, and the two that were broken.
 *
 * The Wait field is here because it was unusable in a way that reads as
 * trivial and isn't: the value snapped back to 1 on every keystroke, so a
 * creator could not set any duration that wasn't already showing. The tag
 * picker and relative dates are here because they replaced a plain input and
 * a raw date, and the point of both is what a creator can now do without
 * leaving the step.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NodeInspector from '../components/automation-builder/NodeInspector';
import TagCombobox from '../components/automation-builder/TagCombobox';
import { normalizeTag } from '../lib/tags';
import Select from '../components/automation-builder/Select';
import { timeAgo } from '../lib/timeAgo';
import type { FlowNode } from '../lib/flowSchema';
import type { ConnectedAccount, PlatformCapabilities, PostLibraryItem } from '../lib/api';

function inspector(node: FlowNode, onChange = vi.fn(), extra: Partial<{
  posts: PostLibraryItem[]; accounts: ConnectedAccount[]; workspaceTags: string[];
}> = {}) {
  render(
    <NodeInspector
      node={node}
      accounts={extra.accounts ?? []}
      posts={extra.posts ?? []}
      postsLoading={false}
      capabilities={null as PlatformCapabilities | null}
      workspaceTags={extra.workspaceTags ?? []}
      problems={[]}
      onChange={onChange}
      onDelete={vi.fn()}
      onClose={vi.fn()}
      onRefreshPosts={vi.fn()}
    />,
  );
  return onChange;
}

const waitNode: FlowNode = {
  id: 'wait', type: 'wait', position: { x: 0, y: 0 }, config: { kind: 'duration', minutes: 60 },
};

describe('the Wait duration field', () => {
  it('can be cleared so a different number can be typed', () => {
    const onChange = inspector(waitNode);
    const input = screen.getByLabelText('Duration') as HTMLInputElement;

    // This is the bug: clearing used to coerce straight back to "1".
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');

    fireEvent.change(input, { target: { value: '30' } });
    expect(input.value).toBe('30');
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'duration', minutes: 30 * 60 });
  });

  it('commits nothing while the field is empty', () => {
    const onChange = inspector(waitNode);
    const input = screen.getByLabelText('Duration');

    onChange.mockClear();
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('restores the stored value if left empty', () => {
    inspector(waitNode);
    const input = screen.getByLabelText('Duration') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input.value).toBe('1'); // 60 minutes, shown as 1 hour
  });

  it('ignores characters that aren\'t digits', () => {
    inspector(waitNode);
    const input = screen.getByLabelText('Duration') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '3a-b' } });
    expect(input.value).toBe('3');
  });

  it('converts when the unit changes, keeping the number typed', () => {
    const onChange = inspector(waitNode);
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '2' } });

    fireEvent.click(screen.getByLabelText('Duration unit'));
    fireEvent.click(screen.getByText('days'));

    expect(onChange).toHaveBeenLastCalledWith({ kind: 'duration', minutes: 2 * 1440 });
  });
});

describe('the tag picker', () => {
  const actionNode: FlowNode = {
    id: 'a', type: 'action', position: { x: 0, y: 0 }, config: { kind: 'add_tag', tag: null },
  };

  it('offers the tags the workspace already uses', () => {
    inspector(actionNode, vi.fn(), { workspaceTags: ['warm_lead', 'vip'] });
    fireEvent.focus(screen.getByLabelText('Tag'));

    expect(screen.getByText('warm_lead')).toBeInTheDocument();
    expect(screen.getByText('vip')).toBeInTheDocument();
  });

  it('lets a new tag be created without leaving the step', () => {
    const onChange = inspector(actionNode, vi.fn(), { workspaceTags: ['warm_lead'] });
    const input = screen.getByLabelText('Tag');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Hot Lead' } });
    fireEvent.click(screen.getByText('hot_lead'));

    // Normalised on the way in, so it can't become a near-duplicate of a tag
    // typed slightly differently somewhere else.
    expect(onChange).toHaveBeenCalledWith({ tag: 'hot_lead' });
  });

  it('does not offer to create a tag that already exists', () => {
    render(<TagCombobox value={null} tags={['warm_lead']} onChange={vi.fn()} />);
    const input = screen.getByLabelText('Tag');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'warm_lead' } });

    expect(screen.queryByText('Create')).not.toBeInTheDocument();
  });

  it('normalises the way the rest of the product stores tags', () => {
    expect(normalizeTag('  Warm Lead ')).toBe('warm_lead');
    expect(normalizeTag('VIP!!')).toBe('vip');
  });
});

describe('the dropdown', () => {
  it('shows a description so a choice explains itself', () => {
    render(
      <Select
        value="add_tag"
        ariaLabel="What to do"
        options={[
          { value: 'add_tag', label: 'Add a tag', description: 'Labels them in Contacts.' },
          { value: 'notify_creator', label: 'Tell me about them', description: 'Puts them in Needs Reply.' },
        ]}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('What to do'));
    expect(screen.getByText('Labels them in Contacts.')).toBeInTheDocument();
    expect(screen.getByText('Puts them in Needs Reply.')).toBeInTheDocument();
  });

  it('commits a choice with the keyboard', () => {
    const onChange = vi.fn();
    render(
      <Select
        value="a"
        ariaLabel="Pick"
        options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]}
        onChange={onChange}
      />,
    );
    const button = screen.getByLabelText('Pick');
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('never commits a disabled option', () => {
    const onChange = vi.fn();
    render(
      <Select
        value="a"
        ariaLabel="Pick"
        options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta', disabled: true }]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Pick'));
    fireEvent.click(screen.getByText('Beta'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('the post picker', () => {
  const post = (id: string, handle: string): PostLibraryItem => ({
    id, account_id: 'acc_1', platform: 'instagram', external_post_id: `x${id}`,
    url: null, caption: `Post ${id}`, media_url: null, published_at: new Date().toISOString(),
    likes: '1', comments: '1', shares: null, saves: null, views: null, impressions: null,
    reach: null, engagement_rate: null, account_username: handle,
    contacts_generated: '0', warm_leads: '0', hot_leads: '0', dms_sent: '0', funnels_attached: '0',
  });

  it('names the account each post belongs to', () => {
    const triggerNode: FlowNode = {
      id: 't', type: 'trigger', position: { x: 0, y: 0 },
      config: { kind: 'comment', accountId: 'acc_1', allPosts: false, matchMode: 'any' },
    };
    inspector(triggerNode, vi.fn(), {
      accounts: [{
        id: 'acc_1', platform: 'instagram', username: 'populr.space', display_name: null,
        avatar_url: null, is_connected: true, status: 'connected', connected_at: null,
      }],
      posts: [post('1', 'populr.space')],
    });

    // Twice: once where the account was chosen, once on the post card itself.
    // The card is the one that matters — without it, a post attributed to the
    // wrong account is indistinguishable from a correct one.
    expect(screen.getAllByText('@populr.space')).toHaveLength(2);
  });
});

describe('relative time', () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

  it('reads the way someone would say it', () => {
    expect(timeAgo(ago(5_000))).toBe('just now');
    expect(timeAgo(ago(20 * 60_000))).toBe('20m ago');
    expect(timeAgo(ago(2 * 3_600_000))).toBe('2h ago');
    expect(timeAgo(ago(26 * 3_600_000))).toBe('yesterday');
    expect(timeAgo(ago(3 * 86_400_000))).toBe('3d ago');
  });

  it('falls back to a date once relative stops being easier to read', () => {
    expect(timeAgo(ago(40 * 86_400_000))).toMatch(/\d/);
    expect(timeAgo(ago(40 * 86_400_000))).not.toMatch(/ago/);
  });

  it('treats a clock skewed slightly ahead as just now', () => {
    expect(timeAgo(new Date(Date.now() + 3000).toISOString())).toBe('just now');
  });

  it('says nothing for a missing date', () => {
    expect(timeAgo(null)).toBe('');
    expect(timeAgo('not a date')).toBe('');
  });
});

describe('the account picker', () => {
  // The bug report's exact dropdown: one connected Instagram account and a
  // trail of needs-reconnecting rows — LinkedIn, Reddit, X, and a stale
  // duplicate of the same Instagram handle left over from a reconnect.
  const account = (
    id: string, platform: string, username: string, status: ConnectedAccount['status'],
  ): ConnectedAccount => ({
    id, platform, username, display_name: username, avatar_url: null,
    is_connected: status === 'connected', status, connected_at: null,
  });
  const roster = [
    account('ig_live', 'instagram', 'thesupersecretclubb', 'connected'),
    account('li_1', 'linkedin', 'Aubin Cooper', 'reconnect_required'),
    account('rd_1', 'reddit', 'Aubinthegr3at', 'reconnect_required'),
    account('x_1', 'x', 'Aubin250193', 'reconnect_required'),
    account('ig_stale', 'instagram', 'thesupersecretclubb', 'reconnect_required'),
  ];
  const trigger = (accountId: string | null): FlowNode => ({
    id: 'trigger', type: 'trigger', position: { x: 0, y: 0 },
    config: { kind: 'comment', accountId, platform: accountId ? 'instagram' : null, allPosts: true, matchMode: 'any' },
  });

  it('offers only connected accounts', () => {
    inspector(trigger(null), vi.fn(), { accounts: roster });
    fireEvent.click(screen.getByLabelText('Account'));

    // Exactly one option: the connected Instagram. Not the four
    // needs-reconnecting rows, and not the stale duplicate of the same handle.
    expect(screen.getAllByText('@thesupersecretclubb')).toHaveLength(1);
    expect(screen.queryByText('@Aubin Cooper')).not.toBeInTheDocument();
    expect(screen.queryByText('@Aubinthegr3at')).not.toBeInTheDocument();
    expect(screen.queryByText('@Aubin250193')).not.toBeInTheDocument();
    expect(screen.queryByText(/needs reconnecting/)).not.toBeInTheDocument();
  });

  it('still shows the account a flow is already bound to, marked, so the binding is not denied', () => {
    inspector(trigger('li_1'), vi.fn(), { accounts: roster });

    // The closed control names the bound account and warns about it…
    expect(screen.getByText('This account needs reconnecting before the automation can run.')).toBeInTheDocument();

    // …and the open list carries it (annotated) alongside the connected one,
    // so the creator can see what is bound and pick something that runs.
    fireEvent.click(screen.getByLabelText('Account'));
    expect(screen.getAllByText('@Aubin Cooper').length).toBeGreaterThan(0);
    expect(screen.getAllByText('@thesupersecretclubb')).toHaveLength(1);
    expect(screen.queryByText('@Aubinthegr3at')).not.toBeInTheDocument();
  });

  it('points at Channels when nothing is connected', () => {
    inspector(trigger(null), vi.fn(), { accounts: roster.filter(a => a.status !== 'connected' && a.id !== 'li_1') });
    expect(screen.getByText('No connected accounts. Reconnect one under Channels first.')).toBeInTheDocument();
  });
});
