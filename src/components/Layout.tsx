import { Outlet, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import EditorRail from './EditorRail';
import ErrorBoundary from './ErrorBoundary';

/**
 * One editor route, and it is the automation builder.
 *
 * Anchored on the route rather than on anything the page reports upward, so
 * the shell is decided before the page renders and there is no frame where
 * the builder mounts inside the wrong chrome. `/automations` (the list) is
 * deliberately NOT an editor route — only an individual automation is.
 */
function isEditorRoute(pathname: string): boolean {
  return /^\/automations\/[^/]+/.test(pathname);
}

export default function Layout({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const editor = isEditorRoute(location.pathname);

  return (
    <div className="min-h-screen bg-background">
      {/* Editor mode swaps the navigation, not the app. Everywhere else keeps
          the full sidebar exactly as it was. */}
      {editor ? <EditorRail /> : null}
      <Sidebar railMode={editor} />

      {/* The offset follows the chrome. In the editor that is 60px instead of
          280px, and the 220px difference goes to the canvas — which is the
          whole point of the mode.
          Top offset must match the mobile bar's full height, safe-area inset
          included (see Sidebar) — otherwise the first rows of content sit
          under the bar on notched devices. */}
      <main
        className={`min-h-screen pt-[calc(4rem+env(safe-area-inset-top))] md:pt-0
          ${editor ? 'md:ml-[60px]' : 'md:ml-[280px]'}`}
      >
        {/* Scoped to the content area and keyed on the route, so a crash on
            one page (e.g. a lazy chunk failing to load after a redeploy)
            shows a recoverable message here instead of blanking the whole
            app, and clears itself when the user navigates elsewhere. */}
        <ErrorBoundary resetKey={location.pathname}>
          {children ?? <Outlet />}
        </ErrorBoundary>
      </main>
      {/* ToastContainer is rendered once, unconditionally, in App.tsx — it
          needs to be visible before onboarding completes (Layout isn't
          mounted yet), not just after. */}
    </div>
  );
}
