import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Card } from '@/components/ui/card';
import { Page } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Plug, Plus, RefreshCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/app/ConfirmDialog';
import AddIntegrationModal from '../components/AddIntegrationModal';
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
 * The apps a workspace has connected through Composio, and the door to
 * connecting more.
 *
 * This page answers "what is wired up", not "what could be". It used to be
 * a grid of every offered app with a status stamped on each — a directory
 * of eight cards, seven of which said "Not connected". The catalog is over
 * a thousand toolkits and lives behind a search now (AddIntegrationModal),
 * which is both the only way that scales and the right shape for the
 * question: adding an app is something you go looking for, once.
 *
 * Connecting is the prerequisite, not the point. A connected app becomes
 * available as a step inside an automation — book the call, look up the
 * order, log the lead — which is why the empty state points at automations
 * rather than treating a connected app as an end in itself.
 *
 * Deliberately separate from Channels, which is the creator's own social
 * accounts: there "connected" means Populr can post and reply AS them.
 */

/**
 * The product's status vocabulary, not a private one.
 *
 * StatusPill already maps connected / disconnected / reconnect_required to
 * a tone — the same words Channels uses for the same states. Only 'pending'
 * needs translating: it is Composio's INITIALIZING/INITIATED, which is the
 * same idea as a channel mid-sync.
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
      return { status: 'disconnected', label: 'Disconnected' };
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
  const [picking, setPicking] = useState(false);
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
        // The page shows the failure rather than an empty list: "nothing
        // connected" and "we couldn't ask" look identical otherwise, and
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
      showToast('Connected. You can use it in your automations now.', 'success');
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

  const reconnect = (integration: Integration) => {
    setBusySlug(integration.slug);
    const to = `${window.location.origin}/integrations`;
    return getIntegrationConnectUrl(integration.slug, to)
      .then(url => {
        if (!url) {
          // A 200 with no URL is a broken backend, not a connect. Saying so
          // beats navigating the creator to "/undefined".
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
        // rather than optimistically clearing the row.
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
        showToast(
          data.revoked > 0
            ? `Refreshed. ${data.revoked} connection${data.revoked === 1 ? '' : 's'} no longer active.`
            : 'Integrations refreshed.',
          data.revoked > 0 ? 'info' : 'success',
        );
      })
      .catch((err: unknown) => {
        console.error('[integrations] sync failed:', err);
        showToast(err instanceof Error ? err.message : 'Couldn’t refresh integrations.', 'error');
      })
      .then(() => {
        setSyncing(false);
      });
  };

  const canManage = ownerView && configured && backendConfigured;

  return (
    <Page className="max-w-[880px]">
      <PageHeader
        title="Integrations"
        subtitle="Connect the apps your business runs on, then use them as steps in your automations."
        action={
          canManage ? (
            <div className="flex items-center gap-2">
              {integrations.length > 0 && (
                <Button variant="outline" onClick={() => void runSync()} disabled={syncing}>
                  <RefreshCw size={14} className={syncing ? 'animate-spin' : undefined} />
                  {syncing ? 'Refreshing…' : 'Refresh'}
                </Button>
              )}
              <Button onClick={() => setPicking(true)}>
                <Plus size={14} /> Add integration
              </Button>
            </div>
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
              Connecting apps needs a Composio API key on the backend.
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

      {!loading && !loadError && integrations.length === 0 && configured && backendConfigured && (
        <Card className="p-2">
          <EmptyState
            icon="integrations"
            title="No apps connected yet"
            description="Connect your calendar, store or CRM and Populr can use it inside an automation — booking the call, looking up the order, logging the lead."
            action={
              canManage ? (
                <Button onClick={() => setPicking(true)}>
                  <Plus size={14} /> Add integration
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      {!loading && !loadError && integrations.length > 0 && (
        <div className="space-y-3">
          {integrations.map(integration => {
            const busy = busySlug === integration.slug;
            const pill = statusPillProps(integration.status);
            const needsReconnect = integration.status === 'reconnect_required';
            return (
              <Card key={integration.slug} className="p-4">
                <div className="flex items-center gap-3">
                  <IntegrationMark integration={integration} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-foreground">
                        {integration.name}
                      </span>
                      <StatusPill status={pill.status} label={pill.label} />
                    </div>
                    {integration.blurb && (
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                        {integration.blurb}
                      </p>
                    )}
                    {needsReconnect && (
                      <p className="mt-1 text-[12px] leading-relaxed text-destructive">
                        The connection lapsed — reconnect to keep the automations using it working.
                      </p>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {busy ? (
                        <Button variant="secondary" disabled>
                          <Loader2 size={14} className="animate-spin" /> Working…
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant={needsReconnect ? 'default' : 'ghost'}
                            onClick={() => void reconnect(integration)}
                          >
                            {needsReconnect ? (
                              <>
                                <RefreshCw size={14} /> Reconnect
                              </>
                            ) : (
                              'Reconnect'
                            )}
                          </Button>
                          {/* Only where there is something to disconnect.
                              An already-disconnected row keeps Reconnect as
                              its way back, but offering Disconnect on it
                              asks a destructive question about a grant that
                              is already gone — and the revoke behind it
                              would fail at the provider, surfacing an error
                              for an action that had nothing to do. */}
                          {integration.status !== 'disconnected' && (
                            <Button variant="outline" onClick={() => setConfirmOff(integration)}>
                              Disconnect
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AddIntegrationModal
        open={picking}
        onClose={() => setPicking(false)}
        onError={message => showToast(message, 'error')}
      />

      <ConfirmDialog
        open={confirmOff !== null}
        onOpenChange={open => {
          if (!open) setConfirmOff(null);
        }}
        title={`Disconnect ${confirmOff?.name ?? 'this app'}?`}
        description={`Populr will stop using ${confirmOff?.name ?? 'it'}. Any automation step that relies on it will stop working until you connect it again.`}
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
