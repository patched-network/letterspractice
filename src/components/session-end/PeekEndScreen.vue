<template>
  <div class="peek-end-screen">
    <!-- Funnel CTAs: their own block (not tucked inside the summary), first
         in DOM so they stack on top on narrow screens. No vignette hero and
         no progress link here — the vignette eats preview screen space, and
         /progress crosses the peek namespace boundary into an empty DB. -->
    <div class="peek-end-ctas">
      <h2 class="text-h6 mb-1">That's a practice session!</h2>
      <p class="text-body-2 text-medium-emphasis mb-0">
        Ready to start with your young learner?
      </p>
      <div class="cta-buttons">
        <v-btn
          color="primary"
          variant="elevated"
          prepend-icon="mdi-account-child"
          @click="router.push('/study')"
        >
          Start learning together
        </v-btn>
        <v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-account-plus"
          @click="router.push('/signup')"
        >
          Create account
        </v-btn>
      </div>
    </div>

    <!-- Parent-facing summary of what the session exercised -->
    <div class="peek-end-summary">
      <SessionSummary
        :new-topics="summary.newTopics"
        :reviewed-topics="summary.reviewedTopics"
        :trouble-spots="summary.troubleSpots"
        :coming-soon="summary.comingSoon"
        :total-cards="summary.totalCards"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { toRef, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import SessionSummary from './SessionSummary.vue';
import {
  useSessionSummary,
  type SessionRecordEntry,
} from '../../composables/useSessionSummary';

const props = defineProps<{
  /** The session record array emitted by StudySession's session-finished event */
  sessionRecords: SessionRecordEntry[];
}>();

const router = useRouter();

const { summary, loadComingSoon } = useSessionSummary(
  toRef(props, 'sessionRecords'),
);

onMounted(() => {
  // Fire-and-forget; the "Coming Soon" section fills in when it resolves.
  void loadComingSoon();
});
</script>

<style scoped>
.peek-end-screen {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 16px;
}

.peek-end-ctas {
  flex: 1 1 260px;
  max-width: 380px;
  padding: 16px;
  text-align: center;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.06);
}

.cta-buttons {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.peek-end-summary {
  flex: 1 1 320px;
  min-width: 0;
}
</style>
