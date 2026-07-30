import { Outlet } from 'react-router';
import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import ContactProfileDrawer from './ContactProfileDrawer';
import { useApp } from '../context/AppContext';

export default function Layout({ children }: { children?: ReactNode }) {
  const { showContactDrawer } = useApp();

  return (
    <div className="min-h-screen bg-cream">
      <Sidebar />
      <main className="lg:ml-[220px] min-h-screen pt-14 lg:pt-0">
        {children ?? <Outlet />}
      </main>
      {showContactDrawer && <ContactProfileDrawer />}
      {/* ToastContainer is rendered once, unconditionally, in App.tsx — it
          needs to be visible before onboarding completes (Layout isn't
          mounted yet), not just after. */}
    </div>
  );
}
