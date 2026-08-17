import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import PopulrAIComposer from '../components/automation-builder/PopulrAIComposer';

/* The prompt bar, rebuilt as a real composer.
 *
 * The bar under the Ask Populr conversation now works like the prompt bars
 * creators already know: the text on top, and a controls row underneath with
 * a model picker on the left and voice + send on the right. What these tests
 * pin down:
 *
 *   - the model menu offers Populr, Claude, ChatGPT and Gemini, each wearing
 *     its own mark, and it tells the truth about what picking one does today;
 *   - the choice is remembered across mounts, not lost on every reload;
 *   - there is deliberately NO attachments button yet — a "+" that opens
 *     nothing would be furniture;
 *   - the mic is real dictation through the browser's recognizer, so it only
 *     renders where that API exists;
 *   - none of this disturbed the bar's contract: Enter sends, empty drafts
 *     can't send, and "working" locks the input.
 */

const COMPOSER_LABEL = 'Ask Populr to build or change anything…';

function Harness({
  onSubmit = () => {},
  working = false,
  initial = '',
}: { onSubmit?: (value: string) => void; working?: boolean; initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <PopulrAIComposer
      value={value}
      onChange={setValue}
      onSubmit={() => onSubmit(value)}
      working={working}
      aiConfigured
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('model picker', () => {
  it('offers Populr, Claude, ChatGPT and Gemini, each wearing its mark', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Choose model' }));

    const names = screen.getAllByRole('option').map(option => option.textContent);
    expect(names[0]).toContain('Populr');
    expect(names[1]).toContain('Claude');
    expect(names[2]).toContain('ChatGPT');
    expect(names[3]).toContain('Gemini');

    // Every row carries its brand mark, and the maker tag says whose it is.
    for (const mark of ['claude', 'chatgpt', 'gemini', 'populr']) {
      expect(screen.getAllByTestId(`model-mark-${mark}`).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();

    // The menu is honest about what a pick means today.
    expect(screen.getByText(/Populr does the building for now/)).toBeInTheDocument();
  });

  it('defaults to Populr and remembers a different pick across mounts', async () => {
    const user = userEvent.setup();
    const first = render(<Harness />);
    expect(screen.getByRole('button', { name: 'Choose model' })).toHaveTextContent('Populr');

    await user.click(screen.getByRole('button', { name: 'Choose model' }));
    await user.click(screen.getByRole('option', { name: /Claude/ }));

    expect(screen.getByRole('button', { name: 'Choose model' })).toHaveTextContent('Claude');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('populr:ai:model')).toBe('claude');

    // A fresh mount — a reload, a different automation — keeps the choice.
    first.unmount();
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Choose model' })).toHaveTextContent('Claude');
    await user.click(screen.getByRole('button', { name: 'Choose model' }));
    expect(screen.getByRole('option', { name: /Claude/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /Populr/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('works from the keyboard: ArrowDown opens, arrows move, Enter picks, Escape closes', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Choose model' });

    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // The highlight is announced, not just painted: the trigger keeps focus,
    // so it must point at the active row for a screen reader to say its name.
    await user.keyboard('{ArrowDown}');
    expect(trigger).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /Claude/ }).id,
    );

    await user.keyboard('{Enter}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('Claude');

    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes when a click lands anywhere else', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Choose model' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('the bar itself', () => {
  it('has no attachments button until attachments exist', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: /attach/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument();
  });

  it('Enter sends the draft; an empty draft cannot send', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    await user.type(screen.getByLabelText(COMPOSER_LABEL), 'Message everyone who comments GUIDE{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('Message everyone who comments GUIDE');
  });

  it('working locks the input and the send button', () => {
    render(<Harness working initial="hold on" />);
    expect(screen.getByLabelText('Populr is building…')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});

describe('dictation', () => {
  class FakeRecognition {
    static instance: FakeRecognition | null = null;
    lang = '';
    continuous = false;
    interimResults = false;
    onresult:
      | ((event: { resultIndex: number; results: { transcript: string }[][] }) => void)
      | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    start() { FakeRecognition.instance = this; }
    stop() { this.onend?.(); }
  }

  const withRecognizer = () => {
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
  };

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    FakeRecognition.instance = null;
  });

  it('renders no mic where the browser cannot hear', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Start dictation' })).not.toBeInTheDocument();
  });

  it('a spoken phrase lands in the draft, appended after what was typed', async () => {
    withRecognizer();
    const user = userEvent.setup();
    render(<Harness initial="Reply warmly." />);

    await user.click(screen.getByRole('button', { name: 'Start dictation' }));
    const mic = screen.getByRole('button', { name: 'Stop dictation' });
    expect(mic).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Listening…')).toBeInTheDocument();

    const recognizer = FakeRecognition.instance!;
    act(() => {
      recognizer.onresult!({ resultIndex: 0, results: [[{ transcript: ' then send my guide' }]] });
      recognizer.onend!();
    });

    expect(screen.getByLabelText(COMPOSER_LABEL)).toHaveValue('Reply warmly. then send my guide');
    expect(screen.queryByRole('button', { name: 'Stop dictation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start dictation' })).toBeInTheDocument();
  });
});
