import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './render';
import NotesIndex from '../components/automation-builder/NotesIndex';
import NoteThread, { NoteComposer } from '../components/automation-builder/NoteThread';
import type { CommentThread } from '../lib/api';

/* Notes, as a person meets them.
 *
 * The rules this pins, all of which were decided against an earlier draft
 * that got them wrong:
 *   - the index is NAVIGATION. Picking a row closes it and goes to the note;
 *     it is not where notes are read, and it is never a column;
 *   - the Notes control stays at zero, because on a touch screen it is the
 *     only way to start one — but it shows no count there;
 *   - a pin says WHO and nothing else. No number: "2" could mean replies,
 *     unread or people, and we track none of those per reader;
 *   - resolving is offered to whoever raised the thread and to the owner,
 *     and to nobody else — separately from whether they may edit the graph.
 */

const stepLabel = (id: string) => (id === 'send-1' ? 'Message' : null);

function thread(over: Partial<CommentThread> = {}): CommentThread {
  return {
    id: 't1',
    body: 'This opens too abruptly — can we say who we are first?',
    by: { name: 'Robin', email: 'robin@example.com', avatarUrl: null },
    you: false,
    at: new Date().toISOString(),
    nodeId: 'send-1',
    place: { relX: 0.5, relY: 0.5 },
    nodeMissing: false,
    resolved: false,
    resolvedBy: null,
    replies: [],
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('the notes index', () => {
  it('keeps its place at zero, without inventing a count', async () => {
    const user = userEvent.setup();
    render(
      <NotesIndex threads={[]} count={0} stepLabel={stepLabel} onPick={vi.fn()} onLeaveNote={vi.fn()} />,
    );
    const control = screen.getByRole('button', { name: /Notes/ });
    // A "0" is a number nobody asked for; the control still has to be here,
    // because on a phone it is the only way to leave a note at all.
    expect(control).not.toHaveTextContent('0');

    await user.click(control);
    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Leave a note/ })).toBeInTheDocument();
  });

  it('counts the open threads once there are some', () => {
    render(
      <NotesIndex threads={[thread()]} count={3} stepLabel={stepLabel} onPick={vi.fn()} onLeaveNote={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Notes/ })).toHaveTextContent('3');
  });

  it('names who said it and where, and shows the reply count here', async () => {
    const user = userEvent.setup();
    render(
      <NotesIndex
        threads={[thread({ replies: [{ id: 'r1', body: 'ok', by: { name: 'Ada', email: 'a@e.com', avatarUrl: null }, you: true, at: new Date().toISOString() }] })]}
        count={1}
        stepLabel={stepLabel}
        onPick={vi.fn()}
        onLeaveNote={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Notes/ }));

    expect(await screen.findByText(/Robin · Message/)).toBeInTheDocument();
    // Reply counts live here and in the thread — never on a pin.
    expect(screen.getByText('1 reply')).toBeInTheDocument();
  });

  it('gets out of the way when it has pointed somewhere', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <NotesIndex threads={[thread()]} count={1} stepLabel={stepLabel} onPick={onPick} onLeaveNote={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: /Notes/ }));
    await user.click(await screen.findByText(/This opens too abruptly/));

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
    // Reading and replying happen at the pin. An index left open would sit
    // over the note it just took you to.
    await waitFor(() => expect(screen.queryByText('No notes yet')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Leave a note/ })).not.toBeInTheDocument());
  });

  it('hides resolved threads until asked', async () => {
    const user = userEvent.setup();
    render(
      <NotesIndex
        threads={[thread(), thread({ id: 't2', body: 'Settled point', resolved: true })]}
        count={1}
        stepLabel={stepLabel}
        onPick={vi.fn()}
        onLeaveNote={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Notes/ }));

    expect(await screen.findByText(/This opens too abruptly/)).toBeInTheDocument();
    expect(screen.queryByText('Settled point')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Show 1 resolved/ }));
    expect(await screen.findByText('Settled point')).toBeInTheDocument();
  });

  it('does not claim there are none before they have arrived', async () => {
    const user = userEvent.setup();
    render(
      <NotesIndex threads={[]} count={0} loading stepLabel={stepLabel} onPick={vi.fn()} onLeaveNote={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: /Notes/ }));

    // "No notes yet" is a claim, and whether anybody has said anything is
    // exactly what somebody opened this to find out.
    expect(await screen.findByLabelText('Loading notes')).toBeInTheDocument();
    expect(screen.queryByText('No notes yet')).not.toBeInTheDocument();
    // Leaving one is still offered — that never depended on the fetch.
    expect(screen.getByRole('button', { name: /^Leave a note/ })).toBeInTheDocument();
  });

  it('names a canvas note for what it is', async () => {
    const user = userEvent.setup();
    render(
      <NotesIndex
        threads={[thread({ nodeId: null, place: { x: 10, y: 20 } })]}
        count={1}
        stepLabel={stepLabel}
        onPick={vi.fn()}
        onLeaveNote={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Notes/ }));
    expect(await screen.findByText(/Robin · On the canvas/)).toBeInTheDocument();
  });
});

