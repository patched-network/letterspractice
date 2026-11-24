<template>
  <v-container class="d-flex align-center justify-center" style="min-height: 80vh">
    <v-row justify="center">
      <v-col cols="12" sm="8" md="6" lg="5">
        <v-card elevation="2">
          <v-card-title class="text-center text-h5 py-4">
            Create an Account
          </v-card-title>

          <v-card-text class="text-left">
            <GoogleSignInOption
              text="signup_with"
              :post-signup="googlePostSignup"
              @pending="googlePending = $event"
            />

            <v-form @submit.prevent="handleSignUp">
              <v-text-field
                v-model="email"
                name="email"
                label="Email Address"
                type="email"
                variant="outlined"
                density="comfortable"
                class="mb-3"
                :disabled="submitting"
                :error-messages="emailError ? [emailError] : []"
                autocomplete="email"
                @update:model-value="emailError = ''; accountExists = false"
                @blur="validateEmail"
                required
              ></v-text-field>

              <v-text-field
                v-model="password"
                name="password"
                label="Create a Password"
                variant="outlined"
                density="comfortable"
                class="mb-3"
                :disabled="submitting"
                :error-messages="passwordError ? [passwordError] : []"
                :append-inner-icon="passwordVisible ? 'mdi-eye-off' : 'mdi-eye'"
                :type="passwordVisible ? 'text' : 'password'"
                @click:append-inner="passwordVisible = !passwordVisible"
                autocomplete="new-password"
                required
              ></v-text-field>

              <v-text-field
                v-model="confirmPassword"
                name="confirmPassword"
                label="Confirm Password"
                variant="outlined"
                density="comfortable"
                class="mb-3"
                :disabled="submitting"
                :error-messages="passwordMismatch ? ['Passwords do not match'] : []"
                :type="passwordVisible ? 'text' : 'password'"
                autocomplete="new-password"
                required
              ></v-text-field>

              <v-checkbox
                v-model="optInBroadcast"
                density="compact"
                hide-details
                color="primary"
                :disabled="submitting"
                class="mb-2"
              >
                <template #label>
                  <span class="text-body-2">
                    Send me occasional product updates. You can opt out anytime
                    from your account.
                  </span>
                </template>
              </v-checkbox>

              <v-alert v-if="signupError" type="error" variant="tonal" class="mb-3" density="compact">
                {{ signupError }}
              </v-alert>

              <v-alert v-if="accountExists" type="info" variant="tonal" class="mb-3" density="compact">
                You already have an account with this email.
                <router-link :to="{ path: '/login', query: { username: username } }">Log in</router-link>,
                or <router-link to="/request-reset">reset your password</router-link>.
              </v-alert>

              <v-btn
                type="submit"
                color="primary"
                block
                size="large"
                :loading="submitting"
                :disabled="!email || !!emailError || !password || !confirmPassword || !!passwordError || passwordMismatch || googlePending"
                class="mb-3"
              >
                Create Account
              </v-btn>

              <v-divider class="my-2"></v-divider>
              <div class="text-center">
                <span class="text-body-2 text-medium-emphasis">Already have an account?</span>
                <router-link to="/login" class="text-decoration-none ml-1">
                  Log In
                </router-link>
              </div>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore, getCurrentUser, validatePassword } from '@vue-skuilder/common-ui';
import { Status, log } from '@vue-skuilder/common';
import { runPostSignup } from '../services/postSignup';
import GoogleSignInOption from '../components/auth/GoogleSignInOption.vue';

/**
 * `grantToken`, when set, marks this as a cohort signup (see GoonupView /
 * the /join/:token route). On success the new account is comped via the
 * business backend's /grant/redeem before the normal trial bootstrap — so a
 * granted account skips straight to paid instead of starting a trial clock.
 *
 * `giftToken` is the same idea for a purchased gift (see GiftClaimView /
 * the /gift/claim/:token route), redeemed via /gift/claim. Both are bearer
 * credentials presented out of band; both must run before initialize-trial.
 */
