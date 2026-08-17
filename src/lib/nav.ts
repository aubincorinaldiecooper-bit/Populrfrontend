import { Home, Zap, MessageCircle, Users, UsersRound, Waypoints, Settings } from 'lucide-react';

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
 * Inbox is a destination like any other. It used to live as a drawer that
 * opened over whatever you were doing, with the page kept alongside for long
 * sessions — which meant the product had two inboxes, and the drawer was a
 * paler copy of the page. One surface now: the /inbox page. The "someone is
 * waiting" signal the drawer's launcher used to carry lives on this nav item
 * as a badge instead.
 */
export const navItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/automations', label: 'Automations', icon: Zap },
  { path: '/inbox', label: 'Inbox', icon: MessageCircle },
  { path: '/contacts', label: 'Contacts', icon: Users },
  { path: '/channels', label: 'Channels', icon: Waypoints },
  { path: '/team', label: 'Team', icon: UsersRound },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function isActivePath(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname.startsWith(path);
}
