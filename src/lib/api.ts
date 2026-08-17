// ============================================================
// Populr — Backend API client
// Talks to the populrbackend service (Express + Zernio) that handles the
// real Instagram/TikTok/YouTube/X OAuth connect flow and stores synced
// accounts. Base URL is baked in at build time via VITE_API_URL.
// ============================================================

import { getApiAuthToken, clearApiAuthToken } from './authClient';
import { GENERIC_ERROR, UNREACHABLE_ERROR, isCreatorSafe } from './voice';
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
  const url = import.meta.env.VITE_SUBSCRIPTION_CHECKOUT_URL;
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

  // A request that never reached Populr throws a bare TypeError ("Failed to
  // fetch"), which is not a sentence for a creator's screen. It becomes an
  // ApiError carrying Populr's own words; the cause stays in the console.
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      ...(init?.keepalive ? { keepalive: true } : {}),
    });
  } catch (err) {
    console.warn(`[api] ${path} unreachable`, err);
    throw new ApiError(UNREACHABLE_ERROR, 0);
  }
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
    // The route path and status stay in the console for developers; the
    // error's message is for a creator's screen, so a body without one gets
    // Populr's generic sentence — never `path failed with 502`, and never a
    // raw error code standing in as prose.
    console.warn(`[api] ${path} failed with ${res.status}`, parsed);
    throw new ApiError(
      isCreatorSafe(parsed?.message) ? parsed.message : GENERIC_ERROR,
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
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      // No Content-Type here — the browser sets the multipart boundary itself.
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
  } catch (err) {
    console.warn(`[api] ${path} unreachable`, err);
    throw new ApiError(UNREACHABLE_ERROR, 0);
  }
  if (!res.ok) {
    const parsed = await res
      .json()
      .then((body: { error?: string; message?: string }) => body)
      .catch(() => undefined);
    console.warn(`[api] ${path} failed with ${res.status}`, parsed);
    throw new ApiError(
      isCreatorSafe(parsed?.message) ? parsed.message : GENERIC_ERROR,
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
  /** Home's marketer tiles, honest by construction: readRate is null (not
   *  zero) until a DM has left on a platform that reports read receipts. */
  performance: {
    audienceGrowth30d: number;
    readRate: { read: number; sent: number } | null;
  };
  /** Per automation, from the account IT is bound to — never a workspace
   *  default. Metrics a channel can't measure arrive null and are omitted
   *  from the row, never rendered as 0%. */
  automationPerformance: {
    id: string;
    name: string;
    status: string;
    platform: string | null;
    account: { handle: string | null; displayName: string | null } | null;
    audience: number;
    audienceGrowth30d: number;
    replied: { contacts: number; messaged: number } | null;
    read: { read: number; sent: number } | null;
  }[];
  /** A few meaningful things that happened, derived from state tables —
   *  the UI writes the sentences, so engine internals can't leak through. */
  recentActivity: (
    | { kind: 'went_live'; automationName: string; accountHandle: string | null; at: string }
    | { kind: 'audience_joined'; automationName: string; count: number; at: string }
    | { kind: 'member_joined'; email: string; at: string }
    | { kind: 'conversation_started'; contactHandle: string | null; contactName: string | null; at: string }
    | { kind: 'messages_sent'; automationName: string; count: number; at: string }
  )[];
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
  contact_avatar_url: string | null;
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
  /**
   * How this person arrived, for the directory's From column: the first flow
   * they entered, or the pre-flows source automation's name. Null when
   * neither is on record — the column shows nothing rather than a guess.
   * List responses only; the detail answers the same question through
   * `automations` / `sourceAutomation`.
   */
  from_automation?: string | null;
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

/**
 * One line of a contact's automation history, as carried by ContactDetail.
 *
 * The rest of the legacy /api/automations client went with the wizard that
 * was its only caller; this shape stays because the contact timeline still
 * renders these events.
 */
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

/** An automation this person has entered — one row per automation, however
 *  many times they triggered it. */
export interface ContactAutomation {
  id: string;
  name: string;
  status: FlowStatus;
  /** When they first entered it; the oldest one is how they were acquired. */
  firstEnteredAt: string;
}

export interface ContactDetail {
  contact: ContactRecord;
  /**
   * The inbox item a reply to this person goes out through, or null when the
   * thread has nothing to reply to yet. On the detail rather than only on the
   * conversations list so the conversation view is self-sufficient: one fetch
   * answers who they are, what was said, and how to reply — whichever page is
   * asking.
   */
  latestInboxItemId: string | null;
  sourcePost: { id: string; caption: string | null; url: string | null; platform: string } | null;
  sourceAutomation: { id: string; name: string } | null;
  /** Automations entered, oldest first. Empty for a contact no automation reached. */
  automations: ContactAutomation[];
  messages: ContactMessage[];
  scoreEvents: ContactScoreEvent[];
  clicks: ContactLinkClick[];
  events: AutomationEvent[];
}

/** GET /api/contacts — the caller's own contacts. Filters: stage, platform, tag, needsReply, search, flowId. */
export async function fetchContacts(filter: {
  stage?: string;
  platform?: string;
  tag?: string;
  needsReply?: boolean;
  search?: string;
  /** 'recent' orders by last activity; default orders by lead score. */
  sort?: 'score' | 'recent';
  /**
   * Only the people one automation reached — the audience it built. The
   * response echoes back which automation that was, so a filtered URL that
   * arrives by link or bookmark can name it rather than showing a filtered
   * list with no account of itself.
   */
  flowId?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{
  contacts: ContactRecord[];
  total: number;
  stages: string[];
  allTags: string[];
  automation: { id: string; name: string } | null;
}> {
  const qs = new URLSearchParams();
  if (filter.flowId) qs.set('flowId', filter.flowId);
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

/**
 * One conversation — which is to say, one person.
 *
 * The API groups by contact rather than by message because that is what the
 * schema already is: `messages` is keyed on contact_id with both directions in
 * one table. A thread and a contact are the same thing here, which is what
 * makes "who am I talking to" answerable in one click.
 */
export interface Conversation {
  contactId: string;
  handle: string | null;
  name: string | null;
  avatarUrl: string | null;
  platform: string;
  lastMessage: {
    text: string | null;
    direction: 'inbound' | 'outbound' | null;
    channel: string | null;
    at: string;
  };
  /** Messages on this thread still flagged for a reply. 0 = nothing waiting. */
  waiting: number;
  /**
   * The inbox item a reply is sent through. Null when the thread has none —
   * the composer says so rather than failing on send.
   */
  latestInboxItemId: string | null;
}

/** GET /api/inbox/conversations — the workspace's threads, newest first. */
export async function fetchConversations(
  filter: { search?: string; limit?: number; offset?: number } = {},
): Promise<{ conversations: Conversation[] }> {
  const qs = new URLSearchParams();
  if (filter.search) qs.set('search', filter.search);
  if (filter.limit !== undefined) qs.set('limit', String(filter.limit));
  if (filter.offset !== undefined) qs.set('offset', String(filter.offset));
  const query = qs.toString();
  return apiFetch(`/api/inbox/conversations${query ? `?${query}` : ''}`);
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

export type Post = PostLibraryItem;
export type Contact = ContactRecord;

// Lead stages the CRM assigns (mirrors populrbackend/src/config/leadscoring.ts)
// plus 'needs_reply', which is a UI-only bucket the Contacts page uses to
// group inbox items that don't have a stage of their own yet.
export type LeadStage = 'cold' | 'engaged' | 'warm' | 'interested' | 'hot' | 'converted' | 'needs_reply';

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
  /**
   * Distinct people this automation has reached, all time.
   *
   * Sent by the list route only — it is a workspace-wide aggregate, and the
   * backend deliberately doesn't recompute it on every autosave. Absent
   * therefore means "not reported here", never "nobody", which is why the
   * Automations page keeps the counts it fetched separately from the flows
   * that mutations replace.
   */
  audienceCount?: number;
  /**
   * Why this LIVE automation can't fully run — the same messages activation
   * would refuse it with today. Sent by the list route only, and only for
   * live flows with something wrong (a flow that went live before a rule
   * existed, or whose account has since disconnected). Absent means "nothing
   * to report here", never "healthy and checked".
   */
  problems?: string[];
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
  /**
   * The walk parked on a "did they reply?" it has no answer for — the same
   * suspension a live run makes. Preview shows the question and re-runs with
   * the fan's answer appended to `replies`.
   */
  awaitingReply: boolean;
}

/**
 * One real stage of a compose, as the backend actually ran it.
 *
 * The composer's orchestration emits these AT each stage — understanding the
 * request, planning ("Planning 1 new Message step"), validating, applying
 * ("Adding a Message step after the Wait step"), saving — with labels derived
 * from the intent and the plan, never written by a model. The panel can render
 * the sequence as truthful build progress instead of inventing "Thinking…".
 */
export interface ComposerProgressEvent {
  id: string;
  stage:
    | 'understanding'
    | 'planning'
    | 'drafting'
    | 'validating'
    | 'applying'
    | 'saving'
    | 'complete'
    | 'error';
  label: string;
  /** The step the stage is about, when there is one. */
  nodeId?: string;
  /** The intent kind driving it (add_node, edit_node, delete_node). */
  operation?: string;
  /** The proposal plan item a drafting event concerns. */
  planItemId?: string;
}

export async function fetchFlows(): Promise<AutomationFlow[]> {
  const data = await apiFetch<{ count: number; flows: AutomationFlow[] }>('/api/flows');
  return data.flows;
}

export async function fetchFlow(id: string): Promise<AutomationFlow> {
  const data = await apiFetch<{ flow: AutomationFlow }>(`/api/flows/${id}`);
  return data.flow;
}

export async function createFlow(input: { name?: string; graph?: FlowGraph; accountId?: string } = {}): Promise<AutomationFlow> {
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

/**
 * POST /api/flows/:id/test — a dry run through the real executors.
 *
 * `replies` is the fan's side of the conversation after the trigger, in
 * order, one entry per "did they reply?" the flow reaches: a string answers
 * with that text, a null declines. The simulation parks at the first check
 * with no entry (awaitingReply), so each question is asked before the next.
 */
export async function testFlow(
  id: string,
  input: {
    channel: 'comment' | 'dm';
    text: string;
    replies?: (string | null)[];
    handle?: string;
    tags?: string[];
  },
): Promise<FlowSimulationResult> {
  return apiFetch(`/api/flows/${id}/test`, { method: 'POST', body: input });
}

/** POST /api/flows/:id/compose — natural language in, validated operations out. */
/**
 * What the agent PLANS to build — held outside the graph until the creator
 * clicks Build this. The plan checklist is derived server-side from the
 * proposed operations, so the confirmation card can only claim what the
 * draft actually contains.
 */
export interface FlowProposalPlanItem {
  id: string;
  label: string;
  operationIds: number[];
  proposedNodeId?: string;
}

export interface FlowProposal {
  id: string;
  status: 'awaiting_confirmation' | 'committed' | 'superseded' | 'discarded';
  prompt: string;
  plan: FlowProposalPlanItem[];
  operations: unknown[];
  assumptions: string[];
  summary: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlowProposeResult {
  proposal: FlowProposal | null;
  /** The summary is a question — the agent needs one detail first. */
  clarification: boolean;
  summary: string;
  source: 'model' | 'fallback' | 'intent';
  progress?: ComposerProgressEvent[];
}

/** POST /api/flows/:id/propose — the agent drafts; the canvas doesn't move.
 *  Pass `proposalId` to revise the active draft instead of starting over. */
export async function proposeFlow(
  id: string,
  input: { prompt: string; selectedNodeId?: string | null; proposalId?: string | null },
): Promise<FlowProposeResult> {
  return apiFetch(`/api/flows/${id}/propose`, { method: 'POST', body: input });
}

/** GET /api/flows/:id/proposal — the draft to restore after a refresh. */
export async function fetchActiveProposal(id: string): Promise<{ proposal: FlowProposal | null }> {
  return apiFetch(`/api/flows/${id}/proposal`);
}

/** POST …/commit — Build this: the explicit human confirmation gate. */
export async function commitProposal(
  id: string,
  proposalId: string,
): Promise<{
  applied: boolean;
  flow: AutomationFlow | null;
  touchedNodeIds: string[];
  operations: unknown[];
  previousGraph?: FlowGraph;
  summary: string;
}> {
  return apiFetch(`/api/flows/${id}/proposal/${proposalId}/commit`, { method: 'POST' });
}

/** POST …/discard — never mind; the draft goes away, the canvas never moved. */
export async function discardProposal(id: string, proposalId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/flows/${id}/proposal/${proposalId}/discard`, { method: 'POST' });
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

/**
 * One message of an automation's persistent AI build conversation. The server
 * is the source of truth — this is what makes the composer's history survive
 * a refresh; local state only caches it for the session.
 */
export interface FlowAiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** The step the message concerned, when it concerned one; null for
   *  whole-automation requests. */
  nodeId: string | null;
  /** What actually changed, derived server-side from the operations that were
   *  applied — never model prose. Null on user rows, questions and failures. */
  operationSummary: string | null;
  /** Who asked (user rows). Stored so a future collaborative builder can tell
   *  authors apart; null on Populr's rows. */
  authorId: string | null;
  source: 'model' | 'fallback' | 'intent' | null;
  createdAt: string;
}

/** A page of the conversation, oldest→newest within the page. `before` walks
 *  backwards: pass the id of the oldest message already loaded. */
export async function fetchFlowAiMessages(
  id: string,
  opts: { before?: string; limit?: number } = {},
): Promise<{ messages: FlowAiMessage[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (opts.before) params.set('before', opts.before);
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return apiFetch(`/api/flows/${id}/ai-messages${qs ? `?${qs}` : ''}`);
}

// ============================================================
// Team — collaborators and the invitations that create them.
//
// Every collaborator gets View access; `editAutomations` and
// `contactOutreach` are the two grantable extras. Owner is not an invite
// permission — activating automations, managing the team, connected
// accounts and billing stay with the workspace owner (see the backend's
// workspace_invitations / workspace_members).
//
// The invite token exists in exactly two places, ever: the emailed link,
// and the accept call that presents it back. No read endpoint returns one,
// so nothing here can leak it into the UI.
// ============================================================

export interface TeamPermissions {
  editAutomations: boolean;
  contactOutreach: boolean;
}

/** An invite's scope: null = the whole workspace; set = one automation
 *  canvas, which is then the invitee's entire surface. */
export interface AutomationScope {
  id: string;
  name: string;
}

export interface TeamInvitation {
  id: string;
  email: string;
  permissions: TeamPermissions;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  /** 'failed' when the email couldn't be delivered — the invitation is still
   *  pending, so the owner can see why nobody arrived. */
  emailDelivery: 'sent' | 'failed';
  createdAt: string;
  expiresAt: string;
  automation: AutomationScope | null;
}

export interface TeamMember {
  /** The address they were invited at. Null only for a membership whose
   *  invitation no longer exists — the UI says "A teammate" rather than
   *  showing an account id. */
  email: string | null;
  permissions: TeamPermissions;
  joinedAt: string;
  automation: AutomationScope | null;
}

/** GET /api/team — this workspace's collaborators and its invitations. */
export async function fetchTeam(): Promise<{ invitations: TeamInvitation[]; members: TeamMember[] }> {
  return apiFetch('/api/team');
}

/** POST /api/team/invites — create and email an invitation. Pass
 *  `automationId` to scope it to one canvas: the invitee can then open and
 *  edit that automation and nothing else (the permission flags don't apply
 *  to canvas invites — the canvas IS the grant). */
export async function inviteTeammate(
  email: string,
  permissions: TeamPermissions,
  automationId?: string,
): Promise<TeamInvitation> {
  const data = await apiFetch<{ invitation: TeamInvitation }>('/api/team/invites', {
    method: 'POST',
    body: { email, permissions, ...(automationId ? { automationId } : {}) },
  });
  return data.invitation;
}

/** DELETE /api/team/invites/:id — withdraw an invitation that hasn't been used. */
export async function revokeInvitation(id: string): Promise<void> {
  await apiFetch(`/api/team/invites/${id}`, { method: 'DELETE' });
}

export type InviteAcceptStatus = 'accepted' | 'already_member' | 'owner';

/** POST /api/team/invites/accept — redeem the token from an invite link.
 *  `automation` is set when the invite was scoped to one canvas — the
 *  acceptance page names it and links straight there. Rejects with an
 *  ApiError whose `code` says why (invite_expired, invite_revoked,
 *  invite_used, invite_not_found). */
export async function acceptInvitation(
  token: string,
): Promise<{ status: InviteAcceptStatus; workspaceId: string; automation?: AutomationScope | null }> {
  return apiFetch('/api/team/invites/accept', { method: 'POST', body: { token } });
}

// ---------------------------------------------------------------------------
// Workspace access — which workspace this account's requests act in, and
// what it may do there. Servers resolve this per request; the frontend reads
// it once to shape what it offers: a control the API would refuse isn't
// rendered as if it would work.
// ---------------------------------------------------------------------------

export type WorkspaceRole = 'owner' | 'member' | 'canvas';

export interface WorkspaceAccess {
  id: string;
  name: string;
  role: WorkspaceRole;
  permissions: TeamPermissions;
  /** Set only for role 'canvas': the one automation their invite opens. */
  canvasAutomation: AutomationScope | null;
}

/** GET /api/me — the workspace half of the payload. */
export async function fetchWorkspaceAccess(): Promise<WorkspaceAccess> {
  const me = await apiFetch<{ workspace: WorkspaceAccess }>('/api/me');
  return me.workspace;
}
