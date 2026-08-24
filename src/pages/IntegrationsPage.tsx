import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Card } from '@/components/ui/card';
import { Page } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Plug, RefreshCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import ConfirmDialog from '../components/app/ConfirmDialog';
import { useApp } from '../context/AppContext';
import { isOwnerView } from '../lib/access';
import {
  isBackendConfigured,
  fetchIntegrations,
  getIntegrationConnectUrl,
  disconnectIntegration,
  syncIntegrations,
} from '../lib/api';
import type { Integration, IntegrationStatus } from '../lib/api';

/**
 * The apps a workspace runs on — Google Calendar, Calendly, Shopify and the
 * rest — connected through Composio.
 *
 * Deliberately its own page rather than a section of Channels. Channels is
 * the creator's own social accounts, where "connected" means Populr can post
 * and reply AS them; this is business software the workspace already uses,
 * where "connected" means Populr can read a calendar or look up an order.
 * Different promises, so different doors.
 *
 * The catalog itself lives on the backend (config/integrations.ts), not
 * here: it's the allowlist the connect route enforces, so a second copy in
 * the frontend could only ever drift out of agreement with the thing that
 * actually decides. The category label is the one bit of presentation this
 * page owns, because a backend slug isn't a word for a screen.
 */

const CATEGORY_LABELS: Record<string, string> = {
  calendar: 'Calendar',
  scheduling: 'Scheduling',
  commerce: 'Commerce',
  crm: 'CRM',
  productivity: 'Productivity',
};

/** Stable ordering so the grid never reshuffles as statuses change under it. */
const CATEGORY_ORDER = ['calendar', 'scheduling', 'commerce', 'crm', 'productivity'];

/**
 * The product's status vocabulary, not a private one.
 *
 * StatusPill already maps connected / disconnected / reconnect_required to a
 * tone — those are the same words Channels uses for the same states, and
 * routing through it is what keeps one green from drifting from another.
 * Only 'pending' needs translating: it's Composio's INITIALIZING/INITIATED,
 * which is the same idea as a channel mid-sync.
 */
function statusPillProps(status: IntegrationStatus): { status: string; label: string } {
  switch (status) {
    case 'connected':
      return { status: 'connected', label: 'Connected' };
    case 'pending':
      return { status: 'syncing', label: 'Finishing up' };
    case 'reconnect_required':
      return { status: 'reconnect_required', label: 'Needs reconnecting' };
    default:
      return { status: 'available', label: 'Not connected' };
  }
}

/** The provider's logo when it sent one, otherwise a neutral mark — never a
 *  broken image, and never a blank square that reads as still loading. */
