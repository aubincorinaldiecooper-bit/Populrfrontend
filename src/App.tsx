import { Routes, Route, Navigate } from 'react-router';
import { useApp } from './context/AppContext';
import { lazy, Suspense } from 'react';

import Onboarding from './components/Onboarding';
import Layout from './components/Layout';
import LoadingState from './components/LoadingState';

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

export default function App() {
  const { isLoading, onboardingComplete } = useApp();

  if (isLoading) return <LoadingState />;
  if (!onboardingComplete) return <Onboarding />;

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
