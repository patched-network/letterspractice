<template>
  <v-container class="py-8">
    <v-row justify="center">
      <v-col cols="12" md="8" lg="6">
        <!-- Not Logged In -->
        <v-card v-if="!authStore.isLoggedIn" elevation="2">
          <v-card-title class="text-h5">Account</v-card-title>
          <v-card-text>
            <v-alert type="info" variant="tonal" class="mb-4">
              Please log in to view your account settings.
            </v-alert>
            <v-btn color="primary" @click="goToLogin" block>
              Go to Login
            </v-btn>
          </v-card-text>
        </v-card>

        <!-- Logged In -->
        <v-card v-else elevation="2">
          <v-card-title class="text-h5 d-flex align-center">
            <v-icon start>mdi-account-circle</v-icon>
            Account
          </v-card-title>

          <v-card-text>
            <!-- Account Info Section -->
            <div class="mb-6">
              <div class="mb-3">
                <div class="text-body-2 text-medium-emphasis mb-1">Username</div>
                <div class="text-h6">{{ username }}</div>
              </div>

              <div class="mb-3">
                <div class="text-body-2 text-medium-emphasis mb-1">Email</div>

                <!-- Existing email on file -->
                <div v-if="email && !editingEmail">
                  <div class="d-flex align-center">
                    <span class="text-body-1 mr-2">{{ email }}</span>
                    <v-chip
                      v-if="accountStatus === 'verified'"
                      color="success"
                      size="small"
                      variant="tonal"
                    >
                      Verified
                    </v-chip>
                    <v-chip
                      v-else-if="accountStatus === 'pending_verification'"
                      color="warning"
                      size="small"
                      variant="tonal"
                    >
                      Pending Verification
                    </v-chip>
                    <v-chip
                      v-else
                      color="error"
                      size="small"
                      variant="tonal"
                    >
                      Verification Status Unknown
                    </v-chip>
                  </div>
                  <!-- Escape hatch for a typo'd, unverified address: the
                       verification link went to the wrong inbox, so resending
                       is futile — let them correct it. -->
                  <v-btn
                    v-if="accountStatus === 'pending_verification'"
                    variant="text"
                    size="small"
                    color="primary"
                    class="px-1 mt-1"
                    @click="startEditingEmail"
                  >
                    Wrong address? Change it
                  </v-btn>
                </div>

                <!-- No email on file (legacy accounts), or correcting a typo -->
                <div v-else>
                  <div class="d-flex align-center" style="gap: 8px">
                    <v-text-field
                      v-model="newEmail"
                      type="email"
                      placeholder="you@example.com"
                      density="compact"
                      hide-details
                      variant="outlined"
                      style="max-width: 320px"
                      @keyup.enter="saveEmail"
                    />
                    <v-btn
                      color="primary"
                      size="small"
                      :loading="savingEmail"
                      :disabled="!isValidNewEmail"
                      @click="saveEmail"
                    >
                      {{ editingEmail ? 'Save' : 'Add Email' }}
                    </v-btn>
                    <v-btn
                      v-if="editingEmail"
                      variant="text"
                      size="small"
                      :disabled="savingEmail"
                      @click="cancelEditingEmail"
                    >
                      Cancel
                    </v-btn>
                  </div>
                  <div class="text-caption text-medium-emphasis mt-1">
                    Add an email to enable password reset and account recovery.
                    We'll send a verification link to confirm it.
                  </div>
                </div>
              </div>
            </div>

            <!-- Access: only where this deployment sells access (src/entitlement/). -->
            <template v-if="sellsAccess">
            <v-divider class="my-6"></v-divider>

            <div class="mb-6">
              <h3 class="text-h6 mb-3">Access</h3>

              <!-- Free-tier account. Reports position against the word ceiling
                   rather than a countdown — there is no clock to report. -->
              <v-alert v-if="!hasPremiumAccess" type="info" variant="tonal" class="mb-3">
                <div class="text-body-1 mb-2">
                  <template v-if="atWordCeiling">
                    Your child can sound out <strong>{{ wordCountLabel }} words</strong> —
                    the whole free tier. Those stay yours for good.
                  </template>
                  <template v-else>
                    Free access: <strong>{{ wordCountLabel }}</strong> of
                    {{ wordThresholdLabel }} words so far.
                  </template>
                </div>
                <div v-if="offer" class="text-body-2">
                  Lifetime access unlocks every letter, lesson and word after that —
                  {{ offer.price }}, once.
                </div>
              </v-alert>

              <!-- Premium Account -->
              <v-alert v-else type="success" variant="tonal" class="mb-3">
                <div class="text-body-1">
                  🎉 You have <strong>lifetime access</strong> to the LettersPractice course.
                </div>
              </v-alert>

              <!-- No offer (e.g. the Play Store app, which sells nothing): no buy
                   button, no gifts. -->
              <v-btn
                v-if="!hasPremiumAccess && offer"
                color="primary"
                :to="offer.path"
                prepend-icon="mdi-arrow-right"
                block
                size="large"
              >
                Get Lifetime Access - {{ offer.price }}
              </v-btn>
            </div>
            </template>

            <!--
              Gifting is offered to owners only. A free-tier account hasn't
              bought its own copy yet, so a gift prompt here would compete with
              the primary conversion — and the member half-price can't apply to
              them anyway (the discount is gated on holding a paid entitlement).

              No price shown: the base price is a flat 20 across USD/CAD/AUD/EUR,
              so a hardcoded "$10" is wrong for a euro buyer. /gift quotes the
              authoritative figure, server-side.
            -->
            <template v-if="hasPremiumAccess && offer?.giftPath">
              <v-divider class="my-6"></v-divider>

              <div class="mb-6">
                <h3 class="text-h6 mb-3">Give LettersPractice</h3>

                <!-- "have lifetime access", not "own it": hasPremiumAccess is
                     source-agnostic, so gift recipients land here too. -->
                <div class="text-body-2 text-medium-emphasis mb-3">
                  Because you have lifetime access, gifts are <strong>half price</strong>.
                  We'll email each recipient a link to claim their own — and send you
                  the same links, so you can pass one along yourself.
                </div>

                <v-btn
                  color="primary"
                  variant="tonal"
                  :to="offer.giftPath"
                  prepend-icon="mdi-gift"
                  block
                  size="large"
                >
                  Gift a copy
                </v-btn>
              </div>
            </template>

            <v-divider class="my-6"></v-divider>

            <!-- Study Preferences Section -->
            <div class="mb-6">
              <h3 class="text-h6 mb-3">Study Preferences</h3>

              <div class="mb-2 text-body-2 text-medium-emphasis">Session length</div>
              <v-radio-group
                v-model="sessionLengthMode"
                hide-details
                density="compact"
                @update:model-value="updateSessionLengthMode"
              >
                <v-radio label="Auto (age-based)" value="auto" />
                <v-radio label="Manual" value="manual" />
              </v-radio-group>

              <p class="text-caption text-medium-emphasis mt-1 mb-3">
                <template v-if="sessionLengthMode === 'auto'">
                  Sessions start at {{ MIN_SESSION_MINUTES }} min and grow with
                  your child's age. Current target:
                  <strong>{{ autoSessionLabel }}</strong>.
                </template>
                <template v-else>
                  Override the automatic schedule with a fixed session length.
                </template>
              </p>

              <v-slider
                v-if="sessionLengthMode === 'manual'"
                v-model="sessionTimeLimit"
                label="Session Time Limit (minutes)"
                :min="MIN_SESSION_MINUTES"
                :max="MAX_SESSION_MINUTES"
                :step="0.5"
                thumb-label="always"
                hide-details
                class="mt-2"
                @update:model-value="updateSessionTimeLimit"
              >
                <template #append>
                  <v-text-field
                    v-model.number="sessionTimeLimit"
                    type="number"
                    style="width: 80px"
                    density="compact"
                    hide-details
                    variant="outlined"
                    :min="MIN_SESSION_MINUTES"
                    :max="MAX_SESSION_MINUTES"
                    :step="0.5"
                    @update:model-value="updateSessionTimeLimit"
                  />
                </template>
              </v-slider>
            </div>

            <v-divider class="my-6"></v-divider>

            <!-- Email Preferences Section -->
            <div class="mb-6">
              <h3 class="text-h6 mb-3">Email preferences</h3>

              <div v-if="!email" class="text-body-2 text-medium-emphasis">
                Add an email above to manage what we send you.
              </div>
              <template v-else>
                <v-switch
                  v-model="prefBroadcast"
                  :loading="prefsLoading || prefsSaving === 'broadcast'"
                  :disabled="prefsLoading || prefsSaving !== null"
                  color="primary"
                  density="compact"
                  hide-details
                  inset
                  @update:model-value="(v: boolean | null) => setEmailPref('broadcast', !!v)"
                >
                  <template #label>
                    <div>
                      <div class="text-body-1">Product updates</div>
                      <div class="text-caption text-medium-emphasis">
                        Occasional news and updates about LettersPractice.
                      </div>
                    </div>
                  </template>
                </v-switch>

                <v-switch
                  v-model="prefNudge"
                  :loading="prefsLoading || prefsSaving === 'nudge'"
                  :disabled="prefsLoading || prefsSaving !== null"
                  color="primary"
                  density="compact"
                  hide-details
                  inset
                  @update:model-value="(v: boolean | null) => setEmailPref('nudge', !!v)"
                >
                  <template #label>
                    <div>
                      <div class="text-body-1">Practice reminders</div>
                      <div class="text-caption text-medium-emphasis">
                        Gentle nudges when it's been a while since a session.
                      </div>
                    </div>
                  </template>
                </v-switch>

                <div class="text-caption text-medium-emphasis mt-2">
                  Sign-in links and receipts are always sent regardless of these settings.
                </div>
              </template>
            </div>

            <v-divider class="my-6"></v-divider>

            <!-- Security Section -->
            <div class="mb-6">
              <h3 class="text-h6 mb-3">Security</h3>

              <!-- Password Reset -->
              <div class="d-flex align-center justify-space-between mb-4">
                <div>
                  <template v-if="hasGoogleSignIn">
                    <div class="text-body-1">Set a password</div>
                    <div class="text-body-2 text-medium-emphasis">
                      You're signed in to LettersPractice with your Google account
                      <span v-if="email">({{ email }})</span>. A password lets you log in on
                      other devices where your Google account isn't available.
                    </div>
                  </template>
                  <template v-else>
                    <div class="text-body-1">Password</div>
                    <div class="text-body-2 text-medium-emphasis">
                      Change your account password
                    </div>
                  </template>
                </div>
                <v-btn
                  variant="outlined"
                  size="small"
                  @click="requestPasswordReset"
                  :loading="resettingPassword"
                  :disabled="!email || accountStatus === 'unknown'"
                >
                  Reset Password
                </v-btn>
              </div>

              <!-- Email Verification (shown when pending) -->
              <div v-if="accountStatus === 'pending_verification'" class="d-flex align-center justify-space-between">
                <div>
                  <div class="text-body-1">Email Verification</div>
                  <div class="text-body-2 text-medium-emphasis">
                    Resend verification email to {{ email }}
                  </div>
                </div>
                <v-btn
                  variant="outlined"
                  size="small"
                  color="primary"
                  @click="resendVerification"
                  :loading="resendingVerification"
                  :disabled="!email"
                >
                  Resend Verification
                </v-btn>
              </div>
            </div>

            <v-divider class="my-6"></v-divider>

            <!-- Logout -->
            <div>
              <v-btn color="error" @click="logout" prepend-icon="mdi-logout" block>
                Logout
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Password Reset Snackbar -->
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.text }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore, useEntitlements, useConfigStore } from '@vue-skuilder/common-ui';
import { requestPasswordReset as sendPasswordResetEmail, getUserStatus, sendVerificationEmail } from '@vue-skuilder/common-ui';
import { getDataLayer } from '@vue-skuilder/db';
import { useOnboardingStore } from '../stores/onboarding';
import { useSessionTracker } from '../stores/sessionTracker';
import { ENTITLEMENT_COURSE_ID } from '../services/courseEntitlement';
import { getReachableWordCount, getSessionLengthMode, setSessionLengthMode } from '../services/userState';
import { entitlement, sellOffer } from '../entitlement';
import { fetchLinkedProviders } from '../services/usersDb';
import {
  computeAutoSessionMinutes,
  getCurrentAgeYears,
  MIN_SESSION_MINUTES,
  MAX_SESSION_MINUTES,
  CONVERGENCE_SESSIONS,
  type SessionLengthMode,
} from '../services/sessionLengthPolicy';

