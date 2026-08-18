import { Outlet, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import AppSidebar from './app/AppSidebar';
import AppHeader from './app/AppHeader';
import { CreateAutomationProvider } from '../context/CreateAutomationContext';
import EditorRail from './EditorRail';
import ErrorBoundary from './ErrorBoundary';
import { useBuilderNav } from '../lib/navPreference';
import { useLiveFeed } from './app/useLiveFeed';

/**
 * The authenticated shell: SidebarProvider → AppSidebar → SidebarInset →
 * AppHeader → page content. One structure for every page, so the user
 * always knows where the navigation and the global controls are.
 *
 * One editor route, and it is the automation builder — anchored on the
 * route rather than on anything the page reports upward, so the shell is
 * decided before the page renders and there is no frame where the builder
 * mounts inside the wrong chrome. `/automations` (the list) is
 * deliberately NOT an editor route — only an individual automation is.
 */
function isEditorRoute(pathname: string): boolean {
  return /^\/automations\/[^/]+/.test(pathname);
}

export default function Layout({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const editor = isEditorRoute(location.pathname);

  // One connection for the whole signed-in app. It belongs here rather than
  // on the surfaces that consume it because those surfaces mount and unmount
  // as the creator moves around, and the news doesn't stop while they're on
  // another page — it lands in the cache, and the page it belongs to finds
  // it already fresh when they arrive.
  useLiveFeed();

  // The route proposes; the creator decides.
  //
  // Collapsing purely on the route made the navigation something the app did
  // TO you: move between two screens and the furniture rearranges, with no way
  // to say you would rather it didn't. The rail still earns its place — inside
  // an automation the canvas is the product — so it stays the default here and
  // nowhere else. What changed is that it is now a default rather than a rule,
  // and the answer is remembered.
  const { collapsed, setCollapsed } = useBuilderNav(editor);
  const railed = editor && collapsed;

  return (
    <CreateAutomationProvider>
      <SidebarProvider>
        <div className="min-h-screen bg-background">
          {/* Editor mode swaps the desktop navigation, not the app: the rail
              takes the desktop edge, and AppSidebar keeps serving the phone
              drawer — without it a phone in the builder has no navigation. */}
          {railed ? <EditorRail onExpand={() => setCollapsed(false)} /> : null}
          <AppSidebar
            desktop={!railed}
            onCollapse={editor ? () => setCollapsed(true) : undefined}
          />

          {/* The offset follows the chrome. In the editor that is 60px instead
              of 280px, and the 220px difference goes to the canvas — which is
              the whole point of the mode.
              The builder gets only the mobile bar (its own editor header owns
              the desktop edge); every other page gets the full header. */}
          <SidebarInset className={railed ? 'md:ml-[60px]' : undefined}>
            <AppHeader mobileOnly={editor} />
            {/* Scoped to the content area and keyed on the route, so a crash on
                one page (e.g. a lazy chunk failing to load after a redeploy)
                shows a recoverable message here instead of blanking the whole
                app, and clears itself when the user navigates elsewhere. */}
            <ErrorBoundary resetKey={location.pathname}>
              {children ?? <Outlet />}
            </ErrorBoundary>
          </SidebarInset>
          {/* The toast Toaster is rendered once, unconditionally, in App.tsx —
              it needs to be visible before onboarding completes (Layout isn't
              mounted yet), not just after. */}
        </div>
      </SidebarProvider>
    </CreateAutomationProvider>
  );
}
