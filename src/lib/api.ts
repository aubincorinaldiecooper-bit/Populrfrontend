// ============================================================
// Populr — Backend API client
// Talks to the populrbackend service (Express + Zernio) that handles the
// real Instagram/TikTok/YouTube/X OAuth connect flow and stores synced
// accounts. Base URL is baked in at build time via VITE_API_URL.
// ============================================================

import { getApiAuthToken, clearApiAuthToken } from './authClient';
import type { FlowGraph } from './flowSchema';

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
  /** The platform's own id for this account (an Instagram business id, say).
   *  Unlike the handle it is unique per account and stable across reauth, so
   *  it is the only field that distinguishes two accounts a provider reports
   *  under the same username — see the duplicate-handle notice on Channels. */
  external_id?: string | null;
}

/**
 * Preserves the HTTP status and the backend's own structured error code
 * (e.g. "subscription_required"), not just a flattened message — callers
 * that only need `.message` (most existing code) are unaffected since this
 * still extends Error. `details` carries a route's own safe, user-facing
 * explanation list when it sends one (e.g. automations' capability-matrix
 * rejection reasons) — never raw provider errors.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: string[],
    /**
     * Per-step problems from the flow builder's activation check. Kept
     * structured rather than flattened into `details` because the canvas needs
     * to point at the step each problem belongs to — a list of sentences can't
     * do that.
     */
    public readonly problems?: { nodeId: string | null; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Notified when the backend rejects a call with 401, i.e. the session this
 * client believes it has is no longer valid server-side.
 *
 * A module-level hook rather than an import of AuthContext: this file is
 * imported *by* the context, so calling into it directly would be circular.
 * AuthProvider registers itself on mount (see onUnauthorized).
 */
let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function notifyUnauthorized(): void {
  unauthorizedHandler?.();
}

async function apiFetch<T>(
  path: string,
  init?: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    /**
     * Let the request outlive the document that started it.
     *
     * An ordinary fetch is bound to its document: reload the page or close the
     * tab while one is open and the browser is free to cancel it. For a request
     * whose whole point is that it has already been sent — a delete the
     * interface has already acted on — that cancellation is indistinguishable
     * from never having asked. `keepalive` is the browser's contract that the
     * request goes out regardless.
     */
    keepalive?: boolean;
  },
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
    ...(init?.keepalive ? { keepalive: true } : {}),
  });
  if (!res.ok) {
    // An expired session used to surface as an ordinary inline error on
    // whichever page happened to fetch — "Could not load contacts." — while
    // the app kept rendering the signed-out user's name, avatar and shell
    // indefinitely. Nothing anywhere inspected the status. Notifying here
    // lets AuthContext end the session once, from one place, so the route
    // gate can do its job.
    if (res.status === 401) {
      // Drop the cached backend JWT first. getApiAuthToken hands back the
      // cached token until ~30s before its own expiry, so a token the backend
      // rejects while still "unexpired" by the clock (secret rotation, clock
      // skew) would otherwise be reused on every subsequent call — the app
      // stuck erroring under an authenticated shell with no auto-recovery.
      // Clearing it forces the next call to re-exchange the session cookie for
      // a fresh token; notifyUnauthorized then re-checks the session and only
      // signs out if it's genuinely gone.
      clearApiAuthToken();
      notifyUnauthorized();
    }

    // Surface the backend's own error/message when it sends one (e.g.
    // { error: "disallowed_return_url", message: "..." }), not just the
    // HTTP status — that's the difference between "connect is broken" and
    // a misconfigured allowlist being visible without devtools.
    const parsed = await res
      .json()
      .then((body: {
        error?: string;
        message?: string;
        details?: string[];
        problems?: { nodeId: string | null; message: string }[];
      }) => body)
      .catch(() => undefined);
    throw new ApiError(
      parsed?.message || parsed?.error || `Populr API ${path} failed with ${res.status}`,
      res.status,
      parsed?.error,
      Array.isArray(parsed?.details) ? parsed.details : undefined,
      Array.isArray(parsed?.problems) ? parsed.problems : undefined,
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
// Platform capabilities — the backend's capability matrix, used to show
// honest "limited access" messaging per platform instead of assuming parity.
// ============================================================

export type PostMediaType = 'image' | 'video' | 'carousel' | 'text';

export interface PlatformCapabilities {
  platform: string;
  supportsComments: boolean;
  supportsCommentReplies: boolean;
  /** Whether the platform lets an automation DM someone BECAUSE they
   *  commented — distinct from supportsDMs (X has DMs, but not this). */
  supportsCommentToDM: boolean;
  supportsDMs: boolean;
  supportsDMImages: boolean;
  supportsDMVideo: boolean;
  supportsButtons: boolean;
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

// ============================================================
// Automations — keyword-triggered engagement automation (the beta's core
// product surface). Talks to populrbackend's /api/automations, which is
// authenticated and scoped to the caller's own workspace: every one of
// these calls resolves the caller's own connected accounts and
// automations server-side, never a client-supplied profile/workspace id.
// ============================================================

export type AutomationMatchMode = 'exact' | 'contains' | 'starts_with';
export type AutomationReplyChannel = 'comment' | 'dm' | 'both';
export type AutomationAiMode = 'auto' | 'suggest';

/** The stored shape returned by the backend (snake_case — this is the raw
 *  connected_accounts row shape, not something this frontend controls). */
export interface AutomationRecord {
  id: string;
  name: string;
  funnel_id: string | null;
  account_id: string;
  platform: string;
  source_post_id: string | null;
  all_posts: boolean;
  trigger_type: string;
  keywords: string[];
  match_mode: AutomationMatchMode;
  reply_channel: AutomationReplyChannel;
  response_type: string;
  message_body: string | null;
  comment_reply_body: string | null;
  media_url: string | null;
  link_url: string | null;
  link_kind: string | null;
  /** Tappable DM buttons (Zernio sendDM buttons). The engine swaps a
   *  button's url for the per-contact tracked link when it matches the
   *  automation's link_url. */
  buttons: { label: string; url?: string }[] | null;
  tags: string[];
  score_delta: number;
  stage_update: string | null;
  active: boolean;
  ai_enabled: boolean;
  ai_mode: AutomationAiMode;
  ai_confidence_threshold: string | number;
  // Creator-authored per-automation guidance. Added by populrbackend PR #24 —
  // absent on older responses, hence nullable on both storage sides.
  ai_instructions: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationInput {
  name: string;
  accountId: string;
  platform: string;
  sourcePostId?: number | null;
  allPosts?: boolean;
  keywords: string[];
  matchMode?: AutomationMatchMode;
  replyChannel?: AutomationReplyChannel;
  commentReplyBody?: string | null;
  messageBody?: string | null;
  linkUrl?: string | null;
  linkKind?: string | null;
  /** Media attached to the DM (Zernio sendDM mediaUrl) — the engine sends it
   *  capability-gated per platform. responseType tells the backend which
   *  capability to validate ('image' | 'video' | 'text'). */
  mediaUrl?: string | null;
  responseType?: string;
  buttons?: { label: string; url?: string }[] | null;
  tags?: string[];
  scoreDelta?: number;
  stageUpdate?: string | null;
  active?: boolean;
  /** "Automatic" (false) sends the configured reply the instant a keyword
   *  matches. "Review-first" (true + aiMode: 'suggest') always drafts and
   *  queues the reply for a human to send instead — the one real backend
   *  concept for this, reusing Smart Replies' existing suggest mode rather
   *  than inventing a separate review gate the engine doesn't have. */
  aiEnabled?: boolean;
  aiMode?: AutomationAiMode;
  /** How the automation is triggered — mirrors automations.trigger_type in
   *  populrbackend/src/db/schema.sql. The wizard sends this explicitly per
   *  the "type of automation" the creator picked. */
  triggerType?: TriggerType;
  /** Creator-authored per-automation guidance (populrbackend PR #24). Send
   *  null to explicitly clear a previously-saved value; omit to leave it
   *  unchanged (the backend distinguishes the two via a "was provided"
   *  boolean, see src/routes/automations.ts:120). */
  aiInstructions?: string | null;
}

/** GET /api/automations — the caller's own automations. Filters: accountId, platform, active. */
export async function fetchAutomations(filter: {
  accountId?: string;
  platform?: string;
  active?: boolean;
} = {}): Promise<AutomationRecord[]> {
  const qs = new URLSearchParams();
  if (filter.accountId) qs.set('accountId', filter.accountId);
  if (filter.platform) qs.set('platform', filter.platform);
  if (filter.active !== undefined) qs.set('active', String(filter.active));
  const query = qs.toString();
  const data = await apiFetch<{ count: number; automations: AutomationRecord[] }>(
    `/api/automations${query ? `?${query}` : ''}`
  );
  return data.automations;
}

/** GET /api/automations/:id */
export async function fetchAutomation(id: string): Promise<AutomationRecord> {
  const data = await apiFetch<{ automation: AutomationRecord }>(`/api/automations/${id}`);
  return data.automation;
}

/** POST /api/automations — validated server-side against the real platform capability matrix. */
export async function createAutomation(input: AutomationInput): Promise<AutomationRecord> {
  const data = await apiFetch<{ automation: AutomationRecord }>('/api/automations', {
    method: 'POST',
    body: input,
  });
  return data.automation;
}

/** PATCH /api/automations/:id — partial update (e.g. { active: false } to pause). */
export async function updateAutomation(id: string, patch: Partial<AutomationInput>): Promise<AutomationRecord> {
  const data = await apiFetch<{ automation: AutomationRecord }>(`/api/automations/${id}`, {
    method: 'PATCH',
    body: patch,
  });
  return data.automation;
}

/** DELETE /api/automations/:id */
export async function deleteAutomation(id: string): Promise<void> {
  await apiFetch(`/api/automations/${id}`, { method: 'DELETE' });
}

export interface AutomationEvent {
  id: string;
  automation_id: string | null;
  contact_id: string | null;
  event_type: string;
  status: 'ok' | 'failed' | 'skipped';
  detail: string;
  error: string | null;
  contact_handle: string | null;
  contact_name: string | null;
  automation_name: string | null;
  created_at: string;
}

/** GET /api/automations/:id/events — the user-facing "what did this automation do" log. */
export async function fetchAutomationEvents(id: string, limit?: number): Promise<AutomationEvent[]> {
  const qs = limit !== undefined ? `?limit=${limit}` : '';
  const data = await apiFetch<{ count: number; events: AutomationEvent[] }>(`/api/automations/${id}/events${qs}`);
  return data.events;
}

export interface AutomationsSummary {
  totalCount: number;
  activeCount: number;
  interactionsHandled: number;
  repliesSent: number;
  failedAutomationsCount: number;
  bestPerforming: { id: string; name: string; repliesSent: number } | null;
}

/** GET /api/automations/summary — Home page metrics, real rollups over the caller's own automations. */
export async function fetchAutomationsSummary(): Promise<AutomationsSummary> {
  return apiFetch('/api/automations/summary');
}

// ============================================================
// Workspace settings — scoped server-side to the caller's own workspace.
//
// The pause switch here stops automation for THIS workspace only. Populr also
// has a platform-wide emergency stop for incident response, but that one is
// operator-only: it lives behind an admin surface, is never reported by this
// endpoint, and is deliberately not something a creator can see or change.
// ============================================================

export interface WorkspaceSettings {
  /** True when this workspace's own automations are paused by its owner. */
  workspacePause: boolean;
  /** Whether the deployment has Smart Replies (OpenRouter) configured. */
  smartRepliesConfigured: boolean;
}

/** GET /api/settings — the caller's own workspace settings. */
export async function fetchWorkspaceSettings(): Promise<WorkspaceSettings> {
  const data = await apiFetch<{
    workspacePause?: boolean;
    globalPause?: boolean;
    smartRepliesConfigured?: boolean;
  }>('/api/settings');
  return {
    // `globalPause` is the older wire name for the same value, kept by the
    // backend for compatibility; prefer the accurate one when present.
    workspacePause: data.workspacePause ?? data.globalPause ?? false,
    smartRepliesConfigured: data.smartRepliesConfigured ?? false,
  };
}

/** POST /api/settings/pause — pause or resume this workspace's automations. */
export async function setWorkspacePause(paused: boolean): Promise<boolean> {
  const data = await apiFetch<{ workspacePause?: boolean; globalPause?: boolean }>(
    '/api/settings/pause',
    { method: 'POST', body: { paused } }
  );
  return data.workspacePause ?? data.globalPause ?? paused;
}

// ============================================================
// Dashboard — the workspace rollup behind Home. One scoped call (see
// populrbackend dashboardService): pause state, totals, which posts are
// actually producing warm leads, and the recent automation activity feed.
// ============================================================

export interface DashboardData {
  /** True when this workspace's automations aren't running (its own pause
   *  switch or the platform stop). */
  globallyPaused: boolean;
  /** Which kind of pause: 'workspace' is the creator's own toggle (Settings
   *  can fix it), 'platform' is an operator-level stop they can't undo there,
   *  null when not paused. Lets the banner avoid pointing a platform-stopped
   *  creator at a Settings screen that shows "Running". */
  pauseScope?: 'workspace' | 'platform' | null;
  connectedAccounts: {
    id: string; platform: string; username: string | null;
    displayName: string | null; avatarUrl: string | null;
    readiness: string; caveat: string | null;
  }[];
  totals: {
    contacts: number;
    warmLeads: number;
    hotLeads: number;
    needsReply: number;
    activeAutomations: number;
  };
  /** How fans respond to what automations send — raw counts from platform
   *  receipts (messages sent → delivered → read), the engine's user_replied
   *  events, and tracked-link counters. The UI derives rates from these so
   *  denominators stay visible. Optional because a backend deployed before
   *  this block existed simply omits it — the UI must render without it. */
  engagement?: {
    dmsSent: number;
    dmsDelivered: number;
    dmsRead: number;
    mediaDmsSent: number;
    contactsDmd: number;
    contactsReplied: number;
    linkSends: number;
    linkClicks: number;
    uniqueLinkClicks: number;
  };
  topPostsByWarmLeads: {
    id: string; platform: string; caption: string | null; url: string | null;
    media_url: string | null; account_username: string | null;
    warm_leads: number; contacts: number;
  }[];
  topPlatformsByWarmLeads: { platform: string; warm_leads: number; contacts: number }[];
  topFunnelsByClicks: { id: string; name: string; template_key: string | null; clicks: number; unique_clicks: number }[];
  recentActivity: {
    id: string; event_type: string; status: string; detail: string | null;
    created_at: string; contact_handle: string | null; contact_name: string | null;
    automation_name: string | null; source_platform: string | null;
  }[];
}

/** GET /api/dashboard — everything Home needs in one scoped call. */
export async function fetchDashboard(): Promise<DashboardData> {
  return apiFetch('/api/dashboard');
}

// ============================================================
// Inbox — the conversations queue. Server-side this has existed all along
// (workspace-scoped since populrbackend PR #31): items land here when an
// automation replies, when the AI sends a holding reply for an uncovered
// question, or when something needs the creator personally. Rows carry the
// joined message/contact context plus the AI's suggested draft when one
// was parked for review.
// ============================================================

export interface InboxItem {
  id: string;
  contact_id: string | null;
  account_id: string | null;
  platform: string;
  channel: 'comment' | 'dm';
  status: string;
  needs_reply: boolean;
  needs_reply_reason: string | null;
  automation_status: string | null;
  suggested_reply: string | null;
  ai_intent: string | null;
  ai_confidence: string | number | null;
  created_at: string;
  updated_at: string;
  message_text: string | null;
  message_direction: string | null;
  contact_handle: string | null;
  contact_name: string | null;
  lead_score: number | null;
  stage: string | null;
  post_caption: string | null;
  automation_name: string | null;
}

/** GET /api/inbox — this workspace's conversations. */
export async function fetchInbox(filter: {
  needsReply?: boolean; limit?: number; offset?: number;
} = {}): Promise<{ count: number; items: InboxItem[] }> {
  const params = new URLSearchParams();
  if (filter.needsReply !== undefined) params.set('needsReply', String(filter.needsReply));
  if (filter.limit) params.set('limit', String(filter.limit));
  if (filter.offset) params.set('offset', String(filter.offset));
  const qs = params.toString();
  return apiFetch(`/api/inbox${qs ? `?${qs}` : ''}`);
}

/**
 * POST /api/inbox/:id/reply — send the creator's reply in-channel.
 * `useSuggested: true` sends the AI's parked draft as-is (one tap).
 */
export async function sendInboxReply(
  id: string,
  input: { text?: string; useSuggested?: boolean },
): Promise<{ sentText: string; channel: string }> {
  return apiFetch(`/api/inbox/${id}/reply`, { method: 'POST', body: input });
}

/** POST /api/inbox/:id/needs-reply — resolve (or re-flag) without replying. */
export async function setInboxNeedsReply(
  id: string,
  needsReply: boolean,
): Promise<{ id: string; needsReply: boolean }> {
  return apiFetch(`/api/inbox/${id}/needs-reply`, { method: 'POST', body: { needsReply } });
}

// ============================================================
// Contacts — everyone who has engaged with a connected account
// (who they are, how they found the creator, their tags/score/stage, and
// their full conversation history). Talks to populrbackend's /api/contacts,
// scoped server-side to the caller's own workspace exactly like automations.
// ============================================================

/** The real, backend-enforced lead stages (see config/leadscoring.ts) —
 *  distinct from the old prototype's invented discovered/engaged/interested
 *  pipeline, which the backend has never recognized. */
export const CONTACT_STAGES = ['cold', 'interested', 'warm', 'hot', 'needs_reply', 'converted'] as const;
export type ContactStage = (typeof CONTACT_STAGES)[number];

/** The stored shape returned by the backend (snake_case — the raw contacts row). */
export interface ContactRecord {
  id: string;
  platform: string;
  account_id: string | null;
  external_user_id: string;
  handle: string | null;
  name: string | null;
  avatar_url: string | null;
  lead_score: number;
  stage: string;
  needs_reply: boolean;
  notes: string | null;
  custom_fields: Record<string, unknown>;
  source_platform: string | null;
  source_account_id: string | null;
  source_post_id: string | null;
  source_post_url: string | null;
  source_automation_id: string | null;
  source_funnel_id: string | null;
  source_type: string | null;
  first_seen: string;
  last_seen: string;
  last_message_at: string | null;
  last_automation_at: string | null;
  tags: string[];
}

export interface ContactMessage {
  id: string;
  contact_id: string | null;
  account_id: string | null;
  platform: string;
  channel: string;
  direction: string;
  text: string | null;
  media_url: string | null;
  external_id: string | null;
  status: string;
  in_reply_to: string | null;
  source_post_id: string | null;
  source_automation_id: string | null;
  created_at: string;
}

export interface ContactScoreEvent {
  id: string;
  contact_id: string;
  delta: number;
  score_after: number;
  reason: string;
  source_type: string | null;
  source_automation_id: string | null;
  source_link_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface ContactLinkClick {
  id: string;
  link_id: string;
  contact_id: string | null;
  visitor_key: string | null;
  is_unique: boolean;
  user_agent: string | null;
  created_at: string;
  destination: string;
  link_kind: string | null;
  click_tag: string | null;
}

export interface ContactDetail {
  contact: ContactRecord;
  sourcePost: { id: string; caption: string | null; url: string | null; platform: string } | null;
  sourceAutomation: { id: string; name: string } | null;
  messages: ContactMessage[];
  scoreEvents: ContactScoreEvent[];
  clicks: ContactLinkClick[];
  events: AutomationEvent[];
}

/** GET /api/contacts — the caller's own contacts. Filters: stage, platform, tag, needsReply, search. */
export async function fetchContacts(filter: {
  stage?: string;
  platform?: string;
  tag?: string;
  needsReply?: boolean;
  search?: string;
  /** 'recent' orders by last activity; default orders by lead score. */
  sort?: 'score' | 'recent';
  limit?: number;
  offset?: number;
} = {}): Promise<{ contacts: ContactRecord[]; total: number; stages: string[]; allTags: string[] }> {
  const qs = new URLSearchParams();
  if (filter.stage) qs.set('stage', filter.stage);
  if (filter.platform) qs.set('platform', filter.platform);
  if (filter.tag) qs.set('tag', filter.tag);
  if (filter.needsReply !== undefined) qs.set('needsReply', String(filter.needsReply));
  if (filter.search) qs.set('search', filter.search);
  if (filter.sort) qs.set('sort', filter.sort);
  if (filter.limit !== undefined) qs.set('limit', String(filter.limit));
  if (filter.offset !== undefined) qs.set('offset', String(filter.offset));
  const query = qs.toString();
  return apiFetch(`/api/contacts${query ? `?${query}` : ''}`);
}

/** GET /api/contacts/:id — full timeline: messages, score history, link clicks, automation events. */
export async function fetchContact(id: string): Promise<ContactDetail> {
  return apiFetch(`/api/contacts/${id}`);
}

/** PATCH /api/contacts/:id — notes, stage, custom fields, needsReply. */
export async function updateContact(
  id: string,
  patch: { stage?: string; notes?: string; needsReply?: boolean; customFields?: Record<string, unknown> },
): Promise<ContactRecord> {
  const data = await apiFetch<{ contact: ContactRecord }>(`/api/contacts/${id}`, {
    method: 'PATCH',
    body: patch,
  });
  return data.contact;
}

/** POST /api/contacts/:id/tags — add (default) or remove a tag. Returns the contact's full tag list. */
export async function setContactTag(id: string, tag: string, remove = false): Promise<string[]> {
  const data = await apiFetch<{ contactId: string; tags: string[] }>(`/api/contacts/${id}/tags`, {
    method: 'POST',
    body: { tag, remove },
  });
  return data.tags;
}

/** POST /api/contacts/:id/score — manual lead-score adjustment (-100..100). Returns the new score. */
export async function adjustContactScore(id: string, delta: number, note?: string): Promise<number> {
  const data = await apiFetch<{ contactId: string; leadScore: number }>(`/api/contacts/${id}/score`, {
    method: 'POST',
    body: { delta, note },
  });
  return data.leadScore;
}

/** POST /api/contacts/:id/converted — marks the contact won (stage -> converted). */
export async function markContactConverted(id: string): Promise<void> {
  await apiFetch(`/api/contacts/${id}/converted`, { method: 'POST' });
}

// ============================================================
// Posts library — the caller's own existing posts per connected account,
// used to pick a specific post to attach an automation to. Distinct from
// fetchPosts()/PostWithDetails above, which is the /api/publish drafting
// flow's "what have I posted" list — this is populrbackend's /api/posts,
// synced from Zernio and scoped server-side to the caller's own workspace.
// ============================================================

export interface PostLibraryItem {
  id: string;
  account_id: string;
  platform: string;
  external_post_id: string;
  url: string | null;
  caption: string | null;
  media_url: string | null;
  published_at: string | null;
  likes: string | null;
  comments: string | null;
  shares: string | null;
  saves: string | null;
  views: string | null;
  impressions: string | null;
  reach: string | null;
  engagement_rate: string | null;
  account_username: string | null;
  /** Why the backend is offering this row as this account's post.
   *  'verified' — ownership was established and recorded: the synced payload
   *  named this account, or the creator filed the post here by URL.
   *  'sole_account_inference' — nothing established it; it is shown only
   *  because the workspace has never had another account on this platform.
   *  That inference is what misattributes a second account's posts once the
   *  evidence of the second account is gone (see the picker's notice). */
  ownership_basis?: 'verified' | 'sole_account_inference';
  contacts_generated: string;
  warm_leads: string;
  hot_leads: string;
  dms_sent: string;
  funnels_attached: string;
}

/** GET /api/posts — the caller's own synced posts. Filters: accountId, platform. */
export async function fetchPostsLibrary(filter: {
  accountId?: string;
  platform?: string;
  limit?: number;
} = {}): Promise<PostLibraryItem[]> {
  const qs = new URLSearchParams();
  if (filter.accountId) qs.set('accountId', filter.accountId);
  if (filter.platform) qs.set('platform', filter.platform);
  if (filter.limit !== undefined) qs.set('limit', String(filter.limit));
  const query = qs.toString();
  const data = await apiFetch<{ count: number; posts: PostLibraryItem[] }>(`/api/posts${query ? `?${query}` : ''}`);
  return data.posts;
}

/** POST /api/posts/sync — refresh the library from Zernio for one (or all) of the caller's own accounts. */
export async function syncPostsLibrary(accountId?: string): Promise<{ accounts: number; postsStored: number; errors: string[] }> {
  return apiFetch('/api/posts/sync', { method: 'POST', body: accountId ? { accountId } : {} });
}

/**
 * POST /api/posts/declare-other-accounts — "these aren't all mine".
 *
 * The backend offers an unproven post as this account's only while nothing on
 * disk says the workspace has ever had a second account on the platform. When
 * that second account's record is gone, the inference is wrong and no re-sync
 * can correct it — the creator is the only one left who knows. This records
 * their say-so, after which unproven posts are withheld for good.
 */
export async function declareOtherAccountsOnPlatform(
  accountId: string,
): Promise<{ withdrawn: number; remaining: number; soleAccountOnPlatform: boolean }> {
  return apiFetch('/api/posts/declare-other-accounts', { method: 'POST', body: { accountId } });
}

/* The "paste a post URL" fallback that used to live here (POST
 * /api/posts/find-missing) has been removed from the product: it could store
 * a placeholder post row carrying no metrics and no thumbnail, which then
 * looked like a real synced post everywhere downstream. The automation wizard
 * now selects only from genuinely synced posts. The backend endpoint still
 * exists but is intentionally unused by this client. */

// ============================================================
// Compatibility shims for the restored redesigned frontend.
//
// The rebuild in 856751c was authored against an earlier api.ts naming
// (Automation / Post / Contact / TriggerType / ReplyChannel / LeadStage)
// and a `POST /api/automations/test` endpoint that was superseded by
// `/test-reply` in populrbackend #23. Rather than rename every field on
// every page, we alias the old names to main's current shapes and adapt
// the wizard's test-chat call. Where the underlying object simply is the
// same thing (Automation ↔ AutomationRecord, Post ↔ PostLibraryItem), the
// alias is safe and the wizard/pages read main's real fields verbatim.
// ============================================================

export type Automation = AutomationRecord;
export type Post = PostLibraryItem;
export type Contact = ContactRecord;
export type ReplyChannel = AutomationReplyChannel;

// Trigger-type surface the wizard offers. Matches the values documented on
// automations.trigger_type in populrbackend/src/db/schema.sql:221.
export type TriggerType = 'comment' | 'dm' | 'keyword' | 'post_comment' | 'any_post_comment';

// Lead stages the CRM assigns (mirrors populrbackend/src/config/leadscoring.ts)
// plus 'needs_reply', which is a UI-only bucket the Contacts page uses to
// group inbox items that don't have a stage of their own yet.
export type LeadStage = 'cold' | 'engaged' | 'warm' | 'interested' | 'hot' | 'converted' | 'needs_reply';

/** Shape the wizard's test chat renders. Populated from `/test-reply` plus
 *  client-side keyword matching, so the wizard can preview both "would
 *  this fire?" and "what would AI draft?" without a dedicated dry-run
 *  endpoint (dropped in populrbackend #24 in favour of /test-reply). */
export interface AutomationTestResult {
  matched: boolean;
  keyword?: string | null;
  needsHuman?: boolean;
  intent?: string;
  confidence?: number;
  reason?: string;
  /** Subdued informational line (e.g. why there's no AI draft to show).
   *  Never a failure claim: a missing AI preview doesn't stop the
   *  automation from replying in production, and the copy must not imply
   *  that it does. */
  note?: string | null;
  publicReply?: string | null;
  dm?: string | null;
  /** Media the DM will carry (the automation's attachment) — the engine
   *  attaches it to every DM send, AI-drafted or not. */
  dmMediaUrl?: string | null;
  /** Label of the tappable button attached to the DM, when configured. Like
   *  media, the engine attaches buttons to every DM send. */
  dmButtonLabel?: string | null;
}

export interface AutomationTestInput {
  platform: string;
  accountId?: string;
  triggerType: TriggerType;
  keywords: string[];
  replyChannel: AutomationReplyChannel;
  channel: 'comment' | 'dm';
  postId?: string;
  sampleText: string;
  aiEnabled: boolean;
  aiInstructions?: string;
  /** The wizard's configured replies, so the preview shows the actual text
   *  that will be sent rather than a placeholder. */
  commentReplyBody?: string;
  dmBody?: string;
  linkUrl?: string;
  mediaUrl?: string;
  /** Label of the tappable button carrying the tracked link, when set. */
  buttonLabel?: string;
}

/** Very small keyword matcher — mirrors populrbackend/src/services/
 *  automationMatch.ts's `keywordMatches` for the wizard's client-side
 *  preview only. The real engine runs the same logic server-side; this
 *  is not the source of truth for production replies. */
function localKeywordMatch(text: string, keywords: string[], mode: 'contains' | 'exact' | 'starts_with' = 'contains'): string | null {
  const haystack = text.toLowerCase();
  for (const raw of keywords) {
    const k = raw.toLowerCase().trim();
    if (!k) continue;
    if (mode === 'exact' && haystack === k) return raw;
    if (mode === 'contains' && haystack.includes(k)) return raw;
    if (mode === 'starts_with' && haystack.startsWith(k)) return raw;
  }
  return null;
}

/** Mirrors populrbackend's engineService.renderTemplate for preview only:
 *  {{name}} falls back to "there" exactly like the engine does for an
 *  unnamed contact, and {{link}} becomes the configured destination. */
function renderPreviewTemplate(text: string, link: string | null): string {
  return text
    .replace(/\{\{\s*name\s*\}\}/gi, 'there')
    .replace(/\{\{\s*link\s*\}\}/gi, link ?? '')
    // Mirror the engine's seam cleanup for a removed {{link}} ("here: " →
    // "here") so the preview shows exactly what would go out.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,!?:;])/g, '$1')
    .replace(/[\s:,-]+$/g, '')
    .trim();
}

/** Mirrors the engine's publicSafeAiDraft: the AI answers publicly only when
 *  its draft carries no link — links never appear in public comments (the
 *  tracked URL is per-contact and rides the DM as text and button). */
function publicSafeDraftPreview(draft: string | null): string | null {
  if (!draft) return null;
  const trimmed = draft.trim();
  if (!trimmed || /\{\{\s*link\s*\}\}/i.test(trimmed) || /https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

/** Test-chat wrapper. Does keyword matching locally, then (when AI is on)
 *  fetches an AI draft from `/api/automations/test-reply`. Non-mutating —
 *  same guarantees as the underlying endpoint. */
export async function testAutomation(input: AutomationTestInput): Promise<AutomationTestResult> {
  const keyword = localKeywordMatch(input.sampleText, input.keywords);

  // Mirrors the engine (populrbackend/src/services/automationMatch.ts):
  // keywords gate matching for EVERY trigger type. The old guard here only
  // checked them when triggerType === 'keyword' — a value the wizard never
  // produces ('comment' / 'dm'), so any sample "matched" with a null
  // keyword, the bubble rendered `Matched keyword ""`, and the preview
  // claimed a trigger that production would never fire.
  if (input.keywords.length > 0 && !keyword) {
    return {
      matched: false,
      reason: `None of this automation's trigger keywords appear in the sample ${input.channel === 'dm' ? 'DM' : 'comment'}.`,
    };
  }

  // From here the trigger DID match, so in production the automation fires
  // and replies regardless of whether an AI draft can be previewed — keyword
  // automations send their configured replies deterministically (see
  // populrbackend's engine: e2e passes with zero AI calls). A missing AI
  // preview is therefore a note on a successful match, never a warning that
  // something is broken or needs a human.
  const wantsComment = input.replyChannel === 'comment' || input.replyChannel === 'both';
  const wantsDM = input.replyChannel === 'dm' || input.replyChannel === 'both';
  const previewLink = input.linkUrl?.trim() || null;
  // The engine's own fallback when no comment reply is configured. Public
  // comments never carry links — the engine renders {{link}} to nothing on
  // the public surface — so the comment preview does the same.
  const commentPreview = wantsComment
    ? renderPreviewTemplate(input.commentReplyBody?.trim() || 'Just sent you a DM! 📩', null)
    : null;
  const dmPreview = wantsDM && input.dmBody?.trim()
    ? renderPreviewTemplate(input.dmBody.trim(), previewLink)
    : null;
  // The engine attaches the automation's media to every DM it sends,
  // AI-drafted or deterministic alike — and its buttons, whose url it swaps
  // for the per-contact tracked link. A button needs a link to carry.
  const dmMedia = wantsDM && input.mediaUrl?.trim() ? input.mediaUrl.trim() : null;
  const dmButton = wantsDM && input.buttonLabel?.trim() && input.linkUrl?.trim()
    ? input.buttonLabel.trim()
    : null;

  const matchedWithoutPreview = (note: string): AutomationTestResult => ({
    matched: true, keyword, needsHuman: false,
    reason: 'Populr will reply automatically.',
    note,
    publicReply: commentPreview,
    dm: dmPreview,
    dmMediaUrl: dmPreview ? dmMedia : null,
    dmButtonLabel: dmPreview ? dmButton : null,
  });

  if (!input.aiEnabled) {
    return matchedWithoutPreview(
      'AI drafting is off for this automation, so replies use your configured text as-is.'
    );
  }

  let resp:
    | { available: false; reason: string }
    | {
        available: true;
        decision: {
          intent: string; confidence: number; replyType: 'dm' | 'comment';
          replyText: string | null; linkToSend: { key: string; url: string } | null;
          needsHuman: boolean; shouldAutoReply: boolean; reason: string;
        };
      };
  try {
    resp = await apiFetch('/api/automations/test-reply', {
      method: 'POST',
      body: {
        platform: input.platform,
        channel: input.channel,
        messageText: input.sampleText,
      },
    });
  } catch {
    // The preview endpoint failing is a preview problem, not an automation
    // problem — surfacing it as a red test failure (the old behavior)
    // overstated it.
    return matchedWithoutPreview(
      "The AI draft preview couldn't load just now. This doesn't affect the automation itself."
    );
  }
  if (!resp.available) {
    return matchedWithoutPreview(
      resp.reason === 'not_configured'
        ? "Smart Replies isn't set up on this server, so there's no AI draft to show."
        : resp.reason === 'ai_disabled'
        ? "AI is turned off in Brand Settings, so there's no AI draft to show."
        : "The AI draft preview couldn't load just now. This doesn't affect the automation itself."
    );
  }
  const d = resp.decision;
  if (d.needsHuman) {
    // Holding reply: for questions the instructions don't cover, the AI
    // sends a warm fact-free acknowledgment and then queues the
    // conversation — so the preview shows that reply plus what happens next.
    // Routed to the channel the automation actually sends on, mirroring the
    // engine: comment-only automations post it publicly (their DM branch
    // never runs); everything else DMs it.
    if (d.replyText) {
      const postsPublicly = input.replyChannel === 'comment';
      return {
        matched: true,
        keyword,
        intent: d.intent,
        confidence: d.confidence,
        needsHuman: true,
        reason: d.reason,
        note: 'After this reply, the conversation is queued for you to follow up personally.',
        publicReply: postsPublicly ? d.replyText : null,
        dm: postsPublicly ? null : d.replyText,
        dmMediaUrl: postsPublicly ? null : dmMedia,
        dmButtonLabel: postsPublicly ? null : dmButton,
      };
    }
    // Pure escalation: NOTHING is sent. Previews must vanish — with them
    // present the renderer shows send bubbles instead of the escalation
    // notice, claiming an auto-reply production would never make.
    return {
      matched: true,
      keyword,
      intent: d.intent,
      confidence: d.confidence,
      needsHuman: true,
      reason: d.reason,
      publicReply: null,
      dm: null,
    };
  }
  return {
    matched: true,
    keyword,
    intent: d.intent,
    confidence: d.confidence,
    needsHuman: false,
    reason: d.reason,
    // Mirrors the engine: a link-free confident draft IS the public reply;
    // a draft built around the link stays in the DM and the public reply
    // falls back to the configured static text (the "check your DMs"
    // pointer). The DM previews the AI draft with the configured DM as its
    // fallback.
    publicReply: wantsComment ? (publicSafeDraftPreview(d.replyText) ?? commentPreview) : null,
    dm: wantsDM ? (d.replyType === 'dm' && d.replyText ? d.replyText : dmPreview) : null,
    dmMediaUrl: wantsDM ? dmMedia : null,
    dmButtonLabel: wantsDM ? dmButton : null,
  };
}

/* Note: main's `fetchPosts(tab, limit)` returns draft posts for the Content
 * page and is unrelated to the wizard's "which of my synced Zernio posts
 * should this automation watch?" query. The wizard uses `fetchPostsLibrary`
 * directly (adapted at its call site) rather than a shadowing overload here. */

/** ContactsPage's tag toggle. Main's `updateContact` accepts a full patch;
 *  this is the narrow, existing call it was written against. */
export async function updateContactTag(id: string, tag: string, remove = false): Promise<string[]> {
  const patch: { addTag?: string; removeTag?: string } = remove ? { removeTag: tag } : { addTag: tag };
  const updated = await apiFetch<{ contact: { tags: string[] } }>(`/api/contacts/${id}/tags`, {
    method: 'POST', body: patch,
  });
  return updated.contact.tags;
}

// ============================================================
// Automation flows — the multi-step automation builder.
//
// Talks to populrbackend's /api/flows, which owns validation and execution:
// every graph written here is re-validated server-side, and the AI composer
// returns operations the server has already parsed and applied. The client's
// job is to never construct something the server would reject, not to be the
// authority on what's valid.
// ============================================================


export type FlowStatus = 'draft' | 'live' | 'paused';

export interface AutomationFlow {
  id: string;
  name: string;
  status: FlowStatus;
  accountId: string | null;
  platform: string | null;
  graph: FlowGraph;
  version: number;
  /** Set when this flow was read in from a pre-builder automation. */
  legacyAutomationId: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A blocking problem Review shows, tied to the step it belongs to. */
export interface FlowProblem {
  nodeId: string | null;
  message: string;
}

export interface FlowSimulationStep {
  nodeId: string;
  nodeType: string;
  status: 'ok' | 'failed' | 'skipped';
  detail: string;
  branch?: 'next' | 'yes' | 'no';
  output?: Record<string, unknown> | null;
}

export interface FlowSimulationResult {
  matched: boolean;
  reason: string | null;
  steps: FlowSimulationStep[];
}

export interface FlowComposeResult {
  applied: boolean;
  summary: string;
  source: 'model' | 'fallback';
  operations: unknown[];
  touchedNodeIds?: string[];
  previousGraph?: FlowGraph;
  flow: AutomationFlow | null;
}

export async function fetchFlows(): Promise<AutomationFlow[]> {
  const data = await apiFetch<{ count: number; flows: AutomationFlow[] }>('/api/flows');
  return data.flows;
}

export async function fetchFlow(id: string): Promise<AutomationFlow> {
  const data = await apiFetch<{ flow: AutomationFlow }>(`/api/flows/${id}`);
  return data.flow;
}

export async function createFlow(input: { name?: string; graph?: FlowGraph } = {}): Promise<AutomationFlow> {
  const data = await apiFetch<{ flow: AutomationFlow }>('/api/flows', { method: 'POST', body: input });
  return data.flow;
}

/** PATCH /api/flows/:id — the builder's autosave. */
/**
 * Autosave.
 *
 * `delegationWarning` says the automation's live behaviour and what is on the
 * canvas have come apart. A comment→DM automation's opening message is sent by
 * Instagram, from a copy registered when it went live, so an edit only reaches
 * real people once that copy is updated — and it can't be, if the edit is one
 * Instagram won't accept. Returned rather than discarded because a creator who
 * has been told "Autosaved just now" will otherwise reasonably believe the
 * automation is now sending what they just typed.
 */
export async function updateFlow(
  id: string,
  patch: { name?: string; graph?: FlowGraph },
): Promise<{ flow: AutomationFlow; delegationWarning?: string }> {
  return apiFetch<{ flow: AutomationFlow; delegationWarning?: string }>(
    `/api/flows/${id}`,
    { method: 'PATCH', body: patch },
  );
}

/**
 * DELETE /api/flows/:id — sent when the creator asks, not seven seconds later.
 *
 * `keepalive` because the interface acts on this immediately: the row is gone
 * and the toast says "deleted" before the server has answered. Without it, a
 * reload or a closed tab in the moments after the click could have the browser
 * cancel the request, and the automation would be back on the way in — the
 * same failure the seven-second delay used to cause, through a much smaller
 * door. The window shrinking is not the same as it closing.
 *
 * `warning` means Populr marked the automation deleted but Instagram has not
 * confirmed its copy stopped, so commenters may still be receiving the DM. The
 * automation is gone from the creator's list either way; the difference is
 * whether anything is still messaging people on its behalf.
 */
export async function deleteFlow(id: string): Promise<{ deleted: boolean; warning?: string }> {
  return apiFetch(`/api/flows/${id}`, { method: 'DELETE', keepalive: true });
}

/**
 * POST /api/flows/:id/restore — Undo.
 *
 * Deleting is a soft delete, so Undo restores the automation itself: same id,
 * same run history, rather than a rebuilt lookalike. It comes back PAUSED
 * whatever it was before, because deleting it stopped Instagram's copy and
 * cancelled its scheduled follow-ups, and neither of those is reversed by
 * bringing the row back. `restoredPaused` says so explicitly so the caller can
 * tell a creator whose automation was live that it is not live again.
 *
 * 404 means there is nothing to restore — never deleted, already restored, or
 * not this workspace's.
 */
export async function restoreFlow(
  id: string,
): Promise<{ flow: AutomationFlow; restoredPaused: boolean }> {
  return apiFetch(`/api/flows/${id}/restore`, { method: 'POST' });
}

/** GET /api/flows/:id/validation — what Review reads. */
export async function fetchFlowValidation(id: string): Promise<{ ok: boolean; problems: FlowProblem[] }> {
  return apiFetch(`/api/flows/${id}/validation`);
}

/**
 * POST /api/flows/:id/activate. A flow that isn't ready comes back as a 400
 * carrying `problems`; ApiError.details flattens those messages, but the
 * caller usually wants them tied to their nodes, so the raw list is rethrown
 * as FlowNotReadyError.
 */
export class FlowNotReadyError extends Error {
  constructor(public readonly problems: FlowProblem[]) {
    super('This automation isn\'t ready to activate yet.');
    this.name = 'FlowNotReadyError';
  }
}

export async function activateFlow(id: string): Promise<{ flow: AutomationFlow; legacyPaused: boolean }> {
  try {
    return await apiFetch(`/api/flows/${id}/activate`, { method: 'POST' });
  } catch (err) {
    if (err instanceof ApiError && err.status === 400 && Array.isArray(err.problems)) {
      throw new FlowNotReadyError(err.problems);
    }
    throw err;
  }
}

/**
 * Pause.
 *
 * `warning` means Populr paused its side but Instagram has not confirmed the
 * automation stopped, so commenters may still be receiving the DM. It is the
 * difference between "paused" and "we asked" — and a creator pausing an
 * automation because its message is wrong needs to know which one they got.
 */
export async function pauseFlow(
  id: string,
): Promise<{ flow: AutomationFlow; cancelledRuns: number; warning?: string }> {
  return apiFetch(`/api/flows/${id}/pause`, { method: 'POST' });
}

/** POST /api/flows/:id/test — a dry run through the real executors. */
export async function testFlow(
  id: string,
  input: { channel: 'comment' | 'dm'; text: string; replied?: boolean; handle?: string; tags?: string[] },
): Promise<FlowSimulationResult> {
  return apiFetch(`/api/flows/${id}/test`, { method: 'POST', body: input });
}

/** POST /api/flows/:id/compose — natural language in, validated operations out. */
export async function composeFlow(
  id: string,
  input: { prompt: string; selectedNodeId?: string | null },
): Promise<FlowComposeResult> {
  return apiFetch(`/api/flows/${id}/compose`, { method: 'POST', body: input });
}

export interface FlowActivityStep {
  id: string;
  run_id: string;
  node_id: string;
  node_type: string;
  status: 'ok' | 'failed' | 'skipped';
  detail: string | null;
  branch: string | null;
  contact_handle: string | null;
  contact_name: string | null;
  run_status: string;
  created_at: string;
}

export async function fetchFlowActivity(id: string): Promise<{ steps: FlowActivityStep[] }> {
  return apiFetch(`/api/flows/${id}/activity`);
}

/** Reference data the builder needs on open: whether the model-backed composer
 *  is configured (it changes the composer's copy) and the workspace's existing
 *  tags (so tag fields suggest rather than invite near-duplicates). */
export async function fetchFlowBuilderMeta(): Promise<{ aiConfigured: boolean; tags: string[] }> {
  return apiFetch('/api/flows/meta/status');
}