const router = useRouter();
const authStore = useAuthStore();
const configStore = useConfigStore();
const onboardingStore = useOnboardingStore();
const sessionTracker = useSessionTracker();

// Study preferences state
const sessionTimeLimit = ref<number>(MIN_SESSION_MINUTES);
const sessionLengthMode = ref<SessionLengthMode>('auto');

const autoSessionMinutes = computed(() =>
  computeAutoSessionMinutes(
    getCurrentAgeYears(
      onboardingStore.data.childAge,
      onboardingStore.data.completedAt,
    ),
    sessionTracker.studySessionCount,
  ),
);

const autoSessionLabel = computed(() => {
  const totalSeconds = Math.round(autoSessionMinutes.value * 60);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const minPart = `${mins} ${mins === 1 ? 'min' : 'mins'}`;
  if (secs === 0) return minPart;
  return `${minPart} ${secs} ${secs === 1 ? 'second' : 'seconds'}`;
});

const updateSessionTimeLimit = async (value: number | string) => {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(n)) return;
  sessionTimeLimit.value = n;
  await configStore.updateSessionTimeLimit(n);
};

const updateSessionLengthMode = async (value: SessionLengthMode) => {
  sessionLengthMode.value = value;
  await setSessionLengthMode(value);
};

// Entitlements management using shared composable
const { hasPremiumAccess, fetchEntitlements, loading: entitlementsLoading } = useEntitlements(ENTITLEMENT_COURSE_ID);
/** This deployment sells access at all (shows the Access panel). */
const sellsAccess = entitlement.offer !== null;
/** What can be bought here: null in the Play Store app, which sells nothing. */
const offer = sellOffer();

