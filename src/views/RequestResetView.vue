<template>
  <v-container class="d-flex align-center justify-center" style="min-height: 80vh">
    <v-row justify="center">
      <v-col cols="12" sm="8" md="6" lg="5">
        <v-card elevation="2">
          <v-card-title class="text-center text-h5 py-4">
            Reset Password
          </v-card-title>

          <v-card-text>
            <!-- Form State -->
            <div v-if="state === 'form'" class="py-4">
              <p class="text-body-1 mb-4">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              <v-form @submit.prevent="handleSubmit">
                <v-text-field
                  v-model="email"
                  type="email"
                  label="Email Address"
                  variant="outlined"
                  density="comfortable"
                  class="mb-3"
                  :disabled="submitting"
                  :error-messages="emailError"
                  required
                ></v-text-field>

                <v-btn
                  type="submit"
                  color="primary"
                  block
                  size="large"
                  :loading="submitting"
                  :disabled="!email"
                >
                  Send Reset Link
                </v-btn>

                <div class="text-center mt-4">
                  <router-link to="/login" class="text-decoration-none">
                    Back to Login
                  </router-link>
                </div>
              </v-form>
            </div>

            <!-- Success State -->
            <div v-else-if="state === 'success'" class="py-6 text-center">
              <v-icon color="success" size="64" class="mb-4">
                mdi-email-check-outline
              </v-icon>
              <h2 class="text-h6 mb-2">Check Your Email</h2>
              <p class="text-body-1 mb-4">
                If an account exists with <strong>{{ email }}</strong>, you'll receive a password reset link shortly.
              </p>
              <p class="text-body-2 text-medium-emphasis mb-4">
                The link will expire in 1 hour.
              </p>
              <v-btn color="primary" to="/dbg/auth">
                Back to Login
              </v-btn>
            </div>

            <!-- Error State -->
            <div v-else-if="state === 'error'" class="py-6 text-center">
              <v-icon color="error" size="64" class="mb-4">
                mdi-alert-circle-outline
              </v-icon>
              <h2 class="text-h6 mb-2">Error</h2>
              <p class="text-body-1 mb-4">
                {{ errorMessage }}
              </p>
              <p v-if="SUPPORT_EMAIL" class="text-body-2 text-medium-emphasis mb-4">
                If this problem persists, please contact us at
                <a :href="`mailto:${SUPPORT_EMAIL}`">{{ SUPPORT_EMAIL }}</a>
              </p>
              <v-btn color="primary" @click="state = 'form'">
                Try Again
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
import { ref } from 'vue';
import { requestPasswordReset } from '@vue-skuilder/common-ui';

type State = 'form' | 'success' | 'error';

const state = ref<State>('form');
const email = ref<string>('');
const emailError = ref<string>('');
const submitting = ref(false);
const errorMessage = ref<string>('');

async function handleSubmit() {
  if (!email.value) {
    emailError.value = 'Email is required';
    return;
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.value)) {
    emailError.value = 'Please enter a valid email address';
    return;
  }

  emailError.value = '';
  submitting.value = true;

  try {
    const origin = window.location.origin;
    const result = await requestPasswordReset(email.value, origin);

    if (result.ok) {
      state.value = 'success';
    } else {
      state.value = 'error';
      errorMessage.value = result.error || 'Failed to send password reset email';
    }
  } catch (error) {
    state.value = 'error';
    errorMessage.value = error instanceof Error ? error.message : 'An unexpected error occurred';
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
