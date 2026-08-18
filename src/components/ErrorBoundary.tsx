import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

// A lazily-loaded route chunk failing to load is the classic symptom of an
// open tab sitting on an old deploy: index.html was cached before a new
// build, so it still references chunk filenames (e.g. CreatePostPage-<hash>.js)
// that no longer exist on the server, and the dynamic import 404s. Different
// browsers phrase this differently, hence the broad match.
const CHUNK_ERROR_RE =
  /Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i;

// Guards the one automatic reload below so a genuinely broken deploy (chunk
// 404s even after a fresh index.html) can't put the tab into a reload loop.
const RELOAD_FLAG = 'populr:chunk-reload';

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return CHUNK_ERROR_RE.test(text);
}

interface Props {
  children: ReactNode;
  /**
   * When this value changes, the boundary clears its error and re-renders
   * its children. Pass the route pathname so a crash on one page doesn't
   * trap the user in the error UI after they navigate somewhere else.
   */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      // Navigated away from the route that errored — recover.
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error) && !sessionStorage.getItem(RELOAD_FLAG)) {
      // Self-heal the stale-deploy case: one reload pulls a fresh
      // index.html and, with it, the current chunk filenames. The flag
      // stops this repeating if the reload doesn't actually fix it.
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
      return;
    }
    // Never logs anything user-identifying — just the error itself, so a
    // real crash is diagnosable from the browser console in production.
    console.error('[error-boundary] caught:', error, info.componentStack);
  }

  private handleReload = () => {
    // Clear the guard so this manual reload always actually reloads, even
    // if an automatic one already happened this session.
    sessionStorage.removeItem(RELOAD_FLAG);
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkLoadError(error);
    return (
      <div className="pop-page max-w-[560px] py-16">
        <div className="pop-card p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-[#111111]">
              {chunk ? 'Populr was just updated' : 'Something went wrong'}
            </p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              {chunk
                ? 'A newer version of Populr is available. Reload to pick it up — your work-in-progress on other tabs is unaffected.'
                : 'This page ran into an unexpected error. Reloading usually clears it; if it keeps happening, let us know.'}
            </p>
            <div className="flex items-center gap-2.5 mt-4">
              <button onClick={this.handleReload} className={cn(buttonVariants(), "text-[12px] py-2 px-3")}>
                <RefreshCw size={13} /> Reload
              </button>
              {!chunk && (
                <button
                  onClick={() => window.location.assign('/')}
                  className={cn(buttonVariants({ variant: 'outline' }), "text-[12px] py-2 px-3")}
                >
                  Go home
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
