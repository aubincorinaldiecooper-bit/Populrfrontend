import { Instagram, Music, Linkedin, Share2 } from 'lucide-react';

export const PLATFORM_META: Record<string, { name: string; icon: typeof Instagram; color: string }> = {
  instagram: { name: 'Instagram', icon: Instagram, color: '#E4405F' },
  tiktok: { name: 'TikTok', icon: Music, color: '#000000' },
  linkedin: { name: 'LinkedIn', icon: Linkedin, color: '#0A66C2' },
};

export function platformMeta(p: string) {
  return PLATFORM_META[p] ?? { name: p.charAt(0).toUpperCase() + p.slice(1), icon: Share2, color: '#6B6B6B' };
}
