import { Outlet, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import ContactProfileDrawer from './ContactProfileDrawer';
import ErrorBoundary from './ErrorBoundary';
import { useApp } from '../context/AppContext';

export default function Layout({ children }: { children?: ReactNode }) {
  const { showContactDrawer } = useApp();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="md:ml-[280px] min-h-screen pt-16 md:pt-0">
        {/* Scoped to the content area and keyed on the route, so a crash on
            one page (e.g. a lazy chunk failing to load after a redeploy)
            shows a recoverable message here instead of blanking the whole
            app, and clears itself when the user navigates elsewhere. */}
        <ErrorBoundary resetKey={location.pathname}>
          {children ?? <Outlet />}
        </ErrorBoundary>
      </main>
      {showContactDrawer && <ContactProfileDrawer />}
      {/* ToastContainer is rendered once, unconditionally, in App.tsx — it
          needs to be visible before onboarding completes (Layout isn't
          mounted yet), not just after. */}
    </div>
  );
}
