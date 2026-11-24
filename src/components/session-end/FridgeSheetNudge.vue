<template>
  <div class="fridge-nudge" :class="{ 'fridge-nudge--compact': compact }">
    <!-- Print: the family hasn't opened the sheet yet -->
    <template v-if="nudge.kind === 'print'">
      <span class="fridge-nudge__text">
        <template v-if="compact">Put the letters on the fridge —</template>
        <template v-else>
          Put the letters on the fridge: a one-page sheet to colour in as each
          letter is earned, so everyone at home knows which sounds are fair game.
        </template>
      </span>
      <span class="fridge-nudge__actions">
        <v-btn
          :href="pdfUrl"
          target="_blank"
          rel="noopener"
          variant="tonal"
          color="primary"
          size="small"
          prepend-icon="mdi-printer-outline"
          @click="$emit('opened')"
        >
          Print the sheet
        </v-btn>
        <span class="fridge-nudge__minor">
          <v-btn
            variant="text"
            size="x-small"
            :loading="emailState === 'sending'"
            :disabled="emailState === 'sent'"
            @click="emailMe"
          >
            {{ emailState === 'sent' ? 'Sent' : 'Email it to me' }}
          </v-btn>
          <v-btn variant="text" size="x-small" @click="$emit('dismissed')">Not now</v-btn>
        </span>
        <span v-if="emailNote" class="fridge-nudge__note" :class="{ 'is-error': emailState === 'error' }">
          {{ emailNote }}
        </span>
      </span>
    </template>

    <!-- Colour: sheet exists, something new was introduced this session -->
    <template v-else-if="nudge.kind === 'colour'">
      <span class="fridge-nudge__text">
        <v-icon icon="mdi-palette-outline" size="16" class="mr-1" />
        New on the fridge sheet: <strong>{{ targetsLabel }}</strong> — colour
        {{ nudge.targets.length === 1 ? 'it' : 'them' }} in!
        <a :href="pdfUrl" target="_blank" rel="noopener" class="fridge-nudge__reprint">Need a fresh copy?</a>
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  describeColourTargets,
  requestFridgeSheetEmail,
  FRIDGE_SHEET_PDF_URL,
  type FridgeSheetNudge,
} from '../../services/fridgeSheet';

const props = defineProps<{
  nudge: FridgeSheetNudge;
  /** Narrow-strip rendering (mobile session-end). */
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'opened'): void;
  (e: 'dismissed'): void;
}>();

// "Email it to me": the sheet goes to the account address (server-resolved).
// A successful send counts as having the sheet, same as opening the PDF.
const emailState = ref<'idle' | 'sending' | 'sent' | 'error'>('idle');
const emailNote = ref('');

async function emailMe() {
  emailState.value = 'sending';
  emailNote.value = '';
  try {
    const { email } = await requestFridgeSheetEmail();
    emailState.value = 'sent';
    emailNote.value = `Sent to ${email}`;
    emit('opened');
  } catch (e) {
    emailState.value = 'error';
    emailNote.value = e instanceof Error ? e.message : 'Could not send the email.';
  }
}

const pdfUrl = FRIDGE_SHEET_PDF_URL;

const targetsLabel = computed(() =>
  props.nudge.kind === 'colour' ? describeColourTargets(props.nudge.targets) : '',
);
</script>

<style scoped>
.fridge-nudge {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

.fridge-nudge__text {
  font-size: 0.78rem;
  line-height: 1.35;
  color: rgba(var(--v-theme-on-surface), 0.75);
  text-align: center;
}

.fridge-nudge__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.fridge-nudge__minor {
  display: flex;
  gap: 2px;
}

.fridge-nudge__note {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.fridge-nudge__note.is-error {
  color: rgb(var(--v-theme-error));
}

.fridge-nudge__reprint {
  display: block;
  margin-top: 2px;
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

/* Mobile strip: one line, actions inline */
.fridge-nudge--compact {
  flex-direction: row;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
}

.fridge-nudge--compact .fridge-nudge__actions {
  flex-direction: row;
  gap: 4px;
}

.fridge-nudge--compact .fridge-nudge__reprint {
  display: inline;
  margin-left: 6px;
}
</style>
