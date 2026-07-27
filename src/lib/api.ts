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

export interface ConnectedAccount {
  id: string;
  platform: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_connected: boolean;
  connected_at: string | null;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Populr API ${path} failed with ${res.status}`);
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
