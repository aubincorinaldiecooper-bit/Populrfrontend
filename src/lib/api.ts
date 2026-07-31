// ============================================================
// Populr — Backend API client
// Talks to the populrbackend service (Express + Zernio) that handles the
// real Instagram/TikTok/YouTube/X OAuth connect flow and stores synced
// accounts. Base URL is baked in at build time via VITE_API_URL.
// ============================================================

import { getApiAuthToken } from './authClient';

export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/** True once VITE_API_URL is set — gates real API calls vs. local demo behavior. */
export function isBackendConfigured(): boolean {
  return API_BASE_URL !== '';
}

/**
 * URL of the hosted subscription checkout page (Stripe Payment Link or
 * equivalent), used by the $12/month subscription modal. Required env var —
 * there is no fallback URL, since a hard-coded one would either point
 * nowhere or silently charge through the wrong account.
 */
export function getSubscriptionCheckoutUrl(): string | undefined {
  const url = import.meta.env.VITE_SUBSCRIPTION_CHECKOUT_URL as string | undefined;
  return url && url.trim() !== '' ? url.trim() : undefined;
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

/**
 * Preserves the HTTP status and the backend's own structured error code
 * (e.g. "subscription_required"), not just a flattened message — callers
 * that only need `.message` (most existing code) are unaffected since this
 * still extends Error.
 */
export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(
  path: string,
  init?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown },
): Promise<T> {
  // populrbackend verifies the caller via this JWT (see
  // populrbackend/src/middleware/requireAuth.ts) rather than a shared
  // cookie — the auth service and this API are different origins. Attached
  // on every call; routes that don't require auth simply ignore it, and
  // routes that do get a real per-user identity instead of the old shared
  // default workspace.
  const token = await getApiAuthToken();
  const headers: Record<string, string> = {};
  if (init?.body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    // Surface the backend's own error/message when it sends one (e.g.
    // { error: "disallowed_return_url", message: "..." }), not just the
    // HTTP status — that's the difference between "connect is broken" and
    // "ALLOWED_FRONTEND_ORIGINS isn't set" being visible without devtools.
    const parsed = await res
      .json()
      .then((body: { error?: string; message?: string }) => body)
      .catch(() => undefined);
    throw new ApiError(
      parsed?.message || parsed?.error || `Populr API ${path} failed with ${res.status}`,
      res.status,
      parsed?.error,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Same error/status handling as apiFetch, but for a multipart file upload (no JSON body). */
async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const token = await getApiAuthToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    // No Content-Type here — the browser sets the multipart boundary itself.
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const parsed = await res
      .json()
      .then((body: { error?: string; message?: string }) => body)
      .catch(() => undefined);
    throw new ApiError(
      parsed?.message || parsed?.error || `Populr API ${path} failed with ${res.status}`,
      res.status,
      parsed?.error,
    );
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

export type PostMediaType = 'image' | 'video' | 'carousel' | 'text';

export interface PlatformCapabilities {
  platform: string;
  supportsComments: boolean;
  supportsCommentReplies: boolean;
  supportsDMs: boolean;
  readiness: string;
  caveat: string;
  // Create Post fields, merged into this same endpoint's response rather
  // than a separate /platform-capabilities call.
  supportedMediaTypes: PostMediaType[];
  maxCaptionLength: number;
  mediaRequired: boolean;
  maxCarouselItems: number | null;
  maxImageSizeMb: number;
  maxVideoSizeMb: number;
  maxVideoDurationSeconds: number;
}

/** GET /api/capabilities — what each connected platform actually supports, including Create Post media limits. */
export async function fetchCapabilities(): Promise<PlatformCapabilities[]> {
  const data = await apiFetch<{ platforms: PlatformCapabilities[] }>('/api/capabilities');
  return data.platforms;
}

// ============================================================
// Create Post — draft-aware publishing (POST /api/publish/drafts, ...)
// ============================================================

/**
 * POST /api/media/upload — real file upload (multipart), distinct from the
 * backend's Zernio-URL-registration endpoint. Returns a URL Populr can both
 * preview and later hand to Zernio at publish time.
 */
export async function uploadMedia(
  file: File,
  durationSeconds?: number,
): Promise<{ url: string; mediaType: 'image' | 'video'; width?: number; height?: number; fileSizeBytes: number; durationSeconds?: number }> {
  const form = new FormData();
  form.append('file', file);
  if (durationSeconds !== undefined) form.append('durationSeconds', String(durationSeconds));
  return apiUpload('/api/media/upload', form);
}

export interface PostMediaItem {
  url: string;
  mediaType: 'image' | 'video';
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  fileSizeBytes?: number | null;
}

export type PostStatus =
  | 'draft' | 'validating' | 'ready' | 'scheduled' | 'publishing'
  | 'partially_published' | 'published' | 'failed' | 'cancelled' | string;

export type DestinationStatus =
  | 'pending' | 'uploading' | 'publishing' | 'scheduled' | 'published' | 'failed' | 'cancelled' | string;

export interface PostRecord {
  id: string;
  profile_id: string | null;
  content: string;
  media_type: PostMediaType | null;
  status: PostStatus;
  publish_now: boolean;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostMediaRecord {
  id: string;
  storage_url: string;
  media_type: 'image' | 'video';
  sort_order: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
}

export interface PostDestination {
  id: string;
  platform: string;
  account_id: string;
  status: DestinationStatus;
  external_post_id: string | null;
  url: string | null;
  error: string | null;
  published_at: string | null;
}

export interface PostWithDetails {
  post: PostRecord;
  media: PostMediaRecord[];
  targets: PostDestination[];
}

export interface DraftInput {
  mediaType: PostMediaType;
  caption: string;
  mediaItems: PostMediaItem[];
  accountIds: string[];
}

/** POST /api/publish/drafts — create a draft, reserving its destinations. */
export async function createDraftPost(input: DraftInput): Promise<PostWithDetails> {
  return apiFetch('/api/publish/drafts', { method: 'POST', body: input });
}

/** PATCH /api/publish/drafts/:id — replace a draft's caption/media/destinations. */
export async function updateDraftPost(id: string, input: DraftInput): Promise<PostWithDetails> {
  return apiFetch(`/api/publish/drafts/${id}`, { method: 'PATCH', body: input });
}

/** DELETE /api/publish/drafts/:id — delete a draft. */
export async function deleteDraftPost(id: string): Promise<void> {
  await apiFetch(`/api/publish/drafts/${id}`, { method: 'DELETE' });
}

/** POST /api/publish/drafts/:id/validate — pre-flight checks; flips draft -> ready when clean. */
export async function validateDraftPost(id: string): Promise<PostWithDetails & { issues: { platform: string; message: string }[] }> {
  return apiFetch(`/api/publish/drafts/${id}/validate`, { method: 'POST' });
}

/** POST /api/publish/drafts/:id/publish — publish now or schedule. */
export async function publishDraftPost(
  id: string,
  input: { publishNow?: boolean; scheduledAt?: string },
): Promise<PostWithDetails> {
  return apiFetch(`/api/publish/drafts/${id}/publish`, { method: 'POST', body: input });
}

/** POST /api/publish/:id/retry — re-attempt only the destinations currently marked failed. */
export async function retryPostDestinations(id: string): Promise<PostWithDetails> {
  return apiFetch(`/api/publish/${id}/retry`, { method: 'POST' });
}

/**
 * POST /api/publish/:id/cancel — cancel a scheduled post in Populr's own
 * records. The backend cannot guarantee this stops Zernio's own scheduled
 * execution (no cancel endpoint exists on the Zernio integration).
 */
export async function cancelScheduledPost(id: string): Promise<PostWithDetails> {
  return apiFetch(`/api/publish/${id}/cancel`, { method: 'POST' });
}

export type ContentTab = 'all' | 'draft' | 'scheduled' | 'published' | 'failed';

/** GET /api/publish?tab=... — posts for the Content page / Home's recent posts. */
export async function fetchPosts(tab: ContentTab = 'all', limit?: number): Promise<PostWithDetails[]> {
  const qs = new URLSearchParams({ tab });
  if (limit !== undefined) qs.set('limit', String(limit));
  const data = await apiFetch<{ count: number; posts: PostWithDetails[] }>(`/api/publish?${qs.toString()}`);
  return data.posts;
}

/** GET /api/publish/:id — a single post with its media items and per-platform destinations. */
export async function fetchPost(id: string): Promise<PostWithDetails> {
  return apiFetch(`/api/publish/${id}`);
}
