import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { AppProvider } from './context/AppContext'
import { AuthProvider } from './context/AuthContext'
import './index.css'
import App from './App.tsx'

// AuthProvider wraps AppProvider so any AppContext consumer that needs to
// react to auth (e.g. a sign-out that clears user-scoped state) can read
// the session from a single, higher-in-tree source of truth.
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <AuthProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </AuthProvider>
  </BrowserRouter>
)
