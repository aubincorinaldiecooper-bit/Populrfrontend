import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Provide the client-visible env var authClient.ts requires. Any test
// that needs a different value can override via vi.stubEnv().
if (!(import.meta as any).env.VITE_AUTH_URL) {
  vi.stubEnv('VITE_AUTH_URL', 'http://localhost:4001');
}

// jsdom doesn't implement matchMedia — some UI code paths touch it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
