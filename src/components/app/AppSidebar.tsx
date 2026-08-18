import { Link, useLocation } from 'react-router';
import { Plus, Zap, Settings } from 'lucide-react';
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
import { useInboxWaiting } from '../inbox/conversations';
import { useCreateAutomation } from '../../context/CreateAutomationContext';

/**
 * Populr's navigation on the shell's Sidebar bones: the brand block, the
 * Create CTA, the primary nav from lib/nav, the Inbox waiting badge, and
 * the account identity — rendered once here and shown as the fixed desktop
 * column and the phone drawer alike.
 *
 * This is the whole navigation, everywhere. The automation builder used to
 * swap it for a 60px icon rail — a second component reading the same item
 * list, which is not the same thing as being the same navigation. The two
 * drifted exactly where you would expect: the rail kept raw hex and a
 * pre-token palette, an 18px icon against this one's 20px, a dark corner
 * dot where this has a lime pill, and its own focus ring. What a creator
 * saw was the product changing shape when they opened an automation.
 *
 * The content changes between pages. This does not.
 */
export default function AppSidebar() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
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
    <Sidebar>
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

      <SidebarMenu>
        {items.map(item => {
          const active = isActivePath(location.pathname, item.path);
          const Icon = item.icon;
          const waiting = item.path === '/inbox' ? inboxCount : 0;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={closeMobile}
              // The real count belongs in the name even when the pill has to
              // round it off: "9+" is a decision about width, not about how
              // many people are waiting.
              aria-label={waiting > 0 ? `${item.label}, ${waiting} conversations waiting` : undefined}
              aria-current={active ? 'page' : undefined}
              className={sidebarMenuButtonClass(active)}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.4 : 2}
                className="transition-transform group-hover:scale-110"
              />
              <span className="text-[15px]">{item.label}</span>
              {waiting > 0 && (
                // The waiting count the retired drawer-launcher used to
                // carry. aria-hidden because the link above already says it.
                <span
                  aria-hidden="true"
                  className="ml-auto rounded-full bg-sidebar-primary px-1.5 text-[10.5px]
                    font-semibold leading-[17px] text-sidebar-primary-foreground"
                >
                  {waiting > 9 ? '9+' : waiting}
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
