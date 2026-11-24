import { getCurrentUser } from '@vue-skuilder/common-ui';

/**
 * Completes "Sign in with Google" after GIS hands us an ID token.
 *
 * The business backend verifies the token, has the framework resolve / link /
 * create the account, and sets the CouchDB `AuthSession` cookie on its
 * response. Then the client adopts that session like a login: guest data is
 * migrated only into a freshly created account, as with password signup.
 * See TODO-google-auth.md.
 */

export type GoogleSignInOutcome = 'existing' | 'linked' | 'created';

export type GoogleSignInResult =
  | { ok: true; username: string; outcome: GoogleSignInOutcome }
  | {
      ok: false;
      /**
       * use_password: the address matches an existing account, but Google
       *   isn't authoritative for it; log in with the password instead.
       * not_allowed: this account can't use Google sign-in.
       * failed: anything else (bad token, network, backend down).
       */
      reason: 'use_password' | 'not_allowed' | 'failed';
    };

export async function completeGoogleSignIn(credential: string): Promise<GoogleSignInResult> {
  let body: { username?: string; outcome?: GoogleSignInOutcome; code?: string };
  let status: number;
  try {
    const resp = await fetch('/backend/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ credential }),
    });
    status = resp.status;
    body = await resp.json().catch(() => ({}));
  } catch (err) {
    console.error('[GoogleSignIn] request failed:', err);
    return { ok: false, reason: 'failed' };
  }

  if (status === 409 && body.code === 'use_password') return { ok: false, reason: 'use_password' };
  if (status === 403) return { ok: false, reason: 'not_allowed' };
  if (status !== 200 || !body.username || !body.outcome) {
    console.warn('[GoogleSignIn] sign-in rejected:', status, body);
    return { ok: false, reason: 'failed' };
  }

  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('[GoogleSignIn] no user instance to adopt the session');
    const adopted = await user.adoptSession({ migrateGuestData: body.outcome === 'created' });
    if (!adopted.ok) {
      console.error('[GoogleSignIn] session adoption failed:', adopted.error);
      return { ok: false, reason: 'failed' };
    }
  } catch (err) {
    console.error('[GoogleSignIn] session adoption error:', err);
    return { ok: false, reason: 'failed' };
  }

  return { ok: true, username: body.username, outcome: body.outcome };
}
