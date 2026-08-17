import { Link, useLocation } from 'react-router';
import { Plus, Zap, Settings, PanelLeftClose } from 'lucide-react';
import {
  Sidebar,
  SidebarHeader,
  SidebarMenu,
  SidebarFooter,
  sidebarMenuButtonClass,
  useSidebar,
} from '@/components/ui/sidebar';
import AccountMenu from '../AccountMenu';
import { navItems, isActivePath } from '../../lib/nav';
import { useApp } from '../../context/AppContext';
import { useInboxUnread } from '../inbox/useInboxUnread';
import { useCreateAutomation } from '../../context/CreateAutomationContext';

/**
 * Populr's navigation on the shell's Sidebar bones: the brand block, the
 * Create CTA, the primary nav from lib/nav, the Inbox waiting badge, and
 * the account identity — the same column it has always been, rendered once
 * here and shown as the fixed desktop column and the phone drawer alike.
 *
 * `desktop={false}` is the builder's mode: the EditorRail owns the desktop
 * edge there, and this keeps serving the phone drawer only.
 *
 * `onCollapse` is offered only inside the builder, where a narrower
 * navigation buys the canvas something. Absent everywhere else — there is
 * nothing to gain by collapsing the nav on Contacts, so the control would
 * just be a lever that makes the app worse.
 */
export default function AppSidebar({
  desktop = true,
  onCollapse,
}: {
  desktop?: boolean;
  onCollapse?: () => void;
}) {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  const { beginCreateAutomation } = useCreateAutomation();
  const { workspaceAccess } = useApp();
  const { count: inboxCount } = useInboxUnread();

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
    <Sidebar desktop={desktop}>
      {/* `hidden md:flex` because this renders in the phone drawer too, where
          an absolutely-positioned collapse control has no business — the
          drawer closes, it doesn't collapse. */}
      {onCollapse && (
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse navigation"
          title="Collapse navigation"
          className="absolute right-3 top-6 hidden md:flex rounded-lg p-1.5
            text-sidebar-muted-foreground transition-colors hover:bg-sidebar-muted
            hover:text-sidebar-foreground focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <PanelLeftClose size={17} strokeWidth={1.9} />
        </button>
      )}
      <SidebarHeader>
        {/* Brand */}
        <div className="px-4">
          <h1 className="font-display text-[26px] font-bold text-sidebar-foreground tracking-tight leading-none">
            Populr
          </h1>
          <p className="font-label text-[11px] text-sidebar-muted-foreground uppercase tracking-widest mt-1.5">
            Creator Suite
          </p>
        </div>

        {/* Create CTA — the same action as Home's "Create an automation":
            one creation experience, two entry points. */}
        {offerCreate && (
          <button
            type="button"
            onClick={() => {
              closeMobile();
              beginCreateAutomation();
            }}
            className="mx-1 flex items-center justify-center gap-2 rounded-full bg-sidebar-accent
              px-6 py-3.5 font-semibold text-foreground transition-colors
              hover:bg-secondary-fixed-dim"
          >
            <Plus size={18} strokeWidth={2.5} />
            Create
          </button>
        )}
      </SidebarHeader>

      {/* Deliberately unlabeled: "Populr" is the EditorRail's accessible
          name, and tests (and screen-reader users) tell the two navigation
          surfaces apart by it. */}
      <SidebarMenu>
        {items.map(item => {
          const active = isActivePath(location.pathname, item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={closeMobile}
              className={sidebarMenuButtonClass(active)}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.4 : 2}
                className="transition-transform group-hover:scale-110"
              />
              <span className="text-[15px]">{item.label}</span>
              {item.path === '/inbox' && inboxCount > 0 && (
                // The waiting count the retired drawer-launcher used to
                // carry. The number is in the pill; the words are for ears.
                <span
                  className="ml-auto rounded-full bg-sidebar-primary px-1.5 text-[10.5px]
                    font-semibold leading-[17px] text-sidebar-primary-foreground"
                >
                  {inboxCount > 9 ? '9+' : inboxCount}
                  <span className="sr-only"> conversations waiting</span>
                </span>
              )}
            </Link>
          );
        })}
      </SidebarMenu>

      <SidebarFooter>
        <AccountMenu onNavigate={closeMobile} />
      </SidebarFooter>
    </Sidebar>
  );
}
