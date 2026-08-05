import { Outlet, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import ErrorBoundary from './ErrorBoundary';

export default function Layout({ children }: { children?: ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      {/* Top offset must match the mobile bar's full height, safe-area inset
          included (see Sidebar) — otherwise the first rows of content sit
          under the bar on notched devices. */}
      <main className="md:ml-[280px] min-h-screen pt-[calc(4rem+env(safe-area-inset-top))] md:pt-0">
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
