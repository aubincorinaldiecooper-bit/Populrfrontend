import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { render } from './render';
import CollaboratorFacepile from '../components/automation-builder/CollaboratorFacepile';
import type { Collaborator } from '../lib/api';

/* Who else is on this canvas.
 *
 * Two people could always build on one automation — that is what a canvas
 * invite is — and until now neither could tell. Autosave means the last write
 * wins, so two people improving the same message take turns overwriting each
 * other while both believe they are working alone.
 *
 * The facepile is not a lock. Nothing here stops anyone editing; it ends the
 * part where you couldn't know. What this file pins:
 *   - faces are the people who are HERE, and never your own;
 *   - the builder says hello while it's open and goodbye on the way out, so
 *     the others see someone leave when they leave;
 *   - nobody here is nothing on screen — an empty pile is not a widget.
 */

const fetchCollaborators = vi.fn();
const announcePresence = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchCollaborators: (...args: unknown[]) => fetchCollaborators(...args),
    announcePresence: (...args: unknown[]) => announcePresence(...args),
  };
});

function person(name: string, here: boolean, you = false): Collaborator {
  return {
    person: { name, email: `${name.toLowerCase()}@example.com`, avatarUrl: null },
    role: you ? 'owner' : 'member',
    you,
    here,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  announcePresence.mockResolvedValue(undefined);
  fetchCollaborators.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the facepile', () => {
  it('shows the people who are here', async () => {
    fetchCollaborators.mockResolvedValue([person('Bo', true), person('Cass', true)]);
    render(<CollaboratorFacepile flowId="7" />);
    // One label for the group: three images each announcing a name would be
    // read out as three unrelated things.
    expect(await screen.findByRole('group', { name: 'Bo and Cass are also here' })).toBeInTheDocument();
  });

  it('leaves out people who merely could be', async () => {
    // Everyone on this automation, but only one of them has it open. The
    // distinction is the entire point — "who can edit this" is the Team page.
    fetchCollaborators.mockResolvedValue([person('Bo', true), person('Cass', false)]);
    render(<CollaboratorFacepile flowId="7" />);
    const pile = await screen.findByRole('group');
    expect(pile.getAttribute('aria-label')).toBe('Bo is also here');
    expect(pile.getAttribute('aria-label')).not.toContain('Cass');
  });

  it('never counts you as somebody else', async () => {
    // Somebody genuinely else is here too, so the pile renders and the
    // question is who is IN it. Asserting on an empty header instead would
    // have proved nothing: the pile is empty for a moment on every mount,
    // and a test that reads it before the answer arrives passes whatever
    // the filter says.
    fetchCollaborators.mockResolvedValue([person('Ada', true, true), person('Bo', true)]);
    render(<CollaboratorFacepile flowId="7" />);
    const pile = await screen.findByRole('group');
    expect(pile.getAttribute('aria-label')).toBe('Bo is also here');
    expect(pile.getAttribute('aria-label')).not.toContain('Ada');
  });

  it('renders nothing at all when you are the only one here', async () => {
    fetchCollaborators.mockResolvedValue([person('Ada', true, true)]);
    const { container } = render(<CollaboratorFacepile flowId="7" />);
    // Wait for the answer to have ARRIVED and been rendered, not merely
    // asked for — otherwise this passes on the empty first frame.
    await waitFor(() => expect(fetchCollaborators).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(container.textContent).toBe('');
  });

  it('and nothing when the canvas is genuinely empty', async () => {
    const { container } = render(<CollaboratorFacepile flowId="7" />);
    await waitFor(() => expect(fetchCollaborators).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toBe('');
  });

  it('becomes a number past three faces', async () => {
    fetchCollaborators.mockResolvedValue([
      person('Bo', true), person('Cass', true), person('Dee', true), person('Eli', true),
    ]);
    render(<CollaboratorFacepile flowId="7" />);
    // Five circles in a header is a crowd; the fifth would push the
    // automation's name off screen.
    expect(await screen.findByText('+1')).toBeInTheDocument();
    // The label still names everyone — the truncation is visual, and a
    // screen reader has room for the sentence.
    const pile = screen.getByRole('group');
    expect(pile.getAttribute('aria-label')).toContain('Eli');
  });
});

describe('the heartbeat', () => {
  it('says hello as soon as the builder opens', async () => {
    render(<CollaboratorFacepile flowId="7" />);
    await waitFor(() => expect(announcePresence).toHaveBeenCalledWith('7'));
  });

  it('says goodbye on the way out', async () => {
    const { unmount } = render(<CollaboratorFacepile flowId="7" />);
    await waitFor(() => expect(announcePresence).toHaveBeenCalledWith('7'));
    announcePresence.mockClear();

    unmount();
    // Explicit, rather than waiting out the server's staleness window: the
    // others should see someone leave when they leave, not forty seconds
    // later.
    expect(announcePresence).toHaveBeenCalledWith('7', true);
  });

  it('keeps saying it while the builder stays open', async () => {
    vi.useFakeTimers();
    render(<CollaboratorFacepile flowId="7" />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(announcePresence).toHaveBeenCalledTimes(1);

    // A single hello would let the server age this creator off everyone
    // else's canvas while they are still sitting on it.
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(announcePresence).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(announcePresence).toHaveBeenCalledTimes(3);
  });

  it('says nothing at all before the automation exists', async () => {
    // The builder mounts on a flow that hasn't been created yet. Announcing
    // presence on nothing would be a request with no subject.
    render(<CollaboratorFacepile flowId={null} />);
    await waitFor(() => expect(announcePresence).not.toHaveBeenCalled());
    expect(fetchCollaborators).not.toHaveBeenCalled();
  });
});
