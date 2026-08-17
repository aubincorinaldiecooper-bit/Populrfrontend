import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from '../components/app/ConfirmDialog';
import SubscriptionModal from '../components/SubscriptionModal';

/* The overlay contracts the pages now stand on.
 *
 * window.confirm blocked the tab and wore the browser's face; the shared
 * ConfirmDialog replaces it everywhere. These tests pin what every caller
 * relies on: nothing happens until the deliberate button, Cancel and
 * Escape are the same safe exit, and a persistent dialog stays put when
 * the backdrop is clicked.
 */

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, getSubscriptionCheckoutUrl: () => 'https://pay.example/checkout' };
});

function Host({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Delete it</button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete “Guide DM”?"
        description="It's live — it will stop running."
        confirmLabel="Delete"
        onConfirm={onConfirm}
      />
    </>
  );
}

describe('ConfirmDialog', () => {
  it('acts only on the deliberate button, and closes', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Host onConfirm={onConfirm} />);

    await user.click(screen.getByText('Delete it'));
    const dialog = await screen.findByRole('alertdialog', { name: /Delete .Guide DM/ });
    expect(dialog).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('Cancel and Escape both leave without acting', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Host onConfirm={onConfirm} />);

    await user.click(screen.getByText('Delete it'));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    await user.click(screen.getByText('Delete it'));
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('SubscriptionModal (persistent dialog)', () => {
  it('ignores backdrop clicks; "Not now" and Escape are the ways out', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SubscriptionModal platform="instagram" onClose={onClose} />);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // A click outside the popup must not dismiss a modal whose only
    // intended exits are explicit.
    await user.click(document.body);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
