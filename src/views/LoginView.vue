<template>
  <v-container class="d-flex align-center justify-center" style="min-height: 80vh">
    <v-row justify="center">
      <v-col cols="12" sm="8" md="6" lg="5">
        <v-card elevation="2">
          <v-card-title class="text-center text-h5 py-4">
            Log In
          </v-card-title>

          <v-card-text class="text-left">
            <GoogleSignInOption text="signin_with" :redirect="redirectTarget" @pending="googlePending = $event" />

            <v-form @submit.prevent="handleLogin">
              <v-text-field
                v-model="identifier"
                :autofocus="!identifier"
                name="username"
                label="Email address"
                hint="Older accounts can still sign in with a username."
                persistent-hint
                inputmode="email"
                autocapitalize="none"
                spellcheck="false"
                variant="outlined"
                density="comfortable"
                class="mb-3"
                :disabled="submitting"
                autocomplete="username"
                required
              ></v-text-field>

              <v-text-field
                v-model="password"
                :autofocus="!!identifier"
                name="password"
                label="Password"
                variant="outlined"
                density="comfortable"
                class="mb-3"
                :disabled="submitting"
                :append-inner-icon="passwordVisible ? 'mdi-eye-off' : 'mdi-eye'"
                :type="passwordVisible ? 'text' : 'password'"
                @click:append-inner="passwordVisible = !passwordVisible"
                autocomplete="current-password"
                required
              ></v-text-field>

              <v-alert v-if="loginError" type="error" variant="tonal" class="mb-3" density="compact">
                {{ loginError }}
              </v-alert>

              <v-btn
                type="submit"
                color="primary"
                block
                size="large"
                :loading="submitting"
                :disabled="!identifier || !password || googlePending"
                class="mb-3"
              >
                Log In
              </v-btn>

              <!--
                A first login on a new device pulls the account's saved work
                down before routing onward, which on a slow connection is the
                longest part of signing in. Without this the button just spins
                with no account of itself.
              -->
              <p
                v-if="submitting"
                class="text-caption text-center text-medium-emphasis mb-3"
                aria-live="polite"
              >
                {{ phaseLabel }}
              </p>

              <div class="d-flex flex-column gap-2">
                <div class="text-center">
                  <router-link to="/request-reset" class="text-caption text-decoration-none">
                    Forgot password?
                  </router-link>
                </div>
                <v-divider class="my-2"></v-divider>
                <div class="text-center">
                  <span class="text-body-2 text-medium-emphasis">Don't have an account?</span>
                  <router-link to="/signup" class="text-decoration-none ml-1">
                    Sign Up
                  </router-link>
                </div>
              </div>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { UserDBInterface } from '@vue-skuilder/db';
import { useAuthStore } from '@vue-skuilder/common-ui';
import { getCurrentUser } from '@vue-skuilder/common-ui';
import { useConfigStore } from '@vue-skuilder/common-ui';
import { resolveLoginIdentifier } from '@vue-skuilder/common-ui';
import { log } from '@vue-skuilder/common';
import GoogleSignInOption from '../components/auth/GoogleSignInOption.vue';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const configStore = useConfigStore();

// Holds a username OR an email address (see handleLogin). Prefilled from a
// ?username= hint (e.g. forwarded by the router guard when a deep link to an
// auth-required page was opened while signed out) — a username, which for newer accounts is the email.
const identifier = ref(typeof route.query.username === 'string' ? route.query.username : '');
const password = ref('');
const passwordVisible = ref(false);
const submitting = ref(false);
const loginError = ref('');
const googlePending = ref(false);

const redirectTarget = computed(() =>
  typeof route.query.redirect === 'string' ? route.query.redirect : '/study'
);

// `user.login()` covers two phases that feel very different when slow:
// authenticating against CouchDB, then — on a device that has never synced
// this account — pulling its saved work down. It's one awaited call, so the
// only way to tell them apart from here is to watch the hydration status.
const phase = ref<'authenticating' | 'restoring'>('authenticating');
let phasePoll: ReturnType<typeof setInterval> | null = null;

const phaseLabel = computed(() =>
  phase.value === 'restoring' ? 'Restoring your progress…' : 'Logging in…'
);

function watchForHydration(user: UserDBInterface) {
  stopPhasePoll();
  phasePoll = setInterval(() => {
    try {
      if (user.hydrationStatus().state === 'hydrating') {
        phase.value = 'restoring';
        // Terminal for this login — hydration only settles from here.
        stopPhasePoll();
      }
    } catch {
      stopPhasePoll();
    }
  }, 200);
}

function stopPhasePoll() {
  if (phasePoll) {
    clearInterval(phasePoll);
    phasePoll = null;
  }
}

onUnmounted(stopPhasePoll);

async function handleLogin() {
  if (!identifier.value || !password.value) {
    return;
  }

  submitting.value = true;
  loginError.value = '';
  phase.value = 'authenticating';

  try {
    log('Starting login attempt');
    log(`Login attempt for identifier: ${identifier.value}`);

    const user = await getCurrentUser();
    if (!user) throw new Error('[Login] no user instance');
    log('Got User instance, attempting login');

    // Couch _session authenticates by username only. When the identifier is an
    // email, resolve it to the account username first — server-side and gated
    // on the correct password, so it can't enumerate accounts. A plain username
    // passes straight through.
    let loginName = identifier.value;
    if (identifier.value.includes('@')) {
      const resolved = await resolveLoginIdentifier(identifier.value, password.value);
      if (!resolved.ok || !resolved.username) {
        log('Email identifier did not resolve (bad credentials)');
        loginError.value = 'Username or password was incorrect.';
        return;
      }
      loginName = resolved.username;
    }

    watchForHydration(user);
    const loginResult = await user.login(loginName, password.value);

    if (!loginResult.ok) {
      log('Login attempt failed - incorrect credentials');
      loginError.value = 'Username or password was incorrect.';
      return;
    }

    log('Login successful');

    // load user config
    log('Initializing user config');
    configStore.init();
    log('User config initialized');

    // set login state
    log('Setting authentication state');
    authStore.loginAndRegistration.loggedIn = true;
    log(`Authentication state set, redirecting to ${redirectTarget.value}`);

    router.push(redirectTarget.value);
    log('Login and redirect complete');
  } catch (e) {
    log('Login attempt failed with exception');
    log(`Login error details: ${JSON.stringify(e)}`);
    console.error('Login error:', e);
    loginError.value = 'An error occurred. Please try again.';
  } finally {
    stopPhasePoll();
    submitting.value = false;
  }
}
</script>

<style scoped>
.v-card {
  border-radius: 8px;
}
</style>
