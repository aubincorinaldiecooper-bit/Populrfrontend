import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertCircle, Check, Loader2, Plug, Search, X } from 'lucide-react';
import {
  searchIntegrationCatalog,
  getIntegrationConnectUrl,
  isAbortError,
} from '../lib/api';
import type { CatalogToolkit } from '../lib/api';

/**
 * The app picker: search Composio's catalog, pick one, get sent off to
 * authorize it.
 *
 * This exists because the catalog is over a thousand toolkits. The page it
 * opens from lists what the workspace has CONNECTED; finding something new
 * is a search, not a wall of cards, and the connect itself is a decision
 * worth its own moment rather than a button in a grid.
 *
 * Everything offered here can actually be connected: the backend filters
 * the catalog to toolkits whose auth completes through a hosted redirect,
 * because an API-key app has nowhere to send the user and would be a
 * Connect button that can only fail.
 */

/** Long enough that a fast typist makes one request instead of six, short
 *  enough that the list still feels like it's keeping up. */
const SEARCH_DEBOUNCE_MS = 250;

function ToolkitMark({ toolkit }: { toolkit: CatalogToolkit }) {
  const [failed, setFailed] = useState(false);
  const showLogo = toolkit.logoUrl && !failed;
  return (
    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
      {showLogo ? (
        <img
          src={toolkit.logoUrl!}
          alt=""
          className="h-5 w-5 object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Plug size={16} className="text-muted-foreground" />
      )}
    </div>
  );
}

export default function AddIntegrationModal({
  open,
  onClose,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  /** Reported to the page so a failure lands in the normal toast surface
   *  rather than only inside a modal the user is about to close. */
  onError: (message: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogContent className="max-w-[560px] p-0">
        {/* Mounted only while open, which is what resets it.
            This used to be one component that cleared its own query,
            results and error in an effect when `open` flipped — a pile of
            synchronous setState in an effect body, and a second source of
            truth for "empty" that could drift from the initial state above
            it. Letting the picker mount and unmount makes fresh state the
            default rather than something to remember to restore. */}
        {open && <IntegrationPicker onClose={onClose} onError={onError} />}
      </DialogContent>
    </Dialog>
  );
}

function IntegrationPicker({
  onClose,
  onError,
}: {
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogToolkit[]>([]);
  // Starts true because this always searches on mount (an empty query, which
  // the backend answers with the featured apps). Initialising it here rather
  // than flipping it in an effect keeps the first paint honest and keeps
  // setState out of an effect body.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  /**
   * Deliberately does NOT set the loading flag itself.
   *
   * Callers own that, because the two call sites want different things: the
   * mount search starts with loading already true, and the debounced one
   * flips it inside a timer callback. Setting it in here would be a
   * synchronous setState inside an effect body at the first call site.
   */
  const runSearch = useCallback((term: string) => {
    // A newer keystroke wins: without this, a slow response for "ca" can
    // land after the one for "cale" and repaint stale results over fresh.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    return searchIntegrationCatalog(term, controller.signal)
      .then(toolkits => {
        if (controller.signal.aborted) return;
        setResults(toolkits);
        setError(null);
      })
      .catch((err: unknown) => {
        // A request we cancelled ourselves is not a failure to report.
        if (controller.signal.aborted || isAbortError(err)) return;
        console.error('[integrations] catalog search failed:', err);
        setError(err instanceof Error ? err.message : 'Couldn’t search apps.');
        setResults([]);
      })
      .then(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, []);

  // Mounting runs an empty search, which the backend answers with Populr's
  // featured apps — a short relevant list beats an empty panel and a
  // blinking cursor. Runs once; the debounce below owns every later search.
  const searched = useRef(false);
  useEffect(() => {
    searched.current = true;
    void runSearch('');
    return () => {
      inFlight.current?.abort();
    };
  }, [runSearch]);

  useEffect(() => {
    // The mount search already covered the initial empty query; without
    // this the picker would fire the same request twice on open.
    if (!searched.current) return;
    if (query === '') return;
    const handle = setTimeout(() => {
      setLoading(true);
      void runSearch(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, runSearch]);

  // Clearing the box goes back to the featured list, on the same debounce,
  // without racing the mount search on first render.
  const cleared = useRef(false);
  useEffect(() => {
    if (query !== '') {
      cleared.current = true;
      return;
    }
    if (!cleared.current) return;
    const handle = setTimeout(() => {
      setLoading(true);
      void runSearch('');
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, runSearch]);

  const connect = (toolkit: CatalogToolkit) => {
    setConnecting(toolkit.slug);
    // Where the backend's callback returns the browser once it has
    // confirmed the connection with Composio.
    const to = `${window.location.origin}/integrations`;
    return getIntegrationConnectUrl(toolkit.slug, to)
      .then(url => {
        if (!url) {
          // A 200 with no URL is a broken backend, not a connect. Saying so
          // beats navigating the creator to "/undefined".
          throw new Error(`Couldn’t start connecting ${toolkit.name}.`);
        }
        window.location.href = url;
      })
      .catch((err: unknown) => {
        console.error(`[integrations] failed to start ${toolkit.slug} connect:`, err);
        onError(
          err instanceof Error && err.message
            ? err.message
            : `Couldn’t start connecting ${toolkit.name}.`,
        );
        setConnecting(null);
        onClose();
      });
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0">
            <DialogTitle className="text-[17px] font-semibold text-foreground">
              Add an integration
            </DialogTitle>
            <DialogDescription className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Search the apps Populr can connect. Pick one and you&apos;ll be sent to sign in.
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg
              text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 pb-3">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground-subtle"
            />
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search apps — calendar, store, CRM…"
              className="pl-9"
              aria-label="Search apps"
            />
          </div>
        </div>

        {/* Fixed height rather than content height: the list changes on
            every keystroke, and a panel that grows and shrinks under the
            cursor makes the row you were aiming at move. */}
        <div className="max-h-[340px] min-h-[220px] overflow-y-auto px-5 pb-5">
          {error && (
            <div className="flex items-start gap-3 py-6">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-destructive" />
              <div>
                <p className="text-[13px] font-medium text-foreground">Couldn&apos;t search apps</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{error}</p>
                <Button variant="outline" className="mt-3" onClick={() => void runSearch(query)}>
                  Try again
                </Button>
              </div>
            </div>
          )}

          {!error && loading && results.length === 0 && (
            <p className="flex items-center gap-2 py-6 text-[13px] text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Searching…
            </p>
          )}

          {!error && !loading && results.length === 0 && (
            <p className="py-6 text-[13px] text-muted-foreground">
              {query.trim()
                ? `No apps match “${query.trim()}”.`
                : 'No apps available to connect right now.'}
            </p>
          )}

          <ul className="space-y-1">
            {results.map(toolkit => {
              const busy = connecting === toolkit.slug;
              return (
                <li key={toolkit.slug}>
                  <div className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60">
                    <ToolkitMark toolkit={toolkit} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-foreground">
                        {toolkit.name}
                      </p>
                      {toolkit.blurb && (
                        <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                          {toolkit.blurb}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {toolkit.connected ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                          <Check size={11} /> Connected
                        </span>
                      ) : busy ? (
                        <Button variant="secondary" disabled>
                          <Loader2 size={13} className="animate-spin" />
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => void connect(toolkit)}
                          disabled={connecting !== null}
                        >
                          Connect
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
    </>
  );
}
