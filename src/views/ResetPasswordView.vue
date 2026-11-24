<template>
  <v-container class="d-flex align-center justify-center" style="min-height: 80vh">
    <v-row justify="center">
      <v-col cols="12" sm="8" md="6" lg="5">
        <v-card elevation="2">
          <v-card-title class="text-center text-h5 py-4">
            Reset Password
          </v-card-title>

          <v-card-text class="text-center">
            <!-- Form State -->
            <div v-if="state === 'form'" class="py-6 text-left">
              <p class="text-body-1 mb-4 text-center">
                Enter your new password below.
              </p>

              <v-form @submit.prevent="handleSubmit">
                <v-text-field
                  v-model="newPassword"
                  type="password"
                  label="New Password"
                  variant="outlined"
                  density="comfortable"
                  class="mb-3"
                  :disabled="submitting"
                  :error-messages="passwordError ? [passwordError] : []"
                  autocomplete="new-password"
                  required
                ></v-text-field>

                <v-text-field
                  v-model="confirmPassword"
                  type="password"
                  label="Confirm Password"
                  variant="outlined"
                  density="comfortable"
                  class="mb-3"
                  :disabled="submitting"
                  :error-messages="passwordMismatch ? ['Passwords do not match'] : []"
                  autocomplete="new-password"
                  required
                ></v-text-field>

                <v-btn
                  type="submit"
                  color="primary"
                  block
                  size="large"
                  :loading="submitting"
                  :disabled="!newPassword || !confirmPassword || !!passwordError || passwordMismatch"
                >
                  Reset Password
                </v-btn>
              </v-form>
            </div>

            <!-- Success State -->
            <div v-else-if="state === 'success'" class="py-6">
              <v-icon color="success" size="64" class="mb-4">
                mdi-check-circle-outline
              </v-icon>
              <h2 class="text-h6 mb-2">Password Reset Successful!</h2>
              <p class="text-body-1 mb-4">
                Your password has been updated. You can now log in with your new password.
              </p>
              <p class="text-body-2 text-medium-emphasis mb-4">
                Redirecting to login in {{ countdown }} seconds...
              </p>
              <v-btn color="primary" @click="goToLogin">
                Go to Login Now
              </v-btn>
            </div>

            <!-- Error State -->
            <div v-else-if="state === 'error'" class="py-6">
              <v-icon color="error" size="64" class="mb-4">
                mdi-alert-circle-outline
              </v-icon>
              <h2 class="text-h6 mb-2">Reset Link Invalid</h2>
              <p class="text-body-1 mb-4">
                This password reset link is invalid or has expired. Please request a new password reset link.
              </p>
              <p v-if="SUPPORT_EMAIL" class="text-body-2 text-medium-emphasis mb-4">
                If you believe this is an error, please contact us at
                <a :href="`mailto:${SUPPORT_EMAIL}`">{{ SUPPORT_EMAIL }}</a>
                and include the error details below.
              </p>
              <v-textarea
                v-model="errorDetails"
                readonly
                rows="3"
                variant="outlined"
                density="compact"
                class="mb-3"
                hide-details
              ></v-textarea>
              <div class="d-flex gap-2">
                <v-btn color="primary" @click="copyErrorDetails" prepend-icon="mdi-content-copy">
                  Copy Error Details
                </v-btn>
                <v-btn variant="outlined" @click="goToAccount">
                  Go to Account
                </v-btn>
              </div>
            </div>

            <!-- Missing Token State -->
            <div v-else-if="state === 'no-token'" class="py-6">
              <v-icon color="warning" size="64" class="mb-4">
                mdi-link-off
              </v-icon>
              <h2 class="text-h6 mb-2">Invalid Link</h2>
              <p class="text-body-1 mb-4">
                No reset token found. Please check your email and click the password reset link.
              </p>
              <v-btn color="primary" @click="goToAccount">
                Go to Account
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { SUPPORT_EMAIL } from '../config/site';
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { resetPassword, validatePassword } from '@vue-skuilder/common-ui';

const route = useRoute();
const router = useRouter();

type State = 'form' | 'success' | 'error' | 'no-token';

const state = ref<State>('form');
const token = ref<string>('');
const newPassword = ref<string>('');
const confirmPassword = ref<string>('');
const submitting = ref(false);
const errorDetails = ref<string>('');
const countdown = ref(3);

const passwordMismatch = computed(() => {
  if (!confirmPassword.value) return false;
  return newPassword.value !== confirmPassword.value;
});

const passwordError = computed(() => {
  return validatePassword(newPassword.value);
});

onMounted(() => {
  // Extract token from query params
  const tokenParam = route.query.token as string | undefined;

  if (!tokenParam) {
    state.value = 'no-token';
    return;
  }

  token.value = tokenParam;
});

async function handleSubmit() {
  if (passwordMismatch.value || !newPassword.value) {
    return;
  }

  submitting.value = true;

  try {
    const result = await resetPassword(token.value, newPassword.value);

    if (result.ok) {
      state.value = 'success';

      // Start countdown and redirect
      const countdownInterval = setInterval(() => {
        countdown.value--;
        if (countdown.value <= 0) {
          clearInterval(countdownInterval);
          router.push('/login');
        }
      }, 1000);
    } else {
      state.value = 'error';
      errorDetails.value = formatErrorDetails(token.value, result.error);
    }
  } catch (error) {
    state.value = 'error';
    const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred';
    errorDetails.value = formatErrorDetails(token.value, errorMsg);
  } finally {
    submitting.value = false;
  }
}

function formatErrorDetails(resetToken: string, error?: string): string {
  const timestamp = new Date().toISOString();
  const tokenPreview = resetToken ? `${resetToken.substring(0, 16)}...` : 'none';
  return `Timestamp: ${timestamp}\nToken: ${tokenPreview}\nError: ${error || 'Unknown error'}`;
}

async function copyErrorDetails() {
  try {
    await navigator.clipboard.writeText(errorDetails.value);
  } catch (e) {
    console.error('Failed to copy error details:', e);
  }
}

function goToLogin() {
  router.push('/login');
}

function goToAccount() {
  router.push('/account');
}
</script>

<style scoped>
.v-card {
  border-radius: 8px;
}
</style>
