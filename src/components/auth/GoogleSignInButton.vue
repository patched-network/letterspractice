<template>
  <!--
    Renders nothing until GIS has loaded, and nothing at all if it can't (no
    client id, blocked script): the password form below it is always the
    fallback. In in-app browsers, where Google refuses to sign in, it shows a
    hint instead of a button that would fail.
  -->
  <div v-if="inApp" class="text-body-2 text-medium-emphasis text-center mb-1">
    For Google sign-in, open this page in your browser
    <span class="text-no-wrap">(⋯ → Open in browser).</span>
  </div>
  <div v-else-if="clientId" v-show="ready" ref="buttonHost" class="google-button-host"></div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { loadGoogleIdentity } from '../../services/gisLoader';
import { isInAppBrowser } from '../../services/inAppBrowser';

const props = withDefaults(
  defineProps<{ text?: 'signin_with' | 'signup_with' | 'continue_with' }>(),
  { text: 'continue_with' },
);

const emit = defineEmits<{
  (e: 'credential', credential: string): void;
  /** Whether a Google option (button or in-app hint) is showing. */
  (e: 'available', available: boolean): void;
}>();

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const inApp = isInAppBrowser();
const buttonHost = ref<HTMLElement | null>(null);
const ready = ref(false);

/** GIS renders a fixed-width iframe; its limits are 200–400px. */
function buttonWidth(): number {
  const w = buttonHost.value?.clientWidth || 400;
  return Math.max(200, Math.min(400, Math.floor(w)));
}

onMounted(async () => {
  if (inApp) {
    emit('available', true);
    return;
  }
  if (!clientId) {
    emit('available', false);
    return;
  }

  const gis = await loadGoogleIdentity();
  if (!gis || !buttonHost.value) {
    emit('available', false);
    return;
  }

  try {
    gis.initialize({
      client_id: clientId,
      ux_mode: 'popup',
      callback: (response) => {
        if (response.credential) emit('credential', response.credential);
      },
    });
    // Measure while visible: v-show hides the host until the button exists.
    ready.value = true;
    await nextTick();
    gis.renderButton(buttonHost.value, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      logo_alignment: 'center',
      text: props.text,
      width: buttonWidth(),
    });
    emit('available', true);
  } catch (err) {
    console.warn('[GoogleSignInButton] GIS render failed:', err);
    ready.value = false;
    emit('available', false);
  }
});
</script>

<style scoped>
.google-button-host {
  display: flex;
  justify-content: center;
  min-height: 44px;
}
</style>
