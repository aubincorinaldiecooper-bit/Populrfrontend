import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Card, cardVariants } from '@/components/ui/card';
import { Page } from '@/components/ui/page';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  AlertTriangle,
  Loader2,
  MoreHorizontal,
  Plug,
  Plus,
  RefreshCw,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/app/ConfirmDialog';
import AddIntegrationModal from '../components/AddIntegrationModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { useApp } from '../context/AppContext';
import { isOwnerView } from '../lib/access';
import { queryKeys } from '../lib/queryKeys';
import { automationsUsingToolkit } from '../lib/flowSummary';
import {
  isBackendConfigured,
  fetchFlows,
  fetchIntegrationTools,
  fetchIntegrations,
  getIntegrationConnectUrl,
  disconnectIntegration,
  syncIntegrations,
} from '../lib/api';
import type { AutomationFlow, Integration, IntegrationStatus } from '../lib/api';

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

function IntegrationCard({
  integration,
  canManage,
  busy,
  flows,
  flowsReady,
  onReconnect,
  onDisconnect,
}: {
  integration: Integration;
  canManage: boolean;
  busy: boolean;
  flows: AutomationFlow[];
  flowsReady: boolean;
  onReconnect: (integration: Integration) => void;
  onDisconnect: (integration: Integration) => void;
}) {
  const pill = statusPillProps(integration.status);
  const needsReconnect = integration.status === 'reconnect_required';
  const toolsQuery = useQuery({
    queryKey: ['integrationTools', integration.slug],
    queryFn: () => fetchIntegrationTools(integration.slug),
    enabled: integration.status === 'connected',
    staleTime: 5 * 60 * 1000,
  });
  const usedIn = flowsReady ? automationsUsingToolkit(flows, integration.slug) : [];
  const connectedDate = integration.connectedAt ? new Date(integration.connectedAt) : null;
  const connectedAtLabel =
    connectedDate && Number.isFinite(connectedDate.getTime())
      ? `Connected ${connectedDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
      : 'Connected';
  const statusLine =
    integration.status === 'connected'
      ? connectedAtLabel
      : integration.status === 'reconnect_required'
        ? 'Stopped working'
        : integration.status === 'pending'
          ? 'Waiting for you to finish signing in'
          : 'Disconnected';

  const moreActions = (includeReconnect: boolean) => (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`More actions for ${integration.name}`}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'h-9 w-9')}
          >
            <MoreHorizontal size={17} />
          </button>
        }
      />
      <DropdownMenuContent align="end">
        {includeReconnect && (
          <DropdownMenuItem onClick={() => onReconnect(integration)}>
            <RefreshCw size={14} /> Reconnect
          </DropdownMenuItem>
        )}
        {includeReconnect && <DropdownMenuSeparator />}
        <DropdownMenuItem destructive onClick={() => onDisconnect(integration)}>
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <Card
      className={cn(
        'flex flex-col rounded-2xl p-4',
        needsReconnect && 'ring-2 ring-destructive/30',
      )}
    >
      <div className="flex items-start gap-3">
        <IntegrationMark integration={integration} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-foreground">{integration.name}</span>
            <StatusPill status={pill.status} label={pill.label} />
          </div>
          {integration.blurb && (
            <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
              {integration.blurb}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1.5">
            {busy ? (
              <Button variant="secondary" disabled>
                <Loader2 size={14} className="animate-spin" /> Working…
              </Button>
            ) : integration.status === 'connected' ? (
              moreActions(true)
            ) : integration.status === 'reconnect_required' ? (
              <>
                <Button onClick={() => onReconnect(integration)}>
                  <RefreshCw size={14} /> Reconnect
                </Button>
                {moreActions(false)}
              </>
            ) : integration.status === 'pending' ? (
              <Button onClick={() => onReconnect(integration)}>Finish connecting</Button>
            ) : (
              <Button onClick={() => onReconnect(integration)}>Reconnect</Button>
            )}
          </div>
        )}
      </div>

      {integration.status === 'connected' && toolsQuery.isSuccess && toolsQuery.data.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">What Populr can do</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {toolsQuery.data.slice(0, 3).map(tool => (
              <span
                key={tool.slug}
                className="rounded-md bg-chartreuse/20 px-2 py-1 text-[10.5px] font-medium text-foreground"
              >
                {tool.name}
              </span>
            ))}
            {toolsQuery.data.length > 3 && (
              <span className="text-[10.5px] text-muted-foreground">
                +{toolsQuery.data.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}

      {flowsReady && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {usedIn.length > 0 ? (
              <>
                <span className="mr-0.5 text-[11px] text-muted-foreground">Used in</span>
                {usedIn.slice(0, 3).map(flow => (
                  <Link
                    key={flow.id}
                    to={`/automations/${flow.id}`}
                    className="max-w-[140px] truncate rounded-md bg-muted px-2 py-1 text-[10.5px]
                      font-medium text-foreground hover:bg-muted/70"
                  >
                    {flow.name}
                  </Link>
                ))}
                {usedIn.length > 3 && (
                  <span className="text-[10.5px] text-muted-foreground">+{usedIn.length - 3}</span>
                )}
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                Not used in an automation yet
              </span>
            )}
          </div>
          <span className="shrink-0 text-right text-[10.5px] text-muted-foreground">
            {statusLine}
          </span>
        </div>
      )}
    </Card>
  );
}

export default function IntegrationsPage() {
  const { showToast, workspaceAccess } = useApp();
  const ownerView = isOwnerView(workspaceAccess);
  const [searchParams] = useSearchParams();
  const backendConfigured = isBackendConfigured();
  const flowsQuery = useQuery({
    queryKey: queryKeys.flows,
    queryFn: fetchFlows,
    enabled: backendConfigured,
    staleTime: 60_000,
  });

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
        setLoadError(err instanceof Error ? err.message : 'Couldn’t load your tools.');
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
            : 'Tools refreshed.',
          data.revoked > 0 ? 'info' : 'success',
        );
      })
      .catch((err: unknown) => {
        console.error('[integrations] sync failed:', err);
        showToast(err instanceof Error ? err.message : 'Couldn’t refresh tools.', 'error');
      })
      .then(() => {
        setSyncing(false);
      });
  };

  const canManage = ownerView && configured && backendConfigured;
  const connectedCount = integrations.filter(
    integration => integration.status === 'connected',
  ).length;
  const needsAttentionCount = integrations.filter(
    integration => integration.status === 'reconnect_required',
  ).length;
  const pendingCount = integrations.filter(
    integration => integration.status === 'pending',
  ).length;
  const summaryParts = [
    `${integrations.length} ${integrations.length === 1 ? 'tool' : 'tools'}`,
    ...(connectedCount ? [`${connectedCount} connected`] : []),
    ...(needsAttentionCount
      ? [`${needsAttentionCount} ${needsAttentionCount === 1 ? 'needs' : 'need'} attention`]
      : []),
    ...(pendingCount ? [`${pendingCount} finishing up`] : []),
  ];
  const brokenIntegrations = integrations.filter(
    integration => integration.status === 'reconnect_required',
  );

  return (
    <Page className="max-w-[1040px]">
      <PageHeader
        title="Tools"
        subtitle="Apps your automations can use, like booking a call, looking up an order or saving a lead."
        action={
          canManage ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => void runSync()} disabled={syncing}>
                <RefreshCw size={14} className={syncing ? 'animate-spin' : undefined} />
                {syncing ? 'Refreshing…' : 'Refresh'}
              </Button>
              <Button onClick={() => setPicking(true)}>
                <Plus size={14} /> Add a tool
              </Button>
            </div>
          ) : undefined
        }
      />

      {!loading && !loadError && configured && backendConfigured && (
        <p className="mb-5 text-[12px] text-muted-foreground">
          {summaryParts.join(' · ')}
        </p>
      )}

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
              Tools aren&apos;t switched on yet
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
            <p className="text-sm font-semibold text-foreground">Couldn&apos;t load your tools</p>
            <p className="mt-1 text-[13px] text-muted-foreground">{loadError}</p>
            <Button variant="outline" className="mt-3" onClick={() => void load()}>
              <RefreshCw size={14} /> Try again
            </Button>
          </div>
        </Card>
      )}

      {loading && <p className="text-[13px] text-muted-foreground">Loading tools…</p>}

      {!loading && !loadError && integrations.length === 0 && configured && backendConfigured && (
        <Card className="p-2">
          <EmptyState
            icon="integrations"
            title="No tools connected yet"
            description="Connect your calendar, store or CRM and Populr can use it inside an automation — booking the call, looking up the order, logging the lead."
            action={
              canManage ? (
                <Button onClick={() => setPicking(true)}>
                  <Plus size={14} /> Add a tool
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      {!loading && !loadError && integrations.length > 0 && (
        <>
          <div className="mb-4 space-y-2">
            {brokenIntegrations.map(integration => {
              const used = flowsQuery.isSuccess
                ? automationsUsingToolkit(flowsQuery.data, integration.slug).map(flow => flow.name)
                : [];
              const busy = busySlug === integration.slug;
              return (
                <div
                  key={`reconnect-${integration.slug}`}
                  className="flex items-center gap-3 rounded-xl bg-foreground p-3 text-background"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/20 text-destructive">
                    <AlertTriangle size={17} />
                  </span>
                  <p className="min-w-0 flex-1 text-[12px] leading-relaxed">
                    <strong className="font-semibold">{integration.name} stopped working</strong>
                    {' · '}
                    {used.length > 0
                      ? `${used.join(', ')} can't use it until you reconnect it`
                      : 'automations that use it will fail until you reconnect it'}
                  </p>
                  {canManage && (
                    <Button
                      className="shrink-0"
                      onClick={() => void reconnect(integration)}
                      disabled={busy}
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Reconnect
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {integrations.map(integration => (
              <IntegrationCard
                key={integration.slug}
                integration={integration}
                canManage={canManage}
                busy={busySlug === integration.slug}
                flows={flowsQuery.data ?? []}
                flowsReady={flowsQuery.isSuccess}
                onReconnect={target => void reconnect(target)}
                onDisconnect={target => setConfirmOff(target)}
              />
            ))}
            {canManage && (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className={cn(
                  cardVariants({ interactive: true }),
                  'flex min-h-[164px] flex-col items-start justify-center gap-4 border-dashed p-5 text-left',
                )}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Plus size={18} />
                </span>
                <span>
                  <span className="block text-[14px] font-semibold text-foreground">Add a tool</span>
                  <span className="mt-1 block text-[12px] text-muted-foreground">
                    1,000+ apps: calendars, stores, CRMs…
                  </span>
                </span>
              </button>
            )}
          </div>
        </>
      )}

      {!loading && !loadError && configured && backendConfigured && (
        <p className="mt-6 text-[12px] text-muted-foreground">
          Looking for Instagram or TikTok? Those are your{' '}
          <Link to="/channels" className="font-medium text-foreground underline underline-offset-2">
            Channels
          </Link>
          , the accounts Populr replies from.
        </p>
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
