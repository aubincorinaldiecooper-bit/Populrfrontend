/**
 * Relative time, in the words a creator would use.
 *
 * "Updated 8/7/2026" makes you do arithmetic to answer the only question you
 * were actually asking — is this recent? — so lists say "20m ago" instead.
 * Absolute dates are still right for anything older than a week, where "37d
 * ago" stops being easier to read than the date itself.
 */

export function timeAgo(input: string | number | Date | null | undefined): string {
  if (input === null || input === undefined) return '';
  const then = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (!Number.isFinite(then)) return '';

  const seconds = Math.floor((Date.now() - then) / 1000);
  // Small negative drift (a server clock a few seconds ahead of the browser)
  // should read as "just now", not "in 3 seconds".
  if (seconds < 45) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;

  return new Date(then).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    // Drop the year while it's this year — "12 Mar" reads faster than
    // "12 Mar 2026" when there's only one year it could be.
    ...(new Date(then).getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  });
}
