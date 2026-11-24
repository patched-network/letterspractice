<!--
  AdultGateDialog.vue

  A grown-up check before unlocking one more practice session for today (see
  services/dailyDose.ts). A multiplication question is the usual parental gate
  for this age range: trivial for an adult, out of reach for a 2–5 year old.

  Presentational: v-model controls visibility, `passed` fires on a correct
  answer. The caller decides what passing grants.
-->
<template>
  <v-dialog :model-value="modelValue" max-width="360" @update:model-value="close">
    <v-card class="pa-2">
      <v-card-title class="text-h6">One more today?</v-card-title>
      <v-card-text>
        <p class="mb-4">
          Today's practice is done, and the Letters are happy to stop there.
          If you'd like one more session anyway, answer this to unlock it.
        </p>
        <v-text-field
          v-model="answer"
          :label="`What is ${a} × ${b}?`"
          inputmode="numeric"
          autocomplete="off"
          variant="outlined"
          density="comfortable"
          :error-messages="wrong ? 'Not quite — try again.' : undefined"
          autofocus
          @keydown.enter="submit"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Not today</v-btn>
        <v-btn color="primary" variant="flat" @click="submit">Unlock one session</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void;
  (e: 'passed'): void;
}>();

const a = ref(0);
const b = ref(0);
const answer = ref('');
const wrong = ref(false);

/** Fresh question each time the dialog opens; factors 3–9. */
function newQuestion() {
  a.value = 3 + Math.floor(Math.random() * 7);
  b.value = 3 + Math.floor(Math.random() * 7);
  answer.value = '';
  wrong.value = false;
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) newQuestion();
  },
  { immediate: true },
);

function close() {
  emit('update:modelValue', false);
}

function submit() {
  if (parseInt(answer.value.trim(), 10) === a.value * b.value) {
    emit('passed');
    close();
  } else {
    wrong.value = true;
    newQuestion();
    wrong.value = true;
  }
}
</script>
