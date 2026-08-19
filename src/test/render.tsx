import { render as rtlRender, type RenderOptions, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SidebarProvider } from '@/components/ui/sidebar';

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
    // The shell's providers, not the test's decoration. Every authenticated
    // surface in the app renders inside both of these — the query cache and
    // the navigation state — so a piece of it rendered here does too. The
    // navigation one is here rather than at each call site because pages ask
    // it real questions now (the builder measures its columns against the
    // width the column is actually taking), and a provider each suite had to
    // remember is a provider a suite will forget.
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <SidebarProvider>{children}</SidebarProvider>
      </QueryClientProvider>
    ),
  });
  return { ...result, queryClient };
}
