// ============================================================
// Populr — shared display constants.
//
// This module used to double as a demo-data store: invented contacts,
// conversations, campaigns, segments, analytics, and a fictional account
// owner ("Maya Chen"). Those fed the pages that were never wired to the
// backend, and they rendered as though they were the signed-in creator's
// own data. The pages now say plainly that they aren't built yet (see
// components/NotAvailableYet.tsx), so the fabricated records are gone and
// only genuinely-shared constants remain here.
// ============================================================

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'linkedin' | 'reddit';

export const platformColors: Record<Platform, string> = {
  instagram: 'bg-gradient-to-br from-pink-500 to-orange-500',
  tiktok: 'bg-black',
  youtube: 'bg-red-600',
  twitter: 'bg-black',
  linkedin: 'bg-[#0A66C2]',
  reddit: 'bg-[#FF4500]',
};

/**
 * A connected account's lifecycle as the UI models it.
 *
 * 'connected' / 'reconnect_required' / 'disconnected' mirror the backend's
 * own connected_accounts.status — 'reconnect_required' meaning the account is
 * connected but Zernio's authorization has expired (detected elsewhere, e.g.
 * a failed reply attempt), never a client guess. 'idle', 'connecting',
 * 'syncing', and 'error' are client-side transitions around the OAuth
 * round-trip: 'connecting' is the moment before the browser leaves for the
 * provider, 'syncing' the return trip while the account list is re-verified.
 */
export type AccountStatus =
  | 'idle' | 'connecting' | 'syncing' | 'connected' | 'reconnect_required' | 'error';

export interface OnboardingPlatform {
  id: string;
  name: string;
  icon: string;
  status: AccountStatus;
  handle?: string;
  /** Set when status is 'error' — the backend's own failure reason, never fabricated. */
  errorMessage?: string;
}

// Populr's supported connection surface: Instagram, TikTok, LinkedIn,
// Twitter/X, and Reddit.
export const defaultOnboardingPlatforms: OnboardingPlatform[] = [
  { id: 'instagram', name: 'Instagram', icon: 'instagram', status: 'idle' },
  { id: 'tiktok', name: 'TikTok', icon: 'tiktok', status: 'idle' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'linkedin', status: 'idle' },
  { id: 'twitter', name: 'Twitter', icon: 'twitter', status: 'idle' },
  { id: 'reddit', name: 'Reddit', icon: 'reddit', status: 'idle' },
];
