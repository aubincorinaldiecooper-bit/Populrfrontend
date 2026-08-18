import * as React from 'react';
import { Menu, X } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * The shell's navigation bones — shadcn's Sidebar family, trimmed to what
 * Populr actually is. One provider owns the mobile drawer's open state; the
 * Sidebar renders its children twice, once as the fixed desktop column and
 * once inside a Sheet for phones, so there is a single source for what the
 * navigation contains. SidebarInset is the page column beside it.
 *
 * The navigation collapses to a rail, and that behaviour lives HERE —
 * one component at two widths, on every route. Populr tried it the other
 * way first: a separate rail component, offered only inside the automation
 * builder. It drifted from this one in palette, icon size, badge treatment
 * and focus ring until the two navigations no longer looked like the same
 * product, and a creator opening an automation watched the shell change
 * shape. A width is a property of a component; it is not a second one.
 *
 * Deliberately still NOT carried over from stock shadcn: the keyboard
 * shortcut, and cookie persistence (localStorage is enough — this is a
 * client-only app with no server render to agree with).
 *
 * Layout mechanics are the ones the app has always used — a fixed column
 * and a matching content margin.
 */

/** The two widths, exported because layout maths elsewhere depends on
 *  which one is showing — see the automation builder's thresholds. */
export const SIDEBAR_WIDTH = 280;
export const SIDEBAR_RAIL_WIDTH = 72;

/**
 * Whether the creator last chose the rail. Read defensively — Safari
 * private mode throws on localStorage — and written on every change,
 * because the point of the preference is that it outlives the visit. A
 * shell that re-expands on reload is the same surprise again, just less
 * often.
 */
const COLLAPSED_KEY = 'populr.navCollapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

type SidebarContextValue = {
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  /** Desktop only — the phone drawer is always full width. */
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within a SidebarProvider');
  return ctx;
}

function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [openMobile, setOpenMobile] = React.useState(false);
  // Read in a lazy initialiser rather than an effect: an effect would paint
  // the default width first and the creator's actual choice a frame later,
  // so the shell would visibly snap on every load.
  const [collapsed, setCollapsedState] = React.useState(readCollapsed);

  const setCollapsed = React.useCallback((next: boolean) => {
    setCollapsedState(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // Storage disabled: the choice holds for this session, which is a
      // smaller cost than a shell that refuses to render.
    }
  }, []);

  const value = React.useMemo(
    () => ({ openMobile, setOpenMobile, collapsed, setCollapsed }),
    [openMobile, collapsed, setCollapsed],
  );
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

/**
 * Which width the children are currently being rendered at.
 *
 * The same children render twice — the desktop column and the phone drawer
 * — and only one of them can be narrow. A drawer the creator deliberately
 * opened has no reason to hide its own labels, so the Sheet always answers
 * `false` here regardless of the preference.
 */
const SidebarSurfaceContext = React.createContext<{ collapsed: boolean }>({ collapsed: false });

export function useSidebarSurface(): { collapsed: boolean } {
  return React.useContext(SidebarSurfaceContext);
}

/**
 * The navigation surface: one fixed column on desktop, the same children in
 * a drawer on phones. No per-route modes — every authenticated page gets
 * this, at this width, so the navigation is never something the app
 * rearranges underneath you.
 */
