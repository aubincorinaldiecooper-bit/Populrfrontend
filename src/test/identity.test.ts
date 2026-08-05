import { describe, it, expect } from 'vitest';
import { resolveIdentity, initialsFrom } from '../lib/identity';
import type { AuthUser } from '../context/AuthContext';

/* The Populr identity shown in the sidebar and Settings must come from the
 * Better Auth user — the account the creator actually signed in with.
 * It previously also carried a `handle` resolved from
 * `accounts.find(a => a.status === 'connected')`, rendered directly beneath
 * the user's name, so whichever connected platform the backend happened to
 * return first (a Reddit or Twitter account as easily as their Instagram)
 * labelled their Google identity. */

const user: AuthUser = {
  id: 'user_1',
  email: 'aubin@example.test',
  name: 'Aubin Cooper',
  image: 'https://cdn.example.test/avatar.jpg',
};

describe('resolveIdentity', () => {
  it('takes name, email, and avatar from the Better Auth user', () => {
    const identity = resolveIdentity(user);
    expect(identity.name).toBe('Aubin Cooper');
    expect(identity.email).toBe('aubin@example.test');
    expect(identity.avatarUrl).toBe('https://cdn.example.test/avatar.jpg');
    expect(identity.initials).toBe('AC');
  });

  it('exposes no social handle to stand in for the account identity', () => {
    expect(resolveIdentity(user)).not.toHaveProperty('handle');
  });

  it('falls back to the email local part when the user has no name', () => {
    const identity = resolveIdentity({ ...user, name: null });
    expect(identity.name).toBe('aubin');
    expect(identity.email).toBe('aubin@example.test');
  });

  it('never invents an identity when there is no user', () => {
    const identity = resolveIdentity(null);
    expect(identity.name).toBe('Populr user');
    expect(identity.email).toBeNull();
    expect(identity.avatarUrl).toBeNull();
  });

  it('treats a whitespace-only name as absent', () => {
    expect(resolveIdentity({ ...user, name: '   ' }).name).toBe('aubin');
  });
});

describe('initialsFrom', () => {
  it('uses first and last initials for a full name', () => {
    expect(initialsFrom('Aubin Cooper')).toBe('AC');
    expect(initialsFrom('Ada B Lovelace')).toBe('AL');
  });

  it('uses the first two characters of a single-word name', () => {
    expect(initialsFrom('aubin')).toBe('AU');
  });

  it('degrades to a placeholder rather than throwing on an empty name', () => {
    expect(initialsFrom('')).toBe('?');
    expect(initialsFrom('   ')).toBe('?');
  });
});
