import type { ComponentType, CSSProperties } from 'react';
import { Instagram, Facebook, Music, Linkedin, MessageCircle, Share2 } from 'lucide-react';
import XLogo from '../components/XLogo';

/**
 * The single source of truth for how platforms appear to users: display
 * name, icon, brand color, and — during the beta — which platforms are
 * offered at all.
 *
 * BETA_PLATFORMS is the product's current connection surface: Instagram,
 * Facebook, and X. TikTok, LinkedIn, and Reddit are hidden for the beta,
 * not removed — their meta stays here so an account connected before the
 * beta cut (or restored later) still renders with its proper name and icon
 * instead of a raw id, and their integration code elsewhere is untouched.
 *
 * "twitter" stays the internal id everywhere (backend, Zernio, stored
 * accounts); users only ever see the display name "X". Renaming the id
 * would mean a risky data migration for zero user-visible gain.
 */
export type PlatformIcon = ComponentType<{
  size?: number;
  className?: string;
  style?: CSSProperties;
}>;

export interface PlatformMetaEntry {
  name: string;
  icon: PlatformIcon;
  color: string;
}

/** Platforms offered for connection in the current beta, in display order. */
export const BETA_PLATFORMS = ['instagram', 'facebook', 'twitter'] as const;

export function isBetaPlatform(id: string): boolean {
  return (BETA_PLATFORMS as readonly string[]).includes(id);
}

export const PLATFORM_META: Record<string, PlatformMetaEntry> = {
  instagram: { name: 'Instagram', icon: Instagram, color: '#E4405F' },
  facebook: { name: 'Facebook', icon: Facebook, color: '#1877F2' },
  twitter: { name: 'X', icon: XLogo, color: '#000000' },
  // Hidden during the beta — kept so existing accounts stay presentable.
  // lucide has no TikTok or Reddit glyph; Music and MessageCircle stand in.
  tiktok: { name: 'TikTok', icon: Music, color: '#000000' },
  linkedin: { name: 'LinkedIn', icon: Linkedin, color: '#0A66C2' },
  reddit: { name: 'Reddit', icon: MessageCircle, color: '#FF4500' },
};

export function platformMeta(p: string): PlatformMetaEntry {
  return PLATFORM_META[p] ?? { name: p.charAt(0).toUpperCase() + p.slice(1), icon: Share2, color: '#6B6B6B' };
}
