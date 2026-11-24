/**
 * CouchDB `_users` access that isn't admin-only. A logged-in user can read
 * their own `_users` doc with their session cookie; admins can read all of
 * them (see adminUsersService).
 */
import ENV from '../ENVIRONMENT_VARS';

export function getCouchBaseUrl(): string {
  const protocol = ENV.COUCHDB_SERVER_PROTOCOL || 'http';
  const serverUrl = ENV.COUCHDB_SERVER_URL || 'localhost:5984/';

  if (import.meta.env.DEV && serverUrl.includes('localhost')) {
    return `http://${serverUrl}`;
  }
  return `${protocol}://${serverUrl}`;
}

export function getUsersDbUrl(): string {
  const base = getCouchBaseUrl().replace(/\/+$/, '');
  return `${base}/_users`;
}

/**
 * Sign-in providers linked to this account (e.g. `['google']`), recorded by
 * framework express when an identity assertion creates or links it. Empty for
 * password-only accounts, and on any read failure.
 */
export async function fetchLinkedProviders(username: string): Promise<string[]> {
  try {
    const url = `${getUsersDbUrl()}/${encodeURIComponent(`org.couchdb.user:${username}`)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) return [];
    const doc = (await res.json()) as { linkedProviders?: unknown };
    return Array.isArray(doc.linkedProviders)
      ? doc.linkedProviders.filter((p): p is string => typeof p === 'string')
      : [];
  } catch {
    return [];
  }
}