const props = defineProps<{ grantToken?: string; giftToken?: string }>();

const router = useRouter();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const optInBroadcast = ref(false);
const passwordVisible = ref(false);
const submitting = ref(false);
const emailError = ref('');
const signupError = ref('');
const accountExists = ref(false);
const googlePending = ref(false);

/** A Google sign-in that creates an account gets this page's tokens + opt-in. */
const googlePostSignup = () => ({
  optInBroadcast: optInBroadcast.value,
  grantToken: props.grantToken,
  giftToken: props.giftToken,
});

/**
 * There is no username field: the account's couch username IS the email,
 * normalized (trim + lowercase — matches the framework's normalizeEmail, which
 * login and password reset apply to email identifiers). Usernames are
 * immutable, so treat this as an opaque id after signup; the recovery address
 * on the _users doc can later diverge from it. See express routes/auth.ts
 * resolve-login for how email logins find these accounts.
 */
const username = computed(() => email.value.trim().toLowerCase());

const passwordMismatch = computed(() => {
  if (!confirmPassword.value) return false;
  return password.value !== confirmPassword.value;
});

const passwordError = computed(() => {
  return validatePassword(password.value);
});

function validateEmail() {
  emailError.value = '';
  if (!email.value) return;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.value.trim())) {
    emailError.value = 'Please enter a valid email address';
  } else if (!/^[\x21-\x7e]+$/.test(email.value.trim())) {
    // ASCII only: the email becomes the couch username, and the framework's
    // userdb name encoding (hexEncode) disagrees with CouchDB's UTF-8 hex
    // convention for non-ASCII characters.
    emailError.value = 'Please use an email address with only standard (ASCII) characters';
  }
}

async function handleSignUp() {
  validateEmail();
  if (!email.value || emailError.value || !password.value || !confirmPassword.value) {
    return;
  }

  if (passwordMismatch.value || passwordError.value) {
    return;
  }
  
  // Reserved guest-account prefix (the username is derived from the email).
  if (username.value.startsWith('sk-guest-')) {
    emailError.value = 'This email address cannot be used. Please use a different one.';
    return;
  }

  submitting.value = true;
  signupError.value = '';
  accountExists.value = false;

  try {
    log(`User creation - Name: ${username.value}`);

    const user = await getCurrentUser();
    // Shown to the learner by the catch below.
    if (!user) throw new Error('Sign-up is not ready yet. Please reload the page and try again.');
    const resp = await user.createAccount(username.value, password.value);

    if (resp.status === Status.ok) {
      // Account created successfully
      authStore.loginAndRegistration.loggedIn = true;
      authStore.loginAndRegistration.init = false;
      authStore.loginAndRegistration.init = true;

      await runPostSignup({
        username: username.value,
        method: 'password',
        optInBroadcast: optInBroadcast.value,
        grantToken: props.grantToken,
        giftToken: props.giftToken,
      });

      // Redirect to onboarding page.
      // Use replace (not push) so Back doesn't return to the signup form,
      // and target the concrete /onboarding/age route to skip the redirect hop.
      //
      // NOTE: we used to gate this behind a 2s setTimeout when wasFunnelUser
      // was true (to show a "Your progress has been saved." alert). That
      // delay, combined with App.vue's <Transition mode="out-in">, was
      // wedging the router-view slot and rendering a blank <v-main> on the
      // post-signup navigation. The migration success indication should
      // happen on the destination route (or be skipped entirely) rather
      // than holding this view mounted.
      router.replace('/onboarding/age');
    } else {
      if (resp.error === 'This username is taken!') {
        // Most likely the same parent signing up again. If it isn't theirs
        // (someone else registered their address), password reset goes to
        // their inbox and recovers it.
        accountExists.value = true;
      } else {
        signupError.value = resp.error || 'Account creation failed';
      }
    }
  } catch (e: any) {
    console.error('createAccount error:', e);
    const errorText = e?.message || e?.error || e?.toString() || 'Account creation failed';
    signupError.value = errorText;
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.v-card {
  border-radius: 8px;
}
</style>
