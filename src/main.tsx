import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { Theme } from '@astryxdesign/core/theme'
import { LayerProvider } from '@astryxdesign/core/Layer'
import { AppProvider } from './context/AppContext'
import { AuthProvider } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import { populrTheme } from './design-system/theme'
import './index.css'
import App from './App.tsx'

// Theme and LayerProvider are mounted once here at the true app root —
// never inside a page — so every route (migrated or not) shares the same
// token/overlay context. mode is fixed to 'light' for now; Populr has no
// dark mode yet, on either the legacy Tailwind UI or the Astryx side.
//
// AuthProvider wraps AppProvider so any AppContext consumer that needs to
// react to auth (e.g. a sign-out that clears user-scoped state) can read
// the session from a single, higher-in-tree source of truth.
//
// ErrorBoundary sits at the absolute top of the tree — above every
// provider — so a failure inside Theme, LayerProvider, BrowserRouter,
// AuthProvider, AppProvider, App, or App's own siblings (Toaster,
// SubscriptionModalHost) still surfaces a real message instead of a
// blank root. It deliberately consumes nothing from those providers (no
// theme tokens, no router hooks) so it stays renderable even when one
// of them is the thing that crashed. Layout has its own, route-scoped
// boundary for the common in-content case.
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <Theme theme={populrTheme} mode="light">
      <LayerProvider>
        <BrowserRouter>
          <AuthProvider>
            <AppProvider>
              <App />
            </AppProvider>
          </AuthProvider>
        </BrowserRouter>
      </LayerProvider>
    </Theme>
  </ErrorBoundary>
)
