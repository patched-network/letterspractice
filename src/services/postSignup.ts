import { sendVerificationEmail } from '@vue-skuilder/common-ui';
import { log } from '@vue-skuilder/common';
import { ENTITLEMENT_COURSE_ID } from './courseEntitlement';
import { startCourseSync } from './courseSync';

/**
 * Post-signup steps for a freshly created, logged-in account.
 *
 * Shared by every signup method (password today; Google sign-in next — see
 * TODO-google-auth.md) so they can't drift. Login state and routing stay with
 * the caller.
 *
 * Every step is best-effort and fail-soft: signup is never blocked on any of
 * them. They run sequentially because most of them write the same `_users`
 * doc (send-verification, signup-context, grant/gift, initialize-trial), and
 * parallel writers would 409 each other.
 */

export type SignupMethod = 'password' | 'google';

export interface PostSignupOptions {
  /** Couch username; for email signups this is also the (normalized) email. */
  username: string;
  method: SignupMethod;
  /** Product-updates consent from the signup form. */
  optInBroadcast: boolean;
  /**
   * Cohort signup (see GoonupView / the /join/:token route). On success the
   * account is comped via the business backend's /grant/redeem before the
   * trial bootstrap, so a granted account skips straight to paid.
   */
  grantToken?: string;
  /**
   * Purchased gift (see GiftClaimView / the /gift/claim/:token route),
   * redeemed via /gift/claim. Like grantToken, a bearer credential presented
   * out of band; both must run before initialize-trial.
   */
  giftToken?: string;
}

export async function runPostSignup(opts: PostSignupOptions): Promise<void> {
  // A new account is here to study: start building the course replica now,
  // while onboarding runs, so it's likely ready for the first session.
  startCourseSync('post-signup');
  // Google vouches for the address, so there's nothing to verify.
  if (opts.method === 'password') {
    await sendVerification(opts.username);
  }
  await recordSignupContext(opts.method);
  if (opts.optInBroadcast) {
    await optInToBroadcast(opts.username);
  }
  if (opts.grantToken) {
    await redeemGrant(opts.username, opts.grantToken);
  }
  if (opts.giftToken) {
    await claimGift(opts.username, opts.giftToken);
  }
  await initializeTrial(opts.username);
}

/**
 * Send verification email (persists the address to the _users doc, the
 * single source of truth).
 */
async function sendVerification(username: string): Promise<void> {
  try {
    const origin = window.location.origin;
    console.log('[SignUp] Sending verification email to:', username);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Verification email request timed out after 10s')), 10000)
    );

    const verificationResult = await Promise.race([
      sendVerificationEmail(username, username, origin),
      timeoutPromise,
    ]);

    if (!verificationResult.ok) {
      console.warn('[SignUp] Verification email failed:', verificationResult.error);
      log(`Warning: Failed to send verification email: ${verificationResult.error}`);
    } else {
      console.log('[SignUp] Verification email sent successfully');
    }
  } catch (emailError) {
    console.error('[SignUp] Verification send error:', emailError);
    log(`Warning: Failed to send verification: ${emailError}`);
  }
}

/**
 * Signup provenance (method + in-app-browser context) for the admin users
 * view. The backend classifies the User-Agent and identifies the account from
 * the couch session cookie.
 */
async function recordSignupContext(method: SignupMethod): Promise<void> {
  try {
    const resp = await fetch('/backend/account/signup-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ method }),
    });
    if (!resp.ok) {
      console.warn('[SignUp] signup-context not recorded:', resp.status);
    }
  } catch (contextError) {
    console.warn('[SignUp] signup-context error (non-blocking):', contextError);
  }
}

/**
 * Broadcast opt-in (product-updates consent). Reuses the public email-signup
 * write path, tagged site:'account-optin' so it's separable from top-of-funnel
 * captures and skips the list ACK email (the user already gets a verification
 * email). Opt-out lives in /account → Email preferences.
 */
async function optInToBroadcast(username: string): Promise<void> {
  try {
    await fetch('/backend/mailer/email-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientEmail: username, site: 'account-optin' }),
    });
  } catch (optInError) {
    console.warn('[SignUp] broadcast opt-in failed (non-blocking):', optInError);
  }
}

/**
 * Cohort grant redemption (comp). Runs BEFORE trial init so that, on success,
 * the entitlement is already 'paid' and the idempotent initialize-trial
 * no-ops. If the token is rejected or the backend is down, we fall through to
 * the normal trial so the user is never left without an entitlement.
 */
async function redeemGrant(username: string, token: string): Promise<void> {
  try {
    console.log('[SignUp] Redeeming grant token for:', username);
    const redeemResp = await fetch('/backend/grant/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, token }),
    });
    if (!redeemResp.ok) {
      console.warn('[SignUp] Grant redemption rejected:', redeemResp.status);
      log(`Warning: grant redemption failed (${redeemResp.status}) — falling back to trial`);
    } else {
      const grantData = await redeemResp.json();
      console.log('[SignUp] Grant redeemed:', grantData);
    }
  } catch (grantError) {
    console.error('[SignUp] Grant redemption error:', grantError);
    log(`Warning: grant redemption error: ${grantError}`);
  }
}

/**
 * Gift claim. Same position and fail-soft contract as the cohort grant. If the
 * token is spent or the backend is down we fall through to a normal trial
 * rather than leaving the new account with no entitlement at all — the gift
 * stays claimable (the pending doc is only stamped on a successful grant).
 */
async function claimGift(username: string, token: string): Promise<void> {
  try {
    console.log('[SignUp] Claiming gift for:', username);
    const claimResp = await fetch('/backend/gift/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, token }),
    });
    if (!claimResp.ok) {
      console.warn('[SignUp] Gift claim rejected:', claimResp.status);
      log(`Warning: gift claim failed (${claimResp.status}) — falling back to trial`);
    } else {
      console.log('[SignUp] Gift claimed:', await claimResp.json());
    }
  } catch (giftError) {
    console.error('[SignUp] Gift claim error:', giftError);
    log(`Warning: gift claim error: ${giftError}`);
  }
}

/**
 * Trial bootstrap. Idempotent: no-ops when a grant or gift already made the
 * entitlement 'paid'.
 *
 * TODO: this belongs in a shared commerce/entitlements library (not
 * vue-skuilder, which is educational scaffolding, not SaaS infrastructure),
 * following the pattern of common-ui's sendVerificationEmail().
 */
async function initializeTrial(username: string): Promise<void> {
  try {
    const origin = window.location.hostname;
    console.log('[SignUp] Initializing trial for:', username);

    const initTrialResponse = await fetch('/express/auth/initialize-trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        origin,
        courseId: ENTITLEMENT_COURSE_ID,
      }),
    });

    if (!initTrialResponse.ok) {
      console.warn('[SignUp] Trial initialization failed:', initTrialResponse.status);
      log(`Warning: Failed to initialize trial: ${initTrialResponse.status}`);
    } else {
      const trialData = await initTrialResponse.json();
      console.log('[SignUp] Trial initialized successfully:', trialData);
    }
  } catch (trialError) {
    console.error('[SignUp] Trial initialization error:', trialError);
    log(`Warning: Failed to initialize trial: ${trialError}`);
  }
}