function Sidebar({ className, children }: { className?: string; children: React.ReactNode }) {
  const { openMobile, setOpenMobile, collapsed } = useSidebar();
  return (
    <>
      <aside
        style={{ width: collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH }}
        className={cn(
          `hidden md:flex fixed left-0 top-0 z-50 h-screen flex-col
           border-r border-sidebar-border bg-transparent
           transition-[width] duration-200 ease-out`,
          collapsed ? 'items-center gap-4 px-2 py-6' : 'gap-7 p-6',
          className,
        )}
      >
        <SidebarSurfaceContext.Provider value={{ collapsed }}>
          {children}
        </SidebarSurfaceContext.Provider>
      </aside>
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="left"
          aria-label="Main menu"
          className="md:hidden flex w-[280px] flex-col gap-7 overflow-y-auto p-6
            pt-[calc(1.5rem+env(safe-area-inset-top))]"
        >
          {/* Always full: a drawer the creator deliberately opened has no
              reason to hide the labels they opened it to read. */}
          <SidebarSurfaceContext.Provider value={{ collapsed: false }}>
            {children}
          </SidebarSurfaceContext.Provider>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** The hamburger. Lives in the mobile header; hidden where the column shows. */
const SidebarTrigger = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<'button'>>(
  function SidebarTrigger({ className, ...props }, ref) {
    const { openMobile, setOpenMobile } = useSidebar();
    return (
      <button
        ref={ref}
        type="button"
        // The bar floats above the drawer's scrim, so this control stays
        // visible while the drawer is open — it must read as the way back.
        aria-label={openMobile ? 'Close menu' : 'Open menu'}
        aria-expanded={openMobile}
        onClick={() => setOpenMobile(!openMobile)}
        className={cn(
          `md:hidden flex h-11 w-11 items-center justify-center rounded-full
           text-sidebar-muted-foreground transition-colors hover:bg-sidebar-muted`,
          className,
        )}
        {...props}
      >
        {openMobile ? <X size={22} /> : <Menu size={22} />}
      </button>
    );
  },
);

/**
 * The page column. Top padding clears the fixed mobile header (its height
 * expression must stay identical to AppHeader's — safe-area included); the
 * left margin clears the navigation column at whichever width it is
 * currently showing — one number, read from the provider, so the page and
 * the column can never disagree about where the content starts.
 */
function SidebarInset({ className, children }: { className?: string; children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <main
      // The margin is inline rather than a class because it has to track the
      // column's animated width exactly; two Tailwind classes swapping would
      // step where the aside slides. Below md the column is a drawer over
      // the page, so there is no margin to keep.
      style={{ ['--sidebar-w' as string]: `${collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH}px` }}
      className={cn(
        `min-h-screen pt-[calc(4rem+env(safe-area-inset-top))] md:pt-0
         md:ml-[var(--sidebar-w)] md:transition-[margin-left] md:duration-200 md:ease-out`,
        className,
      )}
    >
      {children}
    </main>
  );
}

/** Grouping bones. Header holds identity/CTA, Content scrolls, Footer sits last. */
function SidebarHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex flex-col gap-7', className)}>{children}</div>;
}

function SidebarContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex flex-1 flex-col', className)}>{children}</div>;
}

function SidebarFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mt-auto', className)}>{children}</div>;
}

function SidebarMenu({ className, children, ...props }: React.ComponentPropsWithoutRef<'nav'>) {
  return (
    <nav className={cn('mt-2 flex flex-1 flex-col gap-1.5', className)} {...props}>
      {children}
    </nav>
  );
}

/**
 * The nav pill's classes, exported as a function rather than a component so
 * AppSidebar can put them straight on a router <Link> — no asChild
 * indirection for the one element kind the menu actually holds.
 */
function sidebarMenuButtonClass(active: boolean, collapsed = false, className?: string): string {
  return cn(
    'group relative flex items-center transition-colors duration-200',
    // Both widths keep the pill and its colours; only the geometry changes.
    // A rail that swapped the shape for a square tile would be the drift
    // this component exists to prevent, one property at a time.
    collapsed
      ? 'h-11 w-11 justify-center rounded-2xl'
      : 'gap-3 rounded-full px-4 py-3',
    active
      ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
      : 'text-sidebar-muted-foreground hover:bg-sidebar-muted hover:text-sidebar-foreground',
    className,
  );
}

export {
  SidebarProvider,
  Sidebar,
  SidebarTrigger,
  SidebarInset,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  sidebarMenuButtonClass,
};
