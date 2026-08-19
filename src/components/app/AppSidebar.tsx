import { Link, useLocation } from 'react-router';
import { Plus, Zap, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import {
  Sidebar,
  SidebarHeader,
  SidebarMenu,
  SidebarFooter,
  sidebarMenuButtonClass,
  useSidebar,
  useSidebarSurface,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import AccountMenu from '../AccountMenu';
import { navItems, isActivePath } from '../../lib/nav';
import { useApp } from '../../context/AppContext';
import { isGuestView, roleLabel } from '../../lib/access';
import { useInboxWaiting } from '../inbox/conversations';
import { useCreateAutomation } from '../../context/CreateAutomationContext';

/**
 * Populr's navigation on the shell's Sidebar bones: the brand block, the
 * Create CTA, the primary nav from lib/nav, the Inbox waiting badge, and
 * the account identity — rendered once here and shown as the fixed desktop
 * column and the phone drawer alike.
 *
 * This is the whole navigation, everywhere, at either width. The automation
 * builder once swapped it for a separate 60px rail component reading the
 * same item list, which is not the same thing as being the same navigation:
 * the two drifted in palette, icon size, badge treatment and focus ring
 * until a creator opening an automation watched the product change shape.
 *
 * So the rail is a WIDTH here, not a component. Every difference between
 * the two is stated in one place — a ternary, next to the thing it changes
 * — which is what makes drift visible in review instead of discoverable in
 * a screenshot six weeks later. Colours, the active pill, the badge, the
 * icon metrics and the focus ring are shared outright.
 *
 * Collapsing is offered on every route and remembered (see the provider).
 * The route never decides it: a shell that rearranges itself when you open
 * an automation is the thing this replaced.
 */
export default function AppSidebar() {
  return (
    <Sidebar>
      <AppSidebarBody />
    </Sidebar>
  );
}

function AppSidebarBody() {
  const location = useLocation();
  const { setOpenMobile, collapsed: preference, setCollapsed } = useSidebar();
  // The preference is the DESKTOP column's; the phone drawer always renders
  // full, so it answers `false` here whatever the creator last chose.
  const { collapsed } = useSidebarSurface();
  const { beginCreateAutomation } = useCreateAutomation();
  const { workspaceAccess } = useApp();
  const { count: inboxCount } = useInboxWaiting();

  const closeMobile = () => setOpenMobile(false);

  // A canvas invitee's world is one automation: the nav offers exactly that
  // plus their own account settings — a menu of doors that all say 403
  // would be worse than a short one. Creating is likewise only offered to
  // people whose role can create (owners and edit-granted members).
  const canvas = workspaceAccess?.role === 'canvas' ? workspaceAccess.canvasAutomation : null;
  const items = canvas
    ? [
        { path: `/automations/${canvas.id}`, label: canvas.name, icon: Zap },
        { path: '/settings', label: 'Settings', icon: Settings },
      ]
    : navItems;
  const offerCreate =
    workspaceAccess == null ||
    workspaceAccess.role === 'owner' ||
    (workspaceAccess.role === 'member' && workspaceAccess.permissions.editAutomations);

  return (
    <TooltipProvider delay={150}>
      <SidebarHeader className={collapsed ? 'items-center gap-3' : undefined}>
        <div
          className={cn(
            collapsed ? 'flex flex-col items-center gap-3' : 'flex items-start justify-between px-4',
          )}
        >
          {/* The mark at rail width: the word cannot fit, and the P is what
              people already recognise on the tab. Not a link at either
              width — Home is in the list directly below, and a brand that
              silently navigates is a door nobody knows is there. */}
          {collapsed ? (
            <span className="font-display text-[20px] font-bold leading-none text-sidebar-foreground">
              P
            </span>
          ) : (
            <div>
              <h1 className="font-display text-[26px] font-bold text-sidebar-foreground tracking-tight leading-none">
                Populr
              </h1>
              <p className="font-label text-[11px] text-sidebar-muted-foreground uppercase tracking-widest mt-1.5">
                Creator Suite
              </p>
            </div>
          )}

          {/* One control, one home: the top of the column, at both widths.
              It moved ends between states in the version this replaced,
              which made the same button feel like two.
              `hidden md:flex` because this renders in the phone drawer too,
              where a drawer closes rather than collapses. */}
          <button
            type="button"
            onClick={() => setCollapsed(!preference)}
            aria-label={preference ? 'Expand navigation' : 'Collapse navigation'}
            aria-pressed={preference}
            className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg
              text-sidebar-muted-foreground transition-colors hover:bg-sidebar-muted
              hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-sidebar-ring"
          >
            {preference ? (
              <PanelLeftOpen size={17} strokeWidth={1.9} />
            ) : (
              <PanelLeftClose size={17} strokeWidth={1.9} />
            )}
          </button>
        </div>

        {/* Whose workspace this is, for anyone it isn't. A guest could work
            for an hour without ever being told they were a visitor: the
            workspace name lived only inside the account menu, and only once
            they held more than one. It sits above the nav because it frames
            everything below it. */}
        <WorkspaceStanding collapsed={collapsed} />

        {/* Create CTA — the same action as Home's "Create an automation":
            one creation experience, two entry points. It survives the rail
            because collapsing is now something a creator does anywhere, not
            a mode inside the builder where creating was beside the point. */}
        {offerCreate && (
          <Labelled collapsed={collapsed} label="Create">
            <button
              type="button"
              onClick={() => {
                closeMobile();
                beginCreateAutomation();
              }}
              aria-label={collapsed ? 'Create' : undefined}
              className={cn(
                'flex items-center justify-center bg-sidebar-accent font-semibold text-foreground',
                'transition-colors hover:bg-secondary-fixed-dim',
                collapsed ? 'h-11 w-11 rounded-2xl' : 'mx-1 gap-2 rounded-full px-6 py-3.5',
              )}
            >
              <Plus size={18} strokeWidth={2.5} />
              {!collapsed && 'Create'}
            </button>
          </Labelled>
        )}
      </SidebarHeader>

      <SidebarMenu className={collapsed ? 'items-center' : undefined}>
        {items.map(item => {
          const active = isActivePath(location.pathname, item.path);
          const Icon = item.icon;
          const waiting = item.path === '/inbox' ? inboxCount : 0;
          return (
            <Labelled key={item.path} collapsed={collapsed} label={item.label}>
              <Link
                to={item.path}
                onClick={closeMobile}
                // The real count belongs in the name even when the pill has
                // to round it off: "9+" is a decision about width, not about
                // how many people are waiting. At rail width the label has
                // to be in the name too — there is nothing else to read.
                aria-label={
                  waiting > 0
                    ? `${item.label}, ${waiting} conversations waiting`
                    : collapsed
                      ? item.label
                      : undefined
                }
                aria-current={active ? 'page' : undefined}
                className={sidebarMenuButtonClass(active, collapsed)}
              >
                <Icon
                  size={20}
                  strokeWidth={active ? 2.4 : 2}
                  className="transition-transform group-hover:scale-110"
                />
                {!collapsed && <span className="text-[15px]">{item.label}</span>}
                {waiting > 0 && (
                  // Same lime pill either way — only where it sits changes,
                  // because at 44px there is no row to sit at the end of.
                  // aria-hidden because the link above already says it.
                  <span
                    aria-hidden="true"
                    className={cn(
                      `rounded-full bg-sidebar-primary px-1.5 text-[10.5px] font-semibold
                       leading-[17px] text-sidebar-primary-foreground`,
                      collapsed ? 'absolute -right-0.5 -top-0.5' : 'ml-auto',
                    )}
                  >
                    {waiting > 9 ? '9+' : waiting}
                  </span>
                )}
              </Link>
            </Labelled>
          );
        })}
      </SidebarMenu>

      <SidebarFooter className={collapsed ? 'flex justify-center' : undefined}>
        <AccountMenu onNavigate={closeMobile} compact={collapsed} />
      </SidebarFooter>
    </TooltipProvider>
  );
}

/**
 * Whose workspace this is, and what this session's standing in it is.
 *
 * Only for a guest. An owner is in their own account and telling them so
 * every time they look at the nav would be noise; for everyone else it is
 * the thing that explains why a control they expected isn't there.
 *
 * At rail width there is no room for two lines, so it becomes the workspace's
 * initial with the whole sentence on hover — the same trade every other
 * control in the column makes.
 */
function WorkspaceStanding({ collapsed }: { collapsed: boolean }) {
  const { workspaceAccess } = useApp();
  if (!isGuestView(workspaceAccess) || !workspaceAccess) return null;

  const standing = roleLabel(workspaceAccess);
  const sentence = `${workspaceAccess.name}${standing ? ` · ${standing}` : ''}`;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              // Not a control: it says where you are, and there is nothing
              // to press. Its name carries the whole sentence so the rail
              // is not a worse answer for a screen reader than the column.
              role="note"
              aria-label={sentence}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-muted
                text-[13px] font-semibold text-sidebar-foreground"
            >
              {workspaceAccess.name.trim().charAt(0).toUpperCase() || '·'}
            </span>
          }
        />
        <TooltipContent side="right" aria-hidden>{sentence}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div role="note" className="mx-1 rounded-2xl bg-sidebar-muted px-3.5 py-2.5">
      <p className="font-label text-[10px] uppercase tracking-widest text-sidebar-muted-foreground">
        You're in
      </p>
      <p className="truncate text-[13px] font-semibold text-sidebar-foreground">
        {workspaceAccess.name}
      </p>
      {standing && (
        <p className="mt-0.5 text-[11.5px] text-sidebar-muted-foreground">{standing}</p>
      )}
    </div>
  );
}

/**
 * A hover/focus label for a control that has lost its written one.
 *
 * Only at rail width, and only ever decoration: every control it wraps
 * carries its own accessible name, so a screen reader hears the label once
 * rather than twice.
 */
function Labelled({
  collapsed,
  label,
  children,
}: {
  collapsed: boolean;
  label: string;
  // Base UI's `render` prop hands the trigger's own props to the element,
  // so it must be one that accepts them — every caller here passes a plain
  // button or Link.
  children: React.ReactElement<Record<string, unknown>>;
}) {
  if (!collapsed) return children;
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right" aria-hidden>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
