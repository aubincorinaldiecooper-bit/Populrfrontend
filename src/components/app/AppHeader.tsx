import { SidebarTrigger } from '@/components/ui/sidebar';
import InboxMenu from './InboxMenu';
import NotificationMenu from './NotificationMenu';
import { HeaderSlotTarget } from './headerSlots';
import { useApp } from '../../context/AppContext';

/**
 * The one header, on every authenticated page. Two renderings of the same
 * geography, and no route-specific third one.
 *
 * Left to right, always: where you are, what you can do here, then the
 * global cluster — Inbox and Notifications, in the same corner on every
 * page. Identity stays in the sidebar, where the account block has always
 * lived; two copies of the same avatar would be chrome for chrome's sake.
 *
 * The two middle regions are slots (headerSlots.tsx) that pages fill. The
 * automation builder used to render a header of its own instead — a
 * different height, a different ground, its actions where another page's
 * global controls are, and on phones a second bar stacked under this one.
 * Its breadcrumb and its Activate button live in these slots now, which is
 * the same content in a shell that stopped moving.
 *
 * On phones this is the fixed top bar the app has always had. Its height
 * expression (4rem + safe-area) is load-bearing: SidebarInset's top padding
 * and the toast offset in index.css both repeat it, so content and toasts
 * clear the bar on notched devices. Change one, change all three.
 */
export default function AppHeader() {
  const { workspaceAccess } = useApp();

  // The same rule the sidebar's nav applies: a canvas invitee's workspace
  // Inbox answers 403, so the glance would be a door that opens onto a
  // forbidden request and rows that bounce back to the canvas. No dead
  // controls — the bell stays (it calls nothing and says so honestly).
  const offerInbox = workspaceAccess?.role !== 'canvas';

  const globals = (
    <div className="flex shrink-0 items-center gap-1">
      {offerInbox && <InboxMenu />}
      <NotificationMenu />
    </div>
  );

  // ONE element, responsive — not a mobile bar and a desktop bar. Two would
  // mean two of each slot, and a page's breadcrumb can only be portaled into
  // one of them; whichever published its ref last would silently win.
  return (
    <header
      className="fixed top-0 left-0 right-0 z-[55] flex items-center gap-1.5
        h-[calc(4rem+env(safe-area-inset-top))] border-b border-sidebar-border
        bg-sidebar/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-md
        md:static md:z-auto md:h-14 md:gap-3 md:border-sidebar-border
        md:bg-background md:px-6 md:pt-0 md:backdrop-blur-none"
    >
      <SidebarTrigger />
      {/* The page's own words, when it has any. On a phone the wordmark
          below yields to them — at 380px both would truncate each other, and
          "which automation am I in" is the more useful thing to know; the
          drawer one tap away carries the brand at full size. Driven off the
          slot being empty rather than off a route test, so any page that
          starts filling this slot gets the behaviour for free. On desktop
          the wordmark lives in the sidebar and only the slot renders. */}
      <HeaderSlotTarget slot="local" className="peer min-w-0 flex-1 empty:hidden md:empty:block" />
      <span
        className="mr-auto font-display text-[22px] font-bold text-sidebar-foreground
          peer-[:not(:empty)]:hidden md:hidden"
      >
        Populr
      </span>
      <HeaderSlotTarget slot="actions" className="flex shrink-0 items-center gap-1 md:gap-2" />
      {globals}
    </header>
  );
}
