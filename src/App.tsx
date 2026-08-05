import { Routes, Route, Navigate, useLocation } from 'react-router';
import { useApp } from './context/AppContext';
import { rememberReturnTo } from './lib/returnTo';
import { useAuth } from './context/AuthContext';
import { lazy, Suspense } from 'react';

import Layout from './components/Layout';
import LoadingState from './components/LoadingState';
import LoginPage from './pages/LoginPage';
import AuthCompletePage from './pages/AuthCompletePage';
import ToastContainer from './components/ToastContainer';
import SubscriptionModal from './components/SubscriptionModal';

// MVP pages
import ChannelsPage from './pages/ChannelsPage';
import CampaignsPage from './pages/CampaignsPage';
import CampaignBuilderPage from './pages/CampaignBuilderPage';
import InboxPage from './pages/InboxPage';
import SettingsPage from './pages/SettingsPage';

// Hidden pages (contextual, not in main nav)
import AutomationWizard from './components/automation-wizard/AutomationWizard';

const ContactsPage = lazy(() => import('./pages/ContactsPage'));
const ContentPage = lazy(() => import('./pages/ContentPage'));
const PostDetailPage = lazy(() => import('./pages/PostDetailPage'));
const CreatePostPage = lazy(() => import('./pages/CreatePostPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));

/**
 * Central route gate. Every routing decision reads Better Auth's session
 * state (`useAuth`) — the source of truth for "is this user
 * authenticated?"; never localStorage. There is no separate onboarding
 * gate: signing in lands on Home, whose first-run state walks a new
 * creator toward their first automation (connecting an account happens
 * along the way, or any time on /channels). The old gate lived in
 * per-device localStorage, so every new browser — every phone — re-ran
 * "connect your channel" even for fully set-up accounts.
 *
 * The single most important invariant is that /login and /auth/complete
 * always render, regardless of auth state — they own their own
 * authenticated-user redirect logic internally, and hijacking them here
 * would cause infinite loops during callback processing.
 */
function AppContent() {
  const { isLoading } = useApp();
  const { session, loading: authLoading } = useAuth();
  const location = useLocation();

  // AppContext's own local isLoading flag (used for imperative "please
  // wait" moments); orthogonal to auth. Kept for backward compatibility.
  if (isLoading) return <LoadingState />;

  // Signed-out visitors go straight to sign-in. There is no marketing
  // landing page: Populr's entry point is the Google login screen, so `/`
  // without a session is just the front door, not a page to read. `/`
  // renders Home once authenticated (below).
  if (location.pathname === '/' && !session && !authLoading) {
    return <Navigate to="/login" replace />;
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
    // Any protected route + no session → send to /login, remembering where
    // they were headed so signing in returns them there instead of always
    // dumping them on Home. The path is stashed in sessionStorage and
    // validated as same-origin (see lib/returnTo.ts) rather than threaded
    // through the URL: the auth service rejects unvalidated callbackURLs,
    // and a query-param returnTo is the classic open-redirect vector.
    rememberReturnTo(location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }

  // From here: authenticated user.

  // Authenticated: the full product surface. `/` renders Home;
  // the retired `/opportunities` and `/segments` routes land on Contacts,
  // where fans are classified now (filters + tags). `/connect` is
  // aliased to `/connections` for onboarded users, preserving the
  // `?connected=<platform>` query the OAuth callback attaches — that
  // marker is what ConnectionsPage reads to know a fresh account just
  // synced.
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Suspense fallback={<LoadingState />}><HomePage /></Suspense>} />
        <Route path="/opportunities" element={<Navigate to="/contacts" replace />} />
        <Route path="/connect" element={<Navigate to={`/channels${location.search}`} replace />} />
        <Route path="/channels" element={<ChannelsPage />} />
        <Route path="/connections" element={<Navigate to={`/channels${location.search}`} replace />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/campaigns/new" element={<CampaignBuilderPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/segments" element={<Navigate to="/contacts" replace />} />
        <Route path="/automations" element={<Suspense fallback={<LoadingState />}><AutomationsPage /></Suspense>} />
        <Route path="/automations/new" element={<AutomationWizard />} />
        <Route path="/contacts" element={<Suspense fallback={<LoadingState />}><ContactsPage /></Suspense>} />
        <Route path="/create" element={<Suspense fallback={<LoadingState />}><CreatePostPage /></Suspense>} />
        <Route path="/content" element={<Suspense fallback={<LoadingState />}><ContentPage /></Suspense>} />
        <Route path="/content/:postId" element={<Suspense fallback={<LoadingState />}><PostDetailPage /></Suspense>} />
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
          requirement) can arrive on routes where Layout (which normally
          owns drawers) isn't mounted.
          The last-resort ErrorBoundary lives in main.tsx above every
          provider — see there for why placing it here isn't enough. */}
      <ToastContainer />
      <SubscriptionModalHost />
    </>
  );
}
