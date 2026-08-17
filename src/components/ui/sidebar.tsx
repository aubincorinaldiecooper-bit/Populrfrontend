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
 * Deliberately NOT carried over from stock shadcn: collapse-to-icons (the
 * builder's EditorRail is Populr's own answer to that), cookie persistence,
 * and the keyboard shortcut — none of them are product behavior here.
 *
 * Layout mechanics are the ones the app has always used — a fixed column
 * and a matching content margin — so adopting the structure moves no
 * pixels.
 */

type SidebarContextValue = {
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within a SidebarProvider');
  return ctx;
}

function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [openMobile, setOpenMobile] = React.useState(false);
  const value = React.useMemo(() => ({ openMobile, setOpenMobile }), [openMobile]);
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

/**
 * The navigation surface. `desktop={false}` is the builder's mode: the
 * fixed column yields to the EditorRail, but the mobile drawer stays —
 * without it a phone inside the builder has no navigation at all.
 */
function Sidebar({
  desktop = true,
  className,
  children,
}: {
  desktop?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { openMobile, setOpenMobile } = useSidebar();
  return (
    <>
      {desktop && (
        <aside
          className={cn(
            `hidden md:flex fixed left-0 top-0 z-50 h-screen w-[280px] flex-col gap-7
             border-r border-sidebar-border bg-transparent p-6`,
            className,
          )}
        >
          {children}
        </aside>
      )}
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="left"
          aria-label="Main menu"
          className="md:hidden flex w-[280px] flex-col gap-7 overflow-y-auto p-6
            pt-[calc(1.5rem+env(safe-area-inset-top))]"
        >
          {children}
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
 * left margin clears whichever navigation column is showing, so the builder
 * overrides it to the rail's 60px.
 */
function SidebarInset({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <main
      className={cn(
        'min-h-screen pt-[calc(4rem+env(safe-area-inset-top))] md:pt-0 md:ml-[280px]',
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
function sidebarMenuButtonClass(active: boolean, className?: string): string {
  return cn(
    'group flex items-center gap-3 rounded-full px-4 py-3 transition-colors duration-200',
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
