import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore, useConfigStore } from '@vue-skuilder/common-ui';
import { completeGoogleSignIn } from '../services/googleSignIn';
import { runPostSignup, type PostSignupOptions } from '../services/postSignup';

/**
 * Shared handling for the Google button on /login and /signup.
 *
 * Either page can end up creating an account or logging into an existing
 * one (Google doesn't know which the user meant), so both outcomes are
 * handled here:
 *   - created → the password-signup path: post-signup steps (with this page's
 *     grant/gift token and opt-in), then onboarding;
 *   - existing / linked → the login path: config init, then `redirect`.
 */
export function useGoogleSignIn(opts: {
  /** Where an existing account lands (LoginView's ?redirect=, else /study). */
  redirect: () => string;
  /** Extra post-signup inputs for a newly created account. */
  postSignup?: () => Omit<PostSignupOptions, 'username' | 'method'>;
}) {
  const router = useRouter();
  const authStore = useAuthStore();
  const configStore = useConfigStore();

  const pending = ref(false);
  const error = ref('');
  /** Why the last attempt failed, for callers that offer a next step. */
  const failure = ref<'use_password' | 'not_allowed' | 'failed' | null>(null);

  async function onCredential(credential: string) {
    if (pending.value) return;
    pending.value = true;
    error.value = '';
    failure.value = null;

    try {
      const result = await completeGoogleSignIn(credential);

      if (!result.ok) {
        failure.value = result.reason;
        error.value =
          result.reason === 'use_password'
            ? 'An account with this email already exists. Please log in with your password.'
            : result.reason === 'not_allowed'
              ? "Google sign-in isn't available for this account. Please log in with your password."
              : 'Google sign-in failed. Please try again, or use your email and password.';
        return;
      }

      if (result.outcome === 'created') {
        authStore.loginAndRegistration.loggedIn = true;
        authStore.loginAndRegistration.init = false;
        authStore.loginAndRegistration.init = true;

        await runPostSignup({
          username: result.username,
          method: 'google',
          optInBroadcast: false,
          ...opts.postSignup?.(),
        });
        // replace, not push: Back shouldn't return to the signup form.
        router.replace('/onboarding/age');
        return;
      }

      configStore.init();
      authStore.loginAndRegistration.loggedIn = true;
      router.push(opts.redirect());
    } catch (e) {
      console.error('[GoogleSignIn] unexpected error:', e);
      failure.value = 'failed';
      error.value = 'Google sign-in failed. Please try again, or use your email and password.';
    } finally {
      pending.value = false;
    }
  }

  return { pending, error, failure, onCredential };
}
