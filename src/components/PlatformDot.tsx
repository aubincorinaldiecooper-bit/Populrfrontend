import { platformColors } from '../data';
import type { Platform } from '../data';

export default function PlatformDot({ platform, size = 8 }: { platform: Platform | string; size?: number }) {
  const color = platformColors[platform as Platform] || 'bg-gray-400';
  return (
    <span
      className={`inline-block rounded-full ${color} flex-shrink-0`}
      style={{ width: size, height: size }}
      aria-label={platform}
    />
  );
}
