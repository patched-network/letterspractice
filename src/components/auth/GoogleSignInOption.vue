<template>
  <div v-if="available" class="mb-3">
    <GoogleSignInButton :text="text" @credential="onCredential" @available="available = $event" />

    <p v-if="pending" class="text-caption text-center text-medium-emphasis mt-2" aria-live="polite">
      Signing in with Google…
    </p>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">
      {{ error }}
      <router-link v-if="failure === 'use_password'" to="/request-reset" class="ml-1">
        Forgot password?
      </router-link>
    </v-alert>

    <div class="d-flex align-center mt-4">
      <v-divider />
      <span class="text-caption text-medium-emphasis mx-3">or</span>
      <v-divider />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import GoogleSignInButton from './GoogleSignInButton.vue';
import { useGoogleSignIn } from '../../composables/useGoogleSignIn';
import type { PostSignupOptions } from '../../services/postSignup';

/**
 * "Continue with Google" + an "or" divider, above a page's password form.
 * Collapses to nothing when Google sign-in is unavailable (no client id, GIS
 * blocked), leaving the password form as if this weren't here.
 */
const props = defineProps<{
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  redirect?: string;
  postSignup?: () => Omit<PostSignupOptions, 'username' | 'method'>;
}>();

const emit = defineEmits<{ (e: 'pending', pending: boolean): void }>();

// Optimistic until the button reports otherwise, so it can mount and try.
const available = ref(true);

const { pending, error, failure, onCredential } = useGoogleSignIn({
  redirect: () => props.redirect ?? '/study',
  postSignup: props.postSignup,
});

watch(pending, (p) => emit('pending', p));
</script>
