import type { ReactNode } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import InboxMenu from './InboxMenu';
import NotificationMenu from './NotificationMenu';
import { useApp } from '../../context/AppContext';

/**
 * The one header. Two renderings of the same geography:
 *
 * On phones it is the fixed top bar the app has always had — hamburger,
 * wordmark — now also carrying the global cluster. Its height expression
 * (4rem + safe-area) is load-bearing: SidebarInset's top padding and the
 * toast offset in index.css both repeat it, so content and toasts clear the
 * bar on notched devices. Change one, change all three.
 *
 * On desktop it is a quiet strip above the page: a local slot on the left
 * (breadcrumbs or page-scoped controls, when a page has them) and the
 * global cluster on the right — Inbox and Notifications, always in the
 * same corner on every page. Identity stays in the sidebar, where the
 * account block has always lived; two copies of the same avatar would be
 * chrome for chrome's sake.
 *
 * The builder renders only the mobile bar (`mobileOnly`): on desktop its
 * own editor header owns that edge, and a second header above the canvas
 * would spend exactly the space the editor mode exists to reclaim.
 */
export default function AppHeader({
  local,
  mobileOnly = false,
}: {
  local?: ReactNode;
  mobileOnly?: boolean;
}) {
  const { workspaceAccess } = useApp();
  // The same rule the sidebar's nav applies: a canvas invitee's workspace
  // Inbox answers 403, so the glance would be a door that opens onto a
  // forbidden request and rows that bounce back to the canvas. No dead
  // controls — the bell stays (it calls nothing and says so honestly).
  const offerInbox = workspaceAccess?.role !== 'canvas';
  return (
    <>
      {/* Mobile top bar. The safe-area inset is added to the bar's HEIGHT,
          not just as inner padding: padding alone would push the controls
          down inside a still-64px-tall bar on a notched device. */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-[55] flex
          h-[calc(4rem+env(safe-area-inset-top))] items-center gap-2
          border-b border-sidebar-border bg-sidebar/90 px-4
          pt-[env(safe-area-inset-top)] backdrop-blur-md"
      >
        <SidebarTrigger />
        <span className="font-display text-[22px] font-bold text-sidebar-foreground">Populr</span>
        <div className="ml-auto flex items-center gap-1">
          {offerInbox && <InboxMenu />}
          <NotificationMenu />
        </div>
      </div>

      {!mobileOnly && (
        <header className="hidden md:flex h-14 items-center justify-between gap-4 px-8">
          <div className="min-w-0 flex-1">{local}</div>
          <div className="flex items-center gap-1">
            {offerInbox && <InboxMenu />}
            <NotificationMenu />
          </div>
        </header>
      )}
    </>
  );
}