const username = ref<string>('');
const email = ref<string>('');
const accountStatus = ref<string>('pending_verification');
const resettingPassword = ref(false);
// Google-linked accounts carry a random password the owner never saw, so the
// password row offers to *set* one rather than change it.
const hasGoogleSignIn = ref(false);
const resendingVerification = ref(false);

// Email entry for legacy accounts with no email on file
const newEmail = ref<string>('');
const savingEmail = ref(false);
const editingEmail = ref(false);
const isValidNewEmail = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.value.trim()));

// Free-tier position, in words. Replaces the trial's days-remaining readout:
// the boundary is an achievement, so there is nothing to count down.
const wordCount = ref<number>(0);
const wordCountLabel = computed(() => wordCount.value.toLocaleString());
// The Access panel only renders when this deployment sells access, so a
// ceiling is there whenever these are read.
const wordLimit = entitlement.wordLimit ?? Infinity;
const wordThresholdLabel = wordLimit.toLocaleString();
const atWordCeiling = computed(() => wordCount.value >= wordLimit);

// Email preferences (broadcast / nudge opt-out). Backed by the self-serve
// /backend/lifecycle/preferences endpoint, which authenticates via the couch
// session cookie (credentials: 'include') and only ever touches this account's
// own email.
const prefBroadcast = ref(false);
const prefNudge = ref(true);
const prefsLoading = ref(false);
const prefsSaving = ref<'broadcast' | 'nudge' | null>(null);

