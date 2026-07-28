import { Routes, Route, Navigate, useLocation } from 'react-router';
import { useApp } from './context/AppContext';
import { lazy, Suspense } from 'react';

import Onboarding from './components/Onboarding';
import Layout from './components/Layout';
import LoadingState from './components/LoadingState';
import LandingPage from './pages/LandingPage';
import ToastContainer from './components/ToastContainer';

// MVP pages
import OpportunitiesPage from './pages/OpportunitiesPage';
import CampaignsPage from './pages/CampaignsPage';
import CampaignBuilderPage from './pages/CampaignBuilderPage';
import InboxPage from './pages/InboxPage';
import SettingsPage from './pages/SettingsPage';

// Hidden pages (contextual, not in main nav)
import SegmentsPage from './pages/SegmentsPage';
import AutomationBuilderPage from './pages/AutomationBuilderPage';

const ContactsPage = lazy(() => import('./pages/ContactsPage'));
const ContentPage = lazy(() => import('./pages/ContentPage'));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));

function AppContent() {
  const { isLoading, onboardingComplete } = useApp();
  const location = useLocation();

  if (isLoading) return <LoadingState />;

  // Before onboarding, /connect is the connect flow; every other path (the
  // site's root included) is the marketing landing page, whose CTA links
  // into /connect. (Not "/onboarding" — a static onboarding.html prototype
  // file at the repo root shadows that path in `vite dev`.)
  if (!onboardingComplete) {
    return location.pathname === '/connect' ? <Onboarding /> : <LandingPage />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<OpportunitiesPage />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/campaigns/new" element={<CampaignBuilderPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/segments" element={<SegmentsPage />} />
        <Route path="/automations" element={<Suspense fallback={<LoadingState />}><AutomationsPage /></Suspense>} />
        <Route path="/automations/new" element={<AutomationBuilderPage />} />
        <Route path="/contacts" element={<Suspense fallback={<LoadingState />}><ContactsPage /></Suspense>} />
        <Route path="/content" element={<Suspense fallback={<LoadingState />}><ContentPage /></Suspense>} />
        <Route path="/analytics" element={<Suspense fallback={<LoadingState />}><AnalyticsPage /></Suspense>} />
      </Route>
      <Route path="/dashboard" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <>
      <AppContent />
      {/* Rendered unconditionally: connect errors happen before onboardingComplete
          is true, and Layout (which normally owns this) isn't mounted yet. */}
      <ToastContainer />
    </>
  );
}
