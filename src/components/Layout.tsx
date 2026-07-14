import { Outlet } from 'react-router';
import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import ContactProfileDrawer from './ContactProfileDrawer';
import NotificationDrawer from './NotificationDrawer';
import ToastContainer from './ToastContainer';
import { useApp } from '../context/AppContext';

export default function Layout({ children }: { children?: ReactNode }) {
  const { showContactDrawer, showNotifications, closeNotifications } = useApp();

  return (
    <div className="min-h-screen bg-cream">
      <Sidebar />
      <main className="lg:ml-[220px] min-h-screen pt-14 lg:pt-0">
        {children ?? <Outlet />}
      </main>
      {showContactDrawer && <ContactProfileDrawer />}
      <NotificationDrawer open={showNotifications} onClose={closeNotifications} />
      <ToastContainer />
    </div>
  );
}
