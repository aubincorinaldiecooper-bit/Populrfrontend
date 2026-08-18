import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from './context/AppContext'
import { AuthProvider } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import { createQueryClient, listenForCreatorsReturn } from './lib/queryClient'
import './index.css'
import App from './App.tsx'

// QueryClientProvider holds everything the server has told us. It sits
// above AuthProvider because signing out CLEARS it — cached answers belong
// to the session that asked for them, and must not still be on screen when
// the next person signs in.
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
const queryClient = createQueryClient()
listenForCreatorsReturn()

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
)