function IntegrationMark({ integration }: { integration: Integration }) {
  const [failed, setFailed] = useState(false);
  const showLogo = integration.logoUrl && !failed;
  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
      {showLogo ? (
        <img
          src={integration.logoUrl!}
          alt=""
          className="h-6 w-6 object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Plug size={18} className="text-muted-foreground" />
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  const { showToast, workspaceAccess } = useApp();
  const ownerView = isOwnerView(workspaceAccess);
  const [searchParams] = useSearchParams();
  const backendConfigured = isBackendConfigured();

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [configured, setConfigured] = useState(true);
  // Starts false when there's no backend to ask: the effect below skips
  // entirely in that case, so an initial `true` would strand the page on
  // "Loading…" forever.
  const [loading, setLoading] = useState(backendConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [confirmOff, setConfirmOff] = useState<Integration | null>(null);

  // A promise chain rather than async/await with an early return, so that no
  // setState runs synchronously when this is called from an effect — which
  // is both what react-hooks/set-state-in-effect asks for and what keeps the
  // first paint from cascading.
  const load = useCallback((): Promise<void> => {
    if (!backendConfigured) return Promise.resolve();
    return fetchIntegrations()
      .then(data => {
        setIntegrations(data.integrations);
        setConfigured(data.configured);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        console.error('[integrations] failed to load:', err);
        // The page shows the failure rather than an empty catalog: "no
        // integrations" and "we couldn't ask" look identical otherwise, and
        // only one of them is worth retrying.
        setLoadError(err instanceof Error ? err.message : 'Couldn’t load integrations.');
      })
      .then(() => {
        setLoading(false);
      });
  }, [backendConfigured]);

  useEffect(() => {
    void load();
  }, [load]);

  // The backend's callback returns here with one-shot markers once it has
  // VERIFIED the outcome with Composio — ?integration_connected=<slug> on
  // success, ?integration_error=<reason> otherwise. Read once, acted on, and
  // stripped, so a reload can't replay a stale banner.
  useEffect(() => {
    const connected = searchParams.get('integration_connected');
    const failed = searchParams.get('integration_error');
    if (!connected && !failed) return;

    if (connected) {
      showToast('Connected. Populr can use it now.', 'success');
    } else {
      showToast(
        failed === 'not_active'
          ? 'That app didn’t finish authorizing. Try connecting it again.'
          : 'Couldn’t finish connecting that app. Try again.',
        'error',
      );
    }

    const url = new URL(window.location.href);
    for (const key of ['integration_connected', 'integration_error', 'integration']) {
      url.searchParams.delete(key);
    }
    window.history.replaceState(null, '', url.toString());
    void load();
  }, [searchParams, showToast, load]);

  const connect = (integration: Integration) => {
    setBusySlug(integration.slug);
    // Where the backend's callback returns the browser once it has confirmed
    // the connection with Composio. Origin + path only, no query, so the
    // markers the callback appends are the only ones that arrive.
    const to = `${window.location.origin}/integrations`;
    return getIntegrationConnectUrl(integration.slug, to)
      .then(url => {
        if (!url) {
          // A 200 with no URL is a broken backend, not a connect. Saying so
          // beats navigating the creator to "/undefined", which is what an
          // unchecked assignment here actually does.
          throw new Error(`Couldn’t start connecting ${integration.name}.`);
        }
        window.location.href = url;
      })
      .catch((err: unknown) => {
        console.error(`[integrations] failed to start ${integration.slug} connect:`, err);
        showToast(
          err instanceof Error && err.message
            ? err.message
            : `Couldn’t start connecting ${integration.name}.`,
          'error',
        );
        setBusySlug(null);
      });
  };

  const disconnect = (integration: Integration) => {
    if (!integration.connectionId) return Promise.resolve();
    setBusySlug(integration.slug);
    return disconnectIntegration(integration.connectionId)
      .then(() => {
        showToast(`${integration.name} disconnected.`, 'success');
        return load();
      })
      .catch((err: unknown) => {
        // The backend only marks it disconnected once the provider confirms,
        // so a failure here means it is genuinely still connected. Say that,
        // rather than optimistically clearing the card.
        console.error(`[integrations] failed to disconnect ${integration.slug}:`, err);
        showToast(
          err instanceof Error && err.message
            ? err.message
            : `Couldn’t disconnect ${integration.name}. It’s still connected.`,
          'error',
        );
      })
      .then(() => {
        setBusySlug(null);
      });
  };

  const runSync = () => {
    setSyncing(true);
    return syncIntegrations()
      .then(data => {
        setIntegrations(data.integrations);
        showToast('Integrations refreshed.', 'success');
      })
      .catch((err: unknown) => {
        console.error('[integrations] sync failed:', err);
        showToast(err instanceof Error ? err.message : 'Couldn’t refresh integrations.', 'error');
      })
      .then(() => {
        setSyncing(false);
      });
  };

  // One uniform grid rather than a section per category. Most categories
  // hold a single app today, and a section each left four half-empty rows
  // and a ragged left edge — the grouping was decorating the page rather
  // than helping anyone find anything. Sorted by category so related apps
  // still sit together, with the category named on the card itself.
  const ordered = useMemo(() => {
    const rank = (c: string) => {
      const i = CATEGORY_ORDER.indexOf(c);
      // A category the frontend doesn't know still renders — after the known
      // ones, never dropped. A new backend category must not make an app
      // invisible here.
      return i === -1 ? CATEGORY_ORDER.length : i;
    };
    return [...integrations].sort(
      (a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name),
    );
  }, [integrations]);

  const connectedCount = integrations.filter(i => i.status === 'connected').length;
  const canManage = ownerView && configured && backendConfigured;

  return (
    <Page className="max-w-[880px]">
      <PageHeader
        title="Integrations"
        subtitle="Connect the apps your business already runs on, so Populr can book, look up and follow up without leaving the conversation."
        action={
          backendConfigured && configured && integrations.length > 0 ? (
            <Button variant="outline" onClick={() => void runSync()} disabled={syncing}>
              <RefreshCw size={14} className={syncing ? 'animate-spin' : undefined} />
              {syncing ? 'Refreshing…' : 'Refresh'}
            </Button>
          ) : undefined
        }
      />

      {!backendConfigured && (
        <Card className="mb-6 flex items-start gap-3 p-5">
          <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-warning" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              Populr isn&apos;t connected to a backend yet
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Set <code className="rounded bg-muted px-1 py-0.5">VITE_API_URL</code> to your Populr
              backend to connect real apps here.
            </p>
          </div>
        </Card>
      )}

      {backendConfigured && !configured && (
        <Card className="mb-6 flex items-start gap-3 p-5">
          <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-warning" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              Integrations aren&apos;t switched on yet
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              The apps below are what&apos;s coming. Connecting them needs a Composio API key on the
              backend.
            </p>
          </div>
        </Card>
      )}

      {loadError && (
        <Card className="mb-6 flex items-start gap-3 p-5">
          <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Couldn&apos;t load integrations</p>
            <p className="mt-1 text-[13px] text-muted-foreground">{loadError}</p>
            <Button variant="outline" className="mt-3" onClick={() => void load()}>
              <RefreshCw size={14} /> Try again
            </Button>
          </div>
        </Card>
      )}

      {loading && <p className="text-[13px] text-muted-foreground">Loading integrations…</p>}

      {!loading && !loadError && (
        <div className="grid gap-3 sm:grid-cols-2">
          {ordered.map(integration => {
            const busy = busySlug === integration.slug;
            const isConnected = integration.status === 'connected';
            const needsReconnect = integration.status === 'reconnect_required';
            const pill = statusPillProps(integration.status);
            return (
              <Card key={integration.slug} className="flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <IntegrationMark integration={integration} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                      {CATEGORY_LABELS[integration.category] ?? integration.category}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold text-foreground">
                        {integration.name}
                      </span>
                      <StatusPill status={pill.status} label={pill.label} />
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                  {integration.blurb}
                </p>
                {needsReconnect && (
                  <p className="mt-2 text-[12px] leading-relaxed text-destructive">
                    The connection lapsed — reconnect to keep this working.
                  </p>
                )}

                {/* mt-auto so every card's actions sit on the same line
                    regardless of how long its description ran. */}
                {canManage && (
                  <div className="mt-auto flex items-center gap-2 pt-4">
                    {busy ? (
                      <Button variant="secondary" disabled>
                        <Loader2 size={14} className="animate-spin" /> Working…
                      </Button>
                    ) : isConnected ? (
                      <>
                        <Button variant="outline" onClick={() => setConfirmOff(integration)}>
                          Disconnect
                        </Button>
                        <Button variant="ghost" onClick={() => void connect(integration)}>
                          Reconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant={needsReconnect ? 'secondary' : 'default'}
                        onClick={() => void connect(integration)}
                      >
                        {needsReconnect ? (
                          <>
                            <RefreshCw size={14} /> Reconnect
                          </>
                        ) : (
                          'Connect'
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {!loading && !loadError && integrations.length > 0 && (
        <p className="mt-6 text-[13px] text-muted-foreground">
          {connectedCount > 0
            ? `${connectedCount} of ${integrations.length} connected`
            : 'Nothing connected yet — connect an app to use it in your automations.'}
        </p>
      )}

      <ConfirmDialog
        open={confirmOff !== null}
        onOpenChange={open => {
          if (!open) setConfirmOff(null);
        }}
        title={`Disconnect ${confirmOff?.name ?? 'this app'}?`}
        description={`Populr will stop using ${confirmOff?.name ?? 'it'}. Anything set up to rely on it will stop working until you connect it again.`}
        confirmLabel="Disconnect"
        onConfirm={() => {
          const target = confirmOff;
          setConfirmOff(null);
          if (target) void disconnect(target);
        }}
      />
    </Page>
  );
}
