import { Routes, Route, Navigate, useLocation } from 'react-router';
import { useApp } from './context/AppContext';
import { useAuth } from './context/AuthContext';
import { lazy, Suspense } from 'react';

import Onboarding from './components/Onboarding';
import Layout from './components/Layout';
import LoadingState from './components/LoadingState';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import AuthCompletePage from './pages/AuthCompletePage';
import ToastContainer from './components/ToastContainer';
import SubscriptionModal from './components/SubscriptionModal';

// MVP pages
import OpportunitiesPage from './pages/OpportunitiesPage';
import ConnectionsPage from './pages/ConnectionsPage';
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

/**
 * Central route gate. Every routing decision reads:
 *   - Better Auth's session state (`useAuth`) — the source of truth for
 *     "is this user authenticated?"; never localStorage.
 *   - AppContext's `onboardingComplete` — persistence around the social
 *     OAuth round-trip. This is separate from auth: it only tells us
 *     whether the user has finished connecting at least one social
 *     account, which is a product step, not an authentication one.
 *
 * The single most important invariant is that /login and /auth/complete
 * always render, regardless of auth state — they own their own
 * authenticated-user redirect logic internally, and hijacking them here
 * would cause infinite loops during callback processing.
 */
function AppContent() {
  const { isLoading, onboardingComplete } = useApp();
  const { session, loading: authLoading } = useAuth();
  const location = useLocation();

  // AppContext's own local isLoading flag (used for imperative "please
  // wait" moments); orthogonal to auth. Kept for backward compatibility.
  if (isLoading) return <LoadingState />;

  // Public marketing landing page: always accessible to unauthenticated
  // visitors. Authenticated users get routed into the product below —
  // the special-case for `/` there just renders OpportunitiesPage
  // directly rather than redirecting.
  if (location.pathname === '/' && !session && !authLoading) {
    return <LandingPage />;
  }

  // Public auth routes: /login and /auth/complete render for everyone.
  // /login handles its own "already authenticated" redirect internally;
  // /auth/complete needs to run regardless of session state (that's when
  // it decides where to route).
  if (location.pathname === '/login') return <LoginPage />;
  if (location.pathname === '/auth/complete') return <AuthCompletePage />;

  // Below here, every route is auth-protected. While the initial session
  // lookup is in flight, show a lightweight loader instead of flashing
  // the login screen (which would look broken on refresh).
  if (authLoading) return <LoadingState />;

  if (!session) {
    // Any protected route + no session → send to /login. Deliberately
    // does not carry a returnTo — the server rejects unvalidated
    // callbackURLs and adding one from the frontend just invites open
    // redirects.
    return <Navigate to="/login" replace />;
  }

  // From here: authenticated user.

  // Not-yet-onboarded users only see /connect; everything else routes
  // them there. This is the same "one route until onboarding is done"
  // rule the previous gate enforced, just now scoped to authenticated
  // users rather than every visitor.
  if (!onboardingComplete) {
    if (location.pathname === '/connect') return <Onboarding />;
    return <Navigate to="/connect" replace />;
  }

  // Onboarded, authenticated: the full product surface. `/` renders
  // Opportunities directly (matches prior product behavior). `/connect`
  // is aliased to `/connections` for onboarded users, preserving the
  // `?connected=<platform>` query the OAuth callback attaches — that
  // marker is what ConnectionsPage reads to know a fresh account just
  // synced.
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<OpportunitiesPage />} />
        <Route path="/connect" element={<Navigate to={`/connections${location.search}`} replace />} />
        <Route path="/connections" element={<ConnectionsPage />} />
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

function SubscriptionModalHost() {
  const { subscriptionModal, closeSubscriptionModal } = useApp();
  if (!subscriptionModal) return null;
  return <SubscriptionModal platform={subscriptionModal.platform} onClose={closeSubscriptionModal} />;
}

export default function App() {
  return (
    <>
      <AppContent />
      {/* Rendered unconditionally: connect errors (including a subscription
          requirement) can happen before onboardingComplete is true, and
          Layout (which normally owns drawers) isn't mounted yet. */}
      <ToastContainer />
      <SubscriptionModalHost />
    </>
  );
}
