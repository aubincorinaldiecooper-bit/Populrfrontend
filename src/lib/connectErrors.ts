import { ApiError } from './api';

/**
 * Populr's own words for why starting a connection failed.
 *
 * Every non-402 failure used to collapse into one sentence — "Couldn't create
 * a connection link just now" — for a 502, a 400 and a dead network alike.
 * That sentence is true and useless: it tells the creator to retry when
 * retrying is exactly what won't help, and it made a real production incident
 * (a Zernio profile-name conflict that wedged "Connect another" permanently)
 * take a full backend log dump to identify, because the UI could not
 * distinguish "transient" from "this will never work until someone changes
 * something".
 *
 * The rule the connect path already follows is kept: the backend's own text is
 * NEVER rendered. Only stable error CODES are read, and each maps to copy
 * written here. A code we don't recognize falls back to the generic sentence
 * rather than leaking a provider message into the UI.
 */

/** What the creator can do about it — drives whether "try again" is offered. */
export type ConnectFailureKind = 'transient' | 'permanent';

export interface ConnectFailure {
  message: string;
  kind: ConnectFailureKind;
}

const GENERIC: ConnectFailure = {
  message: "Populr couldn't start the connection just now. Try again in a moment.",
  kind: 'transient',
};

export function connectFailure(err: unknown, platformLabel: string): ConnectFailure {
  if (!(err instanceof ApiError)) return GENERIC;

  switch (err.code) {
    // Zernio wouldn't give us a place to put the new account. Since the
    // backend now adopts or renames around a name conflict, reaching this is
    // genuinely a provider hiccup rather than the permanent wedge it used to
    // describe — so it stays a retry.
    case 'profile_unavailable':
      return {
        message: `Populr couldn't prepare a place for another ${platformLabel} account. Try again in a moment.`,
        kind: 'transient',
      };

    // Server-side configuration, on our side. Retrying is pointless and the
    // creator cannot fix it, so say so instead of inviting them to keep
    // clicking.
    case 'misconfigured':
    case 'disallowed_return_url':
      return {
        message: `Connecting ${platformLabel} isn't set up correctly on Populr's side. Please contact support — retrying won't help.`,
        kind: 'permanent',
      };

    case 'unsupported_platform':
      return {
        message: `Populr can't connect ${platformLabel} accounts yet.`,
        kind: 'permanent',
      };
  }

  // 402 never reaches here — the subscription modal takes over before this is
  // consulted. A 5xx without a code we know is still worth a retry; a 4xx
  // without one is a request this build shouldn't have made.
  if (err.status >= 500) return GENERIC;
  if (err.status >= 400) {
    return {
      message: `Populr couldn't start the ${platformLabel} connection. Please contact support if it keeps happening.`,
      kind: 'permanent',
    };
  }
  return GENERIC;
}