async function loadEmailPrefs(): Promise<void> {
  prefsLoading.value = true;
  try {
    const res = await fetch('/backend/lifecycle/preferences', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.hasEmail) {
      prefBroadcast.value = !!data.broadcast;
      prefNudge.value = !!data.nudge;
    }
  } catch (e) {
    console.warn('Failed to load email preferences:', e);
  } finally {
    prefsLoading.value = false;
  }
}

async function setEmailPref(category: 'broadcast' | 'nudge', enabled: boolean): Promise<void> {
  prefsSaving.value = category;
  try {
    const res = await fetch('/backend/lifecycle/preferences', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ category, enabled }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Trust the server's post-write state (handles e.g. broadcast requiring a
    // list doc) rather than the optimistic toggle value.
    prefBroadcast.value = !!data.broadcast;
    prefNudge.value = !!data.nudge;
    snackbar.value = { show: true, text: 'Preferences updated', color: 'success' };
  } catch (e) {
    // Revert the optimistic switch and tell the user.
    await loadEmailPrefs();
    snackbar.value = {
      show: true,
      text: 'Could not update preferences. Please try again.',
      color: 'error',
    };
  } finally {
    prefsSaving.value = null;
  }
}

const snackbar = ref({
  show: false,
  text: '',
  color: 'success',
});

