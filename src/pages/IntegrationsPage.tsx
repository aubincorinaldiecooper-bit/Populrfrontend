import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Card } from '@/components/ui/card';
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
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted sm:h-10 sm:w-10 sm:rounded-xl">
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

function IntegrationRow({
  integration,
  canManage,
  busy,
  onReconnect,
  onDisconnect,
}: {
  integration: Integration;
  canManage: boolean;
  busy: boolean;
  onReconnect: (integration: Integration) => void;
  onDisconnect: (integration: Integration) => void;
}) {
  const pill = statusPillProps(integration.status);
  const needsReconnect = integration.status === 'reconnect_required';
  const connectedDate = integration.connectedAt ? new Date(integration.connectedAt) : null;
  const connectedAtLabel =
    connectedDate && Number.isFinite(connectedDate.getTime())
      ? connectedDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      : '—';
  const connectedColumn =
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
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'h-8 w-8 sm:h-9 sm:w-9')}
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
    <tr className={cn('transition-colors hover:bg-muted/40', needsReconnect && 'bg-destructive/5')}>
      <td className="w-[40%] px-2 py-3 sm:w-[40%] sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <IntegrationMark integration={integration} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-foreground sm:text-[14px]">
              {integration.name}
            </p>
            {integration.blurb && (
              <p className="truncate text-[11px] text-muted-foreground sm:text-[12px]">
                {integration.blurb}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="w-[28%] px-1 py-3 sm:w-[24%] sm:px-4">
        <StatusPill
          status={pill.status}
          label={pill.label}
          className="max-w-full whitespace-normal px-1.5 text-[10px] sm:whitespace-nowrap sm:px-2 sm:text-xs"
        />
      </td>
      <td className="hidden px-4 py-3 text-[12px] text-muted-foreground sm:table-cell sm:w-[20%]">
        {connectedColumn}
      </td>
      <td className="w-[32%] px-2 py-3 text-right sm:w-[16%] sm:px-4">
        {canManage && (
          <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end sm:gap-1.5">
            {busy ? (
              <Button
                variant="secondary"
                size="sm"
                className="h-8 whitespace-nowrap px-1.5 text-[11px] sm:h-9 sm:px-3 sm:text-[13px]"
                disabled
              >
                <Loader2 size={13} className="animate-spin" /> Working…
              </Button>
            ) : integration.status === 'connected' ? (
              moreActions(true)
            ) : integration.status === 'reconnect_required' ? (
              <>
                <Button
                  size="sm"
                  className="h-8 whitespace-nowrap px-1.5 text-[11px] sm:h-9 sm:px-3 sm:text-[13px]"
                  onClick={() => onReconnect(integration)}
                >
                  <RefreshCw size={13} /> Reconnect
                </Button>
                {moreActions(false)}
              </>
            ) : integration.status === 'pending' ? (
              <Button
                size="sm"
                className="h-8 whitespace-nowrap px-1.5 text-[10px] sm:h-9 sm:px-3 sm:text-[13px]"
                onClick={() => onReconnect(integration)}
              >
                Finish connecting
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-8 whitespace-nowrap px-1.5 text-[11px] sm:h-9 sm:px-3 sm:text-[13px]"
                onClick={() => onReconnect(integration)}
              >
                <RefreshCw size={13} /> Reconnect
              </Button>
            )}
          </div>
        )}
      </td>
    </tr>
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
                    {brokenIntegrations.length === 1 ? (
                      <>
                        <strong className="font-semibold">
                          {integration.name} stopped working
                        </strong>
                        {' · '}Reconnect it so your automations keep running.
                      </>
                    ) : (
                      <>
                        <strong className="font-semibold">
                          {brokenIntegrations.length} tools stopped working
                        </strong>
                        {' · '}Reconnect them so your automations keep running.
                      </>
                    )}
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

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th scope="col" className="w-[40%] px-2 py-3 text-[11px] font-medium text-muted-foreground sm:px-4">
                      Tool
                    </th>
                    <th scope="col" className="w-[28%] px-1 py-3 text-[11px] font-medium text-muted-foreground sm:w-[24%] sm:px-4">
                      Status
                    </th>
                    <th scope="col" className="hidden px-4 py-3 text-[11px] font-medium text-muted-foreground sm:table-cell sm:w-[20%]">
                      Connected
                    </th>
                    <th scope="col" className="w-[32%] px-2 py-3 text-right text-[11px] font-medium text-muted-foreground sm:w-[16%] sm:px-4">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {integrations.map(integration => (
                    <IntegrationRow
                      key={integration.slug}
                      integration={integration}
                      canManage={canManage}
                      busy={busySlug === integration.slug}
                      onReconnect={target => void reconnect(target)}
                      onDisconnect={target => setConfirmOff(target)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
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
