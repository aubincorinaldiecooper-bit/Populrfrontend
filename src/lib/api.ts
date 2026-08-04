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
  ) {
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
      .then((body: { error?: string; message?: string; details?: string[] }) => body)
      .catch(() => undefined);
    throw new ApiError(
      parsed?.message || parsed?.error || `Populr API ${path} failed with ${res.status}`,
      res.status,
      parsed?.error,
      Array.isArray(parsed?.details) ? parsed.details : undefined,
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
  /** Restricts to one contact's opportunities — the Contacts page's "related opportunities". */
  contactId?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ opportunities: Opportunity[]; total: number; summary: OpportunitySummary }> {
  const qs = new URLSearchParams();
  if (params.platform) qs.set('platform', params.platform);
  if (params.intent) qs.set('intent', params.intent);
  if (params.status) qs.set('status', params.status);
  if (params.contactId) qs.set('contactId', params.contactId);
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
  tags: string[];
  score_delta: number;
  stage_update: string | null;
  active: boolean;
  ai_enabled: boolean;
  ai_mode: AutomationAiMode;
  ai_confidence_threshold: string | number;
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

/** The AI's dry-run verdict on a sample comment/DM — the exact decision the
 *  live engine would reach, minus anything sent or persisted. */
export interface TestReplyDecision {
  intent: string;
  confidence: number;
  replyType: string;
  replyText: string | null;
  linkToSend: string | null;
  needsHuman: boolean;
  shouldAutoReply: boolean;
  reason: string;
}

/** POST /api/automations/test-reply's response. When the AI test can't run
 *  (Smart Replies not configured, brand AI switched off, or a model/transport
 *  failure), the backend returns `available: false` with an honest reason so
 *  the wizard falls back to previewing the fixed reply rather than inventing
 *  an AI answer — never a 500. */
export type TestReplyResult =
  | { available: true; decision: TestReplyDecision }
  | { available: false; reason: 'not_configured' | 'ai_disabled' | 'error' };

export interface TestReplyInput {
  platform: string;
  channel: 'comment' | 'dm';
  messageText: string;
  postCaption?: string | null;
}

/** POST /api/automations/test-reply — dry-run the real smart-reply model on a
 *  sample message for the builder's live test chat. Runs the SAME
 *  classifyAndDraft used in production; nothing is sent or stored. */
export async function fetchTestReply(input: TestReplyInput): Promise<TestReplyResult> {
  return apiFetch<TestReplyResult>('/api/automations/test-reply', {
    method: 'POST',
    body: input,
  });
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
  limit?: number;
  offset?: number;
} = {}): Promise<{ contacts: ContactRecord[]; total: number; stages: string[] }> {
  const qs = new URLSearchParams();
  if (filter.stage) qs.set('stage', filter.stage);
  if (filter.platform) qs.set('platform', filter.platform);
  if (filter.tag) qs.set('tag', filter.tag);
  if (filter.needsReply !== undefined) qs.set('needsReply', String(filter.needsReply));
  if (filter.search) qs.set('search', filter.search);
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

/** POST /api/posts/find-missing — "Can't find a post? Paste the URL." */
export async function findMissingPost(accountId: string, url: string): Promise<{ post: PostLibraryItem; source: 'zernio' | 'url_only' }> {
  return apiFetch('/api/posts/find-missing', { method: 'POST', body: { accountId, url } });
}