onMounted(async () => {
  // Hydrate study preferences regardless of login state (funnel users too).
  try {
    await configStore.hydrate();
    sessionTimeLimit.value = configStore.config.sessionTimeLimit;
    sessionLengthMode.value = await getSessionLengthMode();
    await sessionTracker.ensureCurrent();
  } catch (e) {
    console.warn('Failed to hydrate study preferences:', e);
  }

  if (authStore.isLoggedIn) {
    try {
      const user = getDataLayer().getUserDB();
      username.value = user.getUsername();
      fetchLinkedProviders(username.value).then((providers) => {
        hasGoogleSignIn.value = providers.includes('google');
      });

      // Fetch entitlements (includes email, status, and trial info)
      await fetchEntitlements();

      // Get email and account status from backend
      const statusResult = await getUserStatus();
      if (statusResult.ok) {
        email.value = statusResult.email || '';
        accountStatus.value = statusResult.status || 'pending_verification';

        // Free-tier position, for the access panel.
        wordCount.value = await getReachableWordCount();

        // Load email preferences now that we know an email is on file.
        if (email.value) await loadEmailPrefs();
      } else {
        // Status fetch failed. The email lives on the _users doc, which we
        // couldn't read here — leave it blank rather than surfacing a stale
        // copy. (The former CONFIG.email fallback has been retired.)
        email.value = '';
        accountStatus.value = 'unknown';
        console.warn('Failed to fetch user status:', statusResult.error);
      }
    } catch (e) {
      console.error('Error loading account info:', e);
      accountStatus.value = 'unknown'; // Set unknown on exception
    }
  }
});

function goToLogin() {
  router.push('/login');
}

async function logout() {
  try {
    const user = getDataLayer().getUserDB();
    await user.logout();
    authStore.loginAndRegistration.loggedIn = false;
    router.push('/');
  } catch (e) {
    console.error('Logout error:', e);
  }
}

function startEditingEmail() {
  newEmail.value = email.value;
  editingEmail.value = true;
}

function cancelEditingEmail() {
  editingEmail.value = false;
  newEmail.value = '';
}

async function saveEmail() {
  const addr = newEmail.value.trim();
  if (!isValidNewEmail.value) {
    snackbar.value = {
      show: true,
      text: 'Please enter a valid email address',
      color: 'error',
    };
    return;
  }

  savingEmail.value = true;
  try {
    const origin = window.location.origin;
    // send-verification persists the email to the _users doc when none exists,
    // and sends the verification link in one shot.
    const result = await sendVerificationEmail(username.value, addr, origin);

    if (result.ok) {
      email.value = addr;
      accountStatus.value = 'pending_verification';
      newEmail.value = '';
      editingEmail.value = false;
      snackbar.value = {
        show: true,
        text: 'Email saved! Check your inbox for a verification link.',
        color: 'success',
      };
    } else {
      snackbar.value = {
        show: true,
        text: result.error || 'Failed to save email',
        color: 'error',
      };
    }
  } catch (e) {
    snackbar.value = {
      show: true,
      text: 'An error occurred. Please try again.',
      color: 'error',
    };
  } finally {
    savingEmail.value = false;
  }
}

async function requestPasswordReset() {
  if (!email.value) {
    snackbar.value = {
      show: true,
      text: 'No email address found for this account',
      color: 'error',
    };
    return;
  }

  resettingPassword.value = true;
  try {
    const origin = window.location.origin;
    const result = await sendPasswordResetEmail(email.value, origin);

    if (result.ok) {
      snackbar.value = {
        show: true,
        text: 'Password reset email sent! Check your inbox.',
        color: 'success',
      };
    } else {
      snackbar.value = {
        show: true,
        text: result.error || 'Failed to send reset email',
        color: 'error',
      };
    }
  } catch (e) {
    snackbar.value = {
      show: true,
      text: 'An error occurred. Please try again.',
      color: 'error',
    };
  } finally {
    resettingPassword.value = false;
  }
}

async function resendVerification() {
  if (!email.value) {
    snackbar.value = {
      show: true,
      text: 'No email address found for this account',
      color: 'error',
    };
    return;
  }

  resendingVerification.value = true;
  try {
    const origin = window.location.origin;
    const result = await sendVerificationEmail(username.value, email.value, origin);

    if (result.ok) {
      snackbar.value = {
        show: true,
        text: 'Verification email sent! Check your inbox.',
        color: 'success',
      };
    } else {
      snackbar.value = {
        show: true,
        text: result.error || 'Failed to send verification email',
        color: 'error',
      };
    }
  } catch (e) {
    snackbar.value = {
      show: true,
      text: 'An error occurred. Please try again.',
      color: 'error',
    };
  } finally {
    resendingVerification.value = false;
  }
}
</script>

<style scoped>
.v-card {
  border-radius: 8px;
}
</style>
