import { Home, Zap, Users, Waypoints, Settings } from 'lucide-react';

/**
 * Populr's primary navigation, in one place because two shells render it —
 * the full sidebar everywhere, and the compact rail inside the automation
 * editor. Two copies would drift, and the one that drifted would be the one
 * nobody was looking at.
 *
 * Populr's beta direction is automation-first: the primary CTA leads straight
 * to the automation builder. "Channels" is this surface's own route
 * (/connections redirects to it). Publishing surfaces (Create Post, Content,
 * etc.) stay reachable by URL but out of primary nav.
 *
 * Inbox is deliberately absent. It is not a place you go — it is something
 * that happens to you while you are building — so it lives with the top-right
 * controls and opens over whatever you are already doing. The /inbox route
 * still exists for a long triage session and for the links that point at it.
 */
export const navItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/automations', label: 'Automations', icon: Zap },
  { path: '/contacts', label: 'Contacts', icon: Users },
  { path: '/channels', label: 'Channels', icon: Waypoints },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function isActivePath(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname.startsWith(path);
}
