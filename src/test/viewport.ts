/**
 * A viewport the media queries actually agree with.
 *
 * jsdom implements no layout and no matchMedia, so setup.ts installs a stub
 * that answers `false` to everything. That is the right default — it keeps
 * every responsive path out of the way of tests that aren't about layout —
 * but it makes `window.innerWidth = 900` a half-truth: code that measures
 * directly sees 900, and code that subscribes to a breakpoint is told the
 * breakpoint never matches. A test can then pass on the measuring path while
 * the subscribing path is stubbed dead.
 *
 * This sets both together. min-width and max-width are evaluated against the
 * width, which is all the app ever asks. setup.ts puts the blanket stub back
 * after each test, so a file that calls this doesn't have to remember to.
 */
export function setViewportWidth(px: number): void {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => {
      const max = /max-width:\s*(\d+)/.exec(query);
      const min = /min-width:\s*(\d+)/.exec(query);
      return {
        matches: max ? px <= Number(max[1]) : min ? px >= Number(min[1]) : false,
        media: query,
        onchange: null,
        // Nothing here fires a crossing: a test that wants one changes the
        // width and re-renders, which is what a creator resizing does to the
        // subscription anyway.
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      };
    },
  });
}
