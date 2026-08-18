import { Outlet, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import AppSidebar from './app/AppSidebar';
import AppHeader from './app/AppHeader';
import { CreateAutomationProvider } from '../context/CreateAutomationContext';
import ErrorBoundary from './ErrorBoundary';
import { HeaderSlotsProvider } from './app/headerSlots';
import { useLiveFeed } from './app/useLiveFeed';

/**
 * The authenticated shell: SidebarProvider → AppSidebar → SidebarInset →
 * AppHeader → page content. One structure for every page — and no route
 * gets to opt out of it.
 *
 * It used to. The automation builder swapped the sidebar for a 60px icon
 * rail and rendered its own header instead of this one, which meant two
 * navigations and two headers to keep in step, and they didn't stay in
 * step: different palettes, different icon sizes, different badge, a
 * collapse control that existed on one route and moved ends when you used
 * it, and — on phones — two stacked bars where every other page has one.
 *
 * The builder still needs its breadcrumb and its Activate button. Those go
 * into the header's page slots (app/headerSlots.tsx), which is the whole
 * point of having slots: the content changes, the shell does not.
 */
export default function Layout({ children }: { children?: ReactNode }) {
  const location = useLocation();

  // One connection for the whole signed-in app. It belongs here rather than
  // on the surfaces that consume it because those surfaces mount and unmount
  // as the creator moves around, and the news doesn't stop while they're on
  // another page — it lands in the cache, and the page it belongs to finds
  // it already fresh when they arrive.
  useLiveFeed();

  return (
    <CreateAutomationProvider>
      <SidebarProvider>
        <HeaderSlotsProvider>
          <div className="min-h-screen bg-background">
            <AppSidebar />

            <SidebarInset>
              <AppHeader />
              {/* Scoped to the content area and keyed on the route, so a crash
                  on one page (e.g. a lazy chunk failing to load after a
                  redeploy) shows a recoverable message here instead of
                  blanking the whole app, and clears itself when the user
                  navigates elsewhere. */}
              <ErrorBoundary resetKey={location.pathname}>
                {children ?? <Outlet />}
              </ErrorBoundary>
            </SidebarInset>
            {/* The toast Toaster is rendered once, unconditionally, in App.tsx
                — it needs to be visible before onboarding completes (Layout
                isn't mounted yet), not just after. */}
          </div>
        </HeaderSlotsProvider>
      </SidebarProvider>
    </CreateAutomationProvider>
  );
}
