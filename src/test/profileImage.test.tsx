import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileImage from '../components/ProfileImage';
import Avatar from '../components/inbox/Avatar';

/* Profile pictures that know how to not be one.
 *
 * Platform avatar URLs are signed and short-lived — Instagram's expire — so a
 * URL that worked when it was stored can 403 weeks later. Every surface used
 * a bare <img>, which answers that with the browser's torn-image glyph: it
 * reads as "Populr is broken" rather than "we have no photo of this person".
 *
 * These pin the two states that actually reach a creator: the picture we have,
 * and the graceful absence of one. */

describe('ProfileImage', () => {
  it('shows the picture when there is one', () => {
    render(<ProfileImage src="https://cdn.example.com/face.jpg" fallback={<span>AB</span>} />);
    expect(screen.getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src', 'https://cdn.example.com/face.jpg',
    );
    expect(screen.queryByText('AB')).not.toBeInTheDocument();
  });

  it('shows the fallback when there is no picture', () => {
    render(<ProfileImage src={null} fallback={<span>AB</span>} />);
    expect(screen.getByText('AB')).toBeInTheDocument();
  });

  it('falls back to the same thing when the picture fails to load', () => {
    render(<ProfileImage src="https://cdn.example.com/expired.jpg" fallback={<span>AB</span>} />);
    // What an expired Instagram CDN URL does in a real browser.
    fireEvent.error(screen.getByRole('presentation', { hidden: true }));

    expect(screen.getByText('AB')).toBeInTheDocument();
    expect(screen.queryByRole('presentation', { hidden: true })).not.toBeInTheDocument();
  });

  it('does not send our origin as the referrer', () => {
    // One of the ways platform CDNs 403 a perfectly good URL.
    render(<ProfileImage src="https://cdn.example.com/face.jpg" fallback={<span>AB</span>} />);
    expect(screen.getByRole('presentation', { hidden: true }))
      .toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('gives a new person a fresh attempt after a previous one failed', () => {
    // Rows are recycled as the creator scrolls. Without a key on the URL, one
    // person's broken avatar would stick to whoever took that slot next.
    const { rerender } = render(
      <ProfileImage src="https://cdn.example.com/expired.jpg" fallback={<span>AB</span>} />,
    );
    fireEvent.error(screen.getByRole('presentation', { hidden: true }));
    expect(screen.getByText('AB')).toBeInTheDocument();

    rerender(<ProfileImage src="https://cdn.example.com/someone-else.jpg" fallback={<span>CD</span>} />);
    expect(screen.getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src', 'https://cdn.example.com/someone-else.jpg',
    );
  });
});

describe('Avatar', () => {
  it('shows the person when we have their picture', () => {
    render(<Avatar handle="maya" name="Maya" avatarUrl="https://cdn.example.com/maya.jpg" platform="instagram" />);
    expect(screen.getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src', 'https://cdn.example.com/maya.jpg',
    );
  });

  it('falls back to their initial when the picture dies', () => {
    render(<Avatar handle="maya" name="Maya" avatarUrl="https://cdn.example.com/gone.jpg" platform="instagram" />);
    fireEvent.error(screen.getByRole('presentation', { hidden: true }));
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('uses the handle when there is no name, and never renders an empty circle', () => {
    render(<Avatar handle="maya" name={null} avatarUrl={null} />);
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('shows a question mark rather than nothing for someone we cannot name', () => {
    render(<Avatar handle={null} name={null} avatarUrl={null} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
