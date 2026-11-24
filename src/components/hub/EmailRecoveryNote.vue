<!--
  EmailRecoveryNote — the hub's quiet reminder to confirm (or add) the
  account's email, which is what makes password reset possible. One muted
  line at the foot of the hub: the parent finds it, the child's choices
  above stay uncluttered. When it shows: services/emailNote.ts.
-->
<template>
  <p class="email-note text-caption">
    <template v-if="email">
      We emailed a link to <strong>{{ email }}</strong>. Clicking it lets you reset your password
      if you ever need to.
      <button
        type="button"
        class="email-note__action"
        :disabled="resend === 'sending' || resend === 'sent'"
        @click="doResend"
      >
        {{ resendLabel }}
      </button>
      <span class="email-note__sep">·</span>
      <router-link to="/account" class="email-note__action">Change</router-link>
    </template>
    <template v-else>
      Add an email so you can reset your password if you ever need to.
      <router-link to="/account" class="email-note__action">Add email</router-link>
    </template>
    <button type="button" class="email-note__hide" aria-label="Hide for now" @click="emit('hide')">✕</button>
  </p>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { sendVerificationEmail } from '@vue-skuilder/common-ui';

const props = defineProps<{
  username: string;
  email: string | null;
}>();

const emit = defineEmits<{ hide: [] }>();

const resend = ref<'idle' | 'sending' | 'sent' | 'failed'>('idle');

const resendLabel = computed(
  () =>
    ({
      idle: 'Resend',
      sending: 'Sending…',
      sent: 'Sent ✓',
      failed: "Couldn't send. Try again",
    })[resend.value],
);

async function doResend() {
  if (!props.email) return;
  resend.value = 'sending';
  try {
    const result = await sendVerificationEmail(props.username, props.email, window.location.origin);
    resend.value = result.ok ? 'sent' : 'failed';
  } catch {
    resend.value = 'failed';
  }
}
</script>

<style scoped>
.email-note {
  max-width: 480px;
  margin: 32px auto 0;
  padding: 0 8px;
  text-align: center;
  line-height: 1.5;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.email-note strong {
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.75);
  overflow-wrap: anywhere;
}

.email-note__action {
  margin-left: 4px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: rgb(var(--v-theme-primary));
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.email-note__action:disabled {
  color: inherit;
  text-decoration: none;
  cursor: default;
}

.email-note__sep {
  margin-left: 4px;
}

.email-note__hide {
  margin-left: 8px;
  padding: 0 4px;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  opacity: 0.7;
}

.email-note__hide:hover {
  opacity: 1;
}
</style>