describe('a thread', () => {
  const handlers = () => ({
    onReply: vi.fn().mockResolvedValue(undefined),
    onSettle: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  });

  it('offers Resolve to whoever may settle it', () => {
    render(<NoteThread thread={thread()} where="Message" maySettle {...handlers()} />);
    expect(screen.getByRole('button', { name: /Resolve/ })).toBeInTheDocument();
  });

  it('offers it to nobody else, who can still reply', () => {
    render(<NoteThread thread={thread()} where="Message" maySettle={false} {...handlers()} />);
    // Not disabled — absent. A control that refuses is a worse answer than
    // one that was never somebody's to press.
    expect(screen.queryByRole('button', { name: /Resolve/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
  });

  it('says Reopen once it is settled', () => {
    render(<NoteThread thread={thread({ resolved: true })} where="Message" maySettle {...handlers()} />);
    expect(screen.getByRole('button', { name: /Reopen/ })).toBeInTheDocument();
  });

  it('lets you take back your own words and nobody else’s', () => {
    const mine = thread({
      you: true,
      replies: [{ id: 'r1', body: 'theirs', by: { name: 'Ada', email: 'a@e.com', avatarUrl: null }, you: false, at: new Date().toISOString() }],
    });
    render(<NoteThread thread={mine} where="Message" maySettle {...handlers()} />);
    expect(screen.getAllByRole('button', { name: 'Delete this note' })).toHaveLength(1);
  });

  it('sends a reply and clears the box', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<NoteThread thread={thread()} where="Message" maySettle {...h} />);

    await user.type(screen.getByLabelText('Reply to this note'), 'Fair — rewriting it.');
    await user.click(screen.getByRole('button', { name: 'Reply' }));

    await waitFor(() => expect(h.onReply).toHaveBeenCalledWith('Fair — rewriting it.'));
    await waitFor(() => expect(screen.getByLabelText('Reply to this note')).toHaveValue(''));
  });

  it('says so when a reply could not be sent, rather than swallowing it', async () => {
    const user = userEvent.setup();
    const h = handlers();
    h.onReply.mockRejectedValue(new Error('The server is busy.'));
    render(<NoteThread thread={thread()} where="Message" maySettle {...h} />);

    await user.type(screen.getByLabelText('Reply to this note'), 'Fair — rewriting it.');
    await user.click(screen.getByRole('button', { name: 'Reply' }));

    // Silence here reads as the app losing what you said, rather than the
    // network refusing it — and the words are still in the box either way.
    expect(await screen.findByRole('alert')).toHaveTextContent('The server is busy.');
    expect(screen.getByLabelText('Reply to this note')).toHaveValue('Fair — rewriting it.');
  });

  it('says so when resolving could not be saved', async () => {
    const user = userEvent.setup();
    const h = handlers();
    h.onSettle.mockRejectedValue(new Error('The server is busy.'));
    render(<NoteThread thread={thread()} where="Message" maySettle {...h} />);

    await user.click(screen.getByRole('button', { name: /Resolve/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The server is busy.');
    // Still open, because it was never settled.
    expect(screen.getByRole('button', { name: /Resolve/ })).toBeInTheDocument();
  });

  it('keeps a technical failure to itself and says something a person can read', async () => {
    const user = userEvent.setup();
    const h = handlers();
    h.onReply.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.4:5432'));
    render(<NoteThread thread={thread()} where="Message" maySettle {...h} />);

    await user.type(screen.getByLabelText('Reply to this note'), 'Something');
    await user.click(screen.getByRole('button', { name: 'Reply' }));

    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('ECONNREFUSED');
    expect(alert).toHaveTextContent(/Try again/);
  });

  it('says where it is, so a thread read from the index still has its place', () => {
    render(<NoteThread thread={thread()} where="Message" maySettle {...handlers()} />);
    expect(screen.getByRole('dialog', { name: /Message/ })).toBeInTheDocument();
  });
});

describe('leaving a note', () => {
  it('says what it will be attached to before a word is typed', () => {
    render(<NoteComposer where="Message" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    // A note that silently attached itself to whatever was selected would be
    // worse than one with no anchor at all.
    expect(screen.getByRole('dialog', { name: /New note · Message/ })).toBeInTheDocument();
  });

  it('will not send an empty one', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NoteComposer where="On the canvas" onSubmit={onSubmit} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Leave note/ })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends what was typed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NoteComposer where="On the canvas" onSubmit={onSubmit} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText('Your note'), 'The gap here feels abrupt');
    await user.click(screen.getByRole('button', { name: /Leave note/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('The gap here feels abrupt'));
  });

  it('says so when it could not be saved, rather than closing as if it had', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('The server is busy.'));
    const onCancel = vi.fn();
    render(<NoteComposer where="Message" onSubmit={onSubmit} onCancel={onCancel} />);

    await user.type(screen.getByLabelText('Your note'), 'Something');
    await user.click(screen.getByRole('button', { name: /Leave note/ }));

    expect(await screen.findByText('The server is busy.')).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('the vocabulary', () => {
  it('never puts a number on a pin', () => {
    // Guarded here rather than by inspecting the canvas layer, because the
    // rule is about what a pin MAY say: who, and nothing that could be read
    // as replies, unread, or people. The index carries counts instead.
    const { container } = render(
      <NoteThread thread={thread({ replies: [] })} where="Message" maySettle {...{
        onReply: vi.fn(), onSettle: vi.fn(), onDelete: vi.fn(), onClose: vi.fn(),
      }} />,
    );
    const header = within(container).getByRole('dialog');
    expect(header.textContent).not.toMatch(/\b\d+\b/);
  });
});
