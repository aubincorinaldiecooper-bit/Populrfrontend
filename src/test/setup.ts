import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// jsdom gives each test FILE a fresh window but not each test, so anything
// written to localStorage outlives the test that wrote it. The app keeps
// real preferences there — the navigation's collapsed width, the composer's
// model — and a preference leaking forward makes the next test's shell a
// different shape than it asked for.
afterEach(() => {
  window.localStorage.clear();
});

// Provide the client-visible env var authClient.ts requires. Any test
// that needs a different value can override via vi.stubEnv().
if (!import.meta.env.VITE_AUTH_URL) {
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

// jsdom has no layout, so it implements no scrolling either — scrollIntoView
// is simply absent. Anything that brings a control into view (the builder's
// notification panel, the node inspector, the preview conversation) calls it
// during a normal render, and an absent method throws rather than no-opping.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom reflects <dialog>'s `open` attribute but doesn't implement the
// showModal()/close() methods (longstanding jsdom gap) — Astryx's
// Dialog/AlertDialog and anything built on them call these directly, so
// without a polyfill every test that opens one throws "not a function".
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
