<template>
  <v-container class="d-flex align-center justify-center" style="min-height: 80vh">
    <v-row justify="center">
      <v-col cols="12" sm="8" md="6" lg="5">
        <v-card elevation="2">
          <v-card-title class="text-center text-h5 py-4">
            Email Verification
          </v-card-title>

          <v-card-text class="text-center">
            <!-- Loading State -->
            <div v-if="state === 'loading'" class="py-6">
              <v-progress-circular
                indeterminate
                color="primary"
                size="64"
                class="mb-4"
              ></v-progress-circular>
              <p class="text-body-1">Verifying your email address...</p>
            </div>

            <!-- Success State -->
            <div v-else-if="state === 'success'" class="py-6">
              <v-icon color="success" size="64" class="mb-4">
                mdi-check-circle-outline
              </v-icon>
              <h2 class="text-h6 mb-2">Verification Successful!</h2>
              <p class="text-body-1 mb-6">
                Welcome, <strong>{{ username }}</strong>! Your email has been verified.
              </p>
              <v-btn
                color="primary"
                size="large"
                block
                class="mb-3"
                prepend-icon="mdi-book-open-page-variant"
                @click="goToStudy"
              >
                Start practicing
              </v-btn>
              <v-btn variant="outlined" block @click="goToAccount">
                Go to my account
              </v-btn>
            </div>

            <!-- Error State -->
            <div v-else-if="state === 'error'" class="py-6">
              <v-icon color="error" size="64" class="mb-4">
                mdi-alert-circle-outline
              </v-icon>
              <h2 class="text-h6 mb-2">Verification Link Invalid</h2>
              <p class="text-body-1 mb-4">
                This verification link is invalid or has expired. Please check your email for the most recent verification link.
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
              <div class="d-flex">
                <v-btn color="primary" @click="copyErrorDetails" prepend-icon="mdi-content-copy" class="mr-2">
                  Copy Error Details
                </v-btn>
                <v-btn variant="outlined" @click="goToLogin">
                  Go to Login
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
                No verification token found. Please check your email and click the verification link.
              </p>
              <v-btn color="primary" @click="goToLogin">
                Go to Login
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
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { verifyEmail } from '@vue-skuilder/common-ui';

const route = useRoute();
const router = useRouter();

type State = 'loading' | 'success' | 'error' | 'no-token';

const state = ref<State>('loading');
const username = ref<string>('');
const errorMessage = ref<string>('');
const errorDetails = ref<string>('');

onMounted(async () => {
  // Extract token from query params
  const token = route.query.token as string | undefined;

  if (!token) {
    state.value = 'no-token';
    return;
  }

  // Call verification API
  try {
    const result = await verifyEmail(token);

    if (result.ok && result.username) {
      state.value = 'success';
      username.value = result.username;
    } else {
      state.value = 'error';
      errorMessage.value = result.error || 'Unknown verification error';
      errorDetails.value = formatErrorDetails(token, result.error);
    }
  } catch (error) {
    state.value = 'error';
    const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred';
    errorMessage.value = errorMsg;
    errorDetails.value = formatErrorDetails(token, errorMsg);
  }
});

function formatErrorDetails(token: string, error?: string): string {
  const timestamp = new Date().toISOString();
  const tokenPreview = token ? `${token.substring(0, 16)}...` : 'none';
  return `Timestamp: ${timestamp}\nToken: ${tokenPreview}\nError: ${error || 'Unknown error'}`;
}

async function copyErrorDetails() {
  try {
    await navigator.clipboard.writeText(errorDetails.value);
    // Could add a snackbar notification here if desired
  } catch (e) {
    console.error('Failed to copy error details:', e);
  }
}

function goToLogin() {
  router.push('/login');
}

function goToStudy() {
  router.push('/study');
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
