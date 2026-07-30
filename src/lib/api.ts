// ============================================================
// Populr — Backend API client
// Talks to the populrbackend service (Express + Zernio) that handles the
// real Instagram/TikTok/YouTube/X OAuth connect flow and stores synced
// accounts. Base URL is baked in at build time via VITE_API_URL.
// ============================================================

export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/** True once VITE_API_URL is set — gates real API calls vs. local demo behavior. */
export function isBackendConfigured(): boolean {
  return API_BASE_URL !== '';
}

export type AccountStatus = 'connected' | 'disconnected' | 'reconnect_required';

export interface ConnectedAccount {
  id: string;
  platform: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_connected: boolean;
  status: AccountStatus;
  connected_at: string | null;
}

async function apiFetch<T>(
  path: string,
  init?: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown },
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    // Surface the backend's own error/message when it sends one (e.g.
    // { error: "disallowed_return_url", message: "..." }), not just the
    // HTTP status — that's the difference between "connect is broken" and
    // "ALLOWED_FRONTEND_ORIGINS isn't set" being visible without devtools.
    const reason = await res
      .json()
      .then((body: { error?: string; message?: string }) => body.message || body.error)
      .catch(() => undefined);
    throw new Error(reason || `Populr API ${path} failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * GET /api/connect/:platform?to=<returnUrl> — returns the Zernio hosted-OAuth
 * URL to redirect the browser to. `to` is where the backend sends the user
 * back once the account is imported (see /api/connect/callback).
 */
export async function getPlatformConnectUrl(platform: string, to: string): Promise<string> {
  const data = await apiFetch<{ url: string }>(
    `/api/connect/${platform}?to=${encodeURIComponent(to)}`,
  );
  return data.url;
}

/** GET /api/accounts — creator accounts synced from Zernio and stored locally. */
export async function fetchConnectedAccounts(): Promise<ConnectedAccount[]> {
  const data = await apiFetch<{ accounts: ConnectedAccount[] }>('/api/accounts');
  return data.accounts;
}

/**
 * POST /api/accounts/sync — the backend's authoritative account sync: pulls
 * the current account list from Zernio and upserts it. The OAuth callback
 * already attempts this server-side, but Zernio can be eventually
 * consistent, so the frontend calls this explicitly on return from the
 * connect flow rather than trusting a single server-side attempt.
 */
export async function syncConnectedAccounts(): Promise<{
  synced: number;
  skipped: number;
  accounts: ConnectedAccount[];
}> {
  return apiFetch('/api/accounts/sync', { method: 'POST' });
}

/**
 * POST /api/accounts/:id/disconnect — revokes the account through Zernio and
 * marks it disconnected once that's confirmed. Never simulated locally: on
 * failure the caller sees the backend's real error and the account stays
 * connected, matching what actually happened.
 */
export async function disconnectAccount(id: string): Promise<ConnectedAccount> {
  const data = await apiFetch<{ account: ConnectedAccount }>(`/api/accounts/${id}/disconnect`, {
    method: 'POST',
  });
  return data.account;
}

// ============================================================
// Opportunities — the prioritized engagement feed
// ============================================================

export type OpportunityPlatform = 'instagram' | 'tiktok' | 'linkedin' | string;
export type OpportunityStatus = 'new' | 'reviewed' | 'responded' | 'dismissed';
export type OpportunityAction =
  | 'reply'
  | 'message'
  | 'open_on_platform'
  | 'copy_response'
  | 'mark_reviewed'
  | 'mark_responded'
  | 'dismiss';

export interface Opportunity {
  id: string;
  platform: OpportunityPlatform;
  person: {
    id: string | null;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  interaction: {
    type: 'comment' | 'message' | 'reply' | 'mention' | 'other';
    text: string;
    occurredAt: string;
    externalUrl: string | null;
  };
  source: {
    id: string | null;
    title: string | null;
    caption: string | null;
    mediaUrl: string | null;
    externalUrl: string | null;
  } | null;
  intent: {
    category: string;
    label: string;
    reason: string;
    confidence: number | null;
  };
  status: OpportunityStatus;
  availableActions: OpportunityAction[];
  suggestedResponse: string | null;
}

export interface OpportunitySummary {
  total: number;
  new: number;
  reviewed: number;
  responded: number;
  dismissed: number;
  byPlatform: Record<string, number>;
  byIntent: Record<string, number>;
}

/** GET /api/opportunities — prioritized, normalized engagement feed. */
export async function fetchOpportunities(params: {
  platform?: string;
  intent?: string;
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ opportunities: Opportunity[]; total: number; summary: OpportunitySummary }> {
  const qs = new URLSearchParams();
  if (params.platform) qs.set('platform', params.platform);
  if (params.intent) qs.set('intent', params.intent);
  if (params.status) qs.set('status', params.status);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.offset !== undefined) qs.set('offset', String(params.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/api/opportunities${suffix}`);
}

/** GET /api/opportunities/:id — single opportunity detail. */
export async function fetchOpportunity(id: string): Promise<Opportunity> {
  const data = await apiFetch<{ opportunity: Opportunity }>(`/api/opportunities/${id}`);
  return data.opportunity;
}

/** PATCH /api/opportunities/:id — resolution status only (reviewed/responded/dismissed). */
export async function updateOpportunityStatus(
  id: string,
  status: 'reviewed' | 'responded' | 'dismissed',
): Promise<Opportunity> {
  const data = await apiFetch<{ opportunity: Opportunity }>(`/api/opportunities/${id}`, {
    method: 'PATCH',
    body: { status },
  });
  return data.opportunity;
}

/**
 * POST /api/inbox/:id/reply — send a reply/message for an opportunity.
 * The opportunity id *is* the inbox_item id, so this reuses the existing,
 * capability-gated inbox reply endpoint directly rather than adding a
 * parallel one. Marks the opportunity responded on the backend.
 */
export async function sendOpportunityReply(
  id: string,
  text: string,
): Promise<{ sentText: string; channel: string }> {
  return apiFetch(`/api/inbox/${id}/reply`, { method: 'POST', body: { text } });
}

// ============================================================
// Platform capabilities — the backend's capability matrix, used to show
// honest "limited access" messaging per platform instead of assuming parity.
// ============================================================

export interface PlatformCapabilities {
  platform: string;
  supportsComments: boolean;
  supportsCommentReplies: boolean;
  supportsDMs: boolean;
  readiness: string;
  caveat: string;
}

/** GET /api/capabilities — what each connected platform actually supports. */
export async function fetchCapabilities(): Promise<PlatformCapabilities[]> {
  const data = await apiFetch<{ platforms: PlatformCapabilities[] }>('/api/capabilities');
  return data.platforms;
}
