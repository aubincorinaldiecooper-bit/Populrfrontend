import { render as rtlRender, type RenderOptions, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Render with a cache that lives exactly as long as one test.
 *
 * The stores this replaced were module-level, so state outlived an unmount
 * and every suite needed a `resetXForTests()` call in `beforeEach` to stop
 * one test's count leaking into the next. Isolation is structural now — a
 * fresh client per render, which is the same thing signing out does in the
 * app — so suites import this `render` instead of the library's and get it
 * without remembering anything.
 *
 * Retries are off so a test asserting a failure sees it on the first try,
 * and background refetching is off so nothing fires between assertions that
 * the test didn't ask for.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export function render(
  ui: React.ReactNode,
  options?: RenderOptions & { queryClient?: QueryClient },
): RenderResult & { queryClient: QueryClient } {
  const queryClient = options?.queryClient ?? createTestQueryClient();
  const result = rtlRender(ui, {
    ...options,
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { ...result, queryClient };
}
