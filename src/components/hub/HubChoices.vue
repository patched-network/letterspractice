<!--
  HubChoices.vue

  Presentational-only component for the Study Hub's primary choice surface
  (Learn / Practice CTAs + lesson progress row).

  ⚠️  KEEP THIS COMPONENT DUMB.
      No store reads, no DB writes, no router calls, no service imports.
      All state comes in via props; all actions go out via emits.
      This contract is what lets `/dbg/study-hub` drive it with fake scenarios
      without triggering real side effects. If you find yourself needing to
      reach into a store/service here, lift that work into the parent
      (StudyHubView) and expose it through props/emits instead.
-->
<template>
  <div class="hub-layout">
    <!-- Resting: today's practice is done (services/dailyDose.ts). No CTAs —
         the app says "tomorrow" so the parent doesn't have to. The unlock is
         deliberately quiet and adult-worded. -->
    <template v-if="resting">
      <div class="hub-cta-group hub-rest">
        <WordDisplay
          text="Tomorrow!"
          :height="44"
          :options="ctaWordOptions"
          :transform-fn="ctaTransform"
          class="hub-cta__word"
        />
        <p class="hub-cta__subtitle">
          <span>Today's practice is done. Great work. See you soon!</span>
        </p>
        <button class="hub-rest__unlock" type="button" @click="$emit('unlock')">
          Grown-ups: one more session today
        </button>
      </div>
    </template>

    <!-- Case A: no pending lesson — Practice only -->
    <template v-else-if="!nextLesson">
      <div class="hub-cta-group">
        <button
          class="hub-cta hub-cta--practice"
          type="button"
          @click="$emit('practice')"
        >
          <WordDisplay
            text="Practice"
            :height="44"
            :options="ctaWordOptions"
            :transform-fn="ctaTransform"
            class="hub-cta__word"
          />
        </button>
        <p class="hub-cta__subtitle">
          <v-icon size="16" class="hub-cta__subtitle-icon">mdi-account</v-icon>
          <span>
            {{ sessionPrepared ? 'Your learner can drive — stay within earshot.' : 'Loading…' }}
          </span>
        </p>
      </div>
    </template>

    <!-- Case B: lesson pending — Learn + Practice -->
    <template v-else>
      <!-- Learn CTA (primary, top) -->
      <div class="hub-cta-group">
        <button
          class="hub-cta hub-cta--learn"
          type="button"
          @click="$emit('learn')"
        >
          <WordDisplay
            text="Learn"
            :height="44"
            :options="ctaWordOptions"
            :transform-fn="ctaTransform"
            class="hub-cta__word"
          />
        </button>
        <p class="hub-cta__subtitle">
          <v-icon size="16" class="hub-cta__subtitle-icon">mdi-account-multiple</v-icon>
          <span>
            <strong>{{ nextLesson.title }}</strong> — <span v-html="renderInline(nextLesson.description)"></span>
          </span>
        </p>
      </div>

      <!-- Practice CTA (secondary, below) -->
      <div class="hub-cta-group" :class="{ 'hub-cta-group--blocked': practiceBlocked }">
        <button
          class="hub-cta hub-cta--practice"
          type="button"
          :disabled="practiceBlocked"
          @click="$emit('practice')"
        >
          <WordDisplay
            text="Practice"
            :height="44"
            :options="ctaWordOptions"
            :transform-fn="ctaTransform"
            class="hub-cta__word"
          />
        </button>
        <p
          v-if="practiceBlocked"
          class="hub-cta__subtitle hub-cta__subtitle--blocked"
        >
          <v-icon size="16" class="hub-cta__subtitle-icon">mdi-lock-outline</v-icon>
          <span>Complete the intro lesson to begin.</span>
        </p>
        <p v-else class="hub-cta__subtitle">
          <v-icon size="16" class="hub-cta__subtitle-icon">mdi-account</v-icon>
          <span>Your learner can drive — stay within earshot.</span>
        </p>
      </div>
    </template>

    <!-- Shared across both cases: what the two modes ask of the household.
         Each <dd> reads as a continuation of its <dt> ("Learn sessions
         introduce…" / "Practice sessions build on…"). -->
    <dl class="hub-modes-note">
      <dt>Learn</dt>
      <dd>
        sessions introduce something <em>brand new</em> — a sound, a pattern, a
        rule. A helper (parent, grandparent, older sibling) reads the short
        lesson aloud: your learner needs you here.
      </dd>
      <dt>Practice</dt>
      <dd>
        sessions build on what's already been introduced — new words from
        familiar sounds, plus review. Learners can mostly drive this themselves;
        stay within earshot.
      </dd>
    </dl>
  </div>
</template>

<script setup lang="ts">
import WordDisplay from '../../letterpeople/vue/WordDisplay.vue';
import type { WordOptions } from '../../letterpeople/Word';
import {
  createJiggleTransform,
  composeTransforms,
  BRAND_COLOR_TRANSFORM,
} from '../../letterpeople/transforms';
import type { LessonDefinition } from '../../services/lessons.types';
import { renderInline } from '../landing/inlineMarkup';

interface Props {
  /** The next lesson the user should run, or null if none pending. */
  nextLesson: LessonDefinition | null;
  /** Whether the Practice session has been prefetched / is ready to start. */
  sessionPrepared?: boolean;
  /** Whether the Practice CTA should be disabled (e.g. blocked by intro lesson). */
  practiceBlocked?: boolean;
  /** Today's practice is done: show the rest state instead of any CTA. */
  resting?: boolean;
}

withDefaults(defineProps<Props>(), {
  sessionPrepared: true,
  practiceBlocked: false,
  resting: false,
});

defineEmits<{
  (e: 'learn'): void;
  (e: 'practice'): void;
  /** Rest state: a grown-up asked for one more session (gate is the parent's job). */
  (e: 'unlock'): void;
}>();

// Branded CTA word configuration (mirrors LessonCompletePane)
const ctaWordOptions: WordOptions = {
  spacing: 2,
  letterOptions: {
    lineWidth: 22,
    borderWidth: 0,
    showEyes: false,
    showArms: false,
    showMouth: false,
  },
};

const ctaTransform = composeTransforms(
  BRAND_COLOR_TRANSFORM,
  createJiggleTransform({
    intensity: 3,
    rotationRange: 13,
    duration: 2800,
    ease: 'outElastic(1, .8)',
    stagger: 20,
  }),
);
</script>

<style scoped>
.hub-layout {
  display: flex;
  flex-direction: column;
  gap: 32px;
  width: 100%;
  max-width: 420px;
  align-items: stretch;
  padding-top: 24px;
  padding-bottom: 24px;
  margin: 0 auto;
  /* Stretch to fill the .study-hub column so the modes-note can be
     pinned to the bottom via margin-top: auto. */
  flex: 1 1 auto;
  min-height: 100%;
}

.hub-cta-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
}

.hub-cta {
  background: white;
  border: none;
  border-radius: 18px;
  padding: 14px 28px;
  cursor: pointer;
  box-shadow:
    0 6px 14px rgba(0, 0, 0, 0.12),
    inset 0 -4px 0 rgba(0, 0, 0, 0.08);
  transition: transform 0.12s ease-out, box-shadow 0.12s ease-out, filter 0.12s ease-out;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
}

.hub-cta:hover {
  filter: brightness(1.03);
  transform: translateY(-1px);
}

.hub-cta:active {
  transform: translateY(2px);
  box-shadow:
    0 3px 6px rgba(0, 0, 0, 0.12),
    inset 0 -2px 0 rgba(0, 0, 0, 0.08);
}

.hub-cta:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary));
  outline-offset: 3px;
}

.hub-cta:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  filter: grayscale(0.25);
  transform: none;
}

/* Faint color-coding via a soft bottom-edge tint */
.hub-cta--learn {
  box-shadow:
    0 6px 14px rgba(0, 0, 0, 0.12),
    inset 0 -4px 0 rgba(76, 175, 80, 0.45);
}
.hub-cta--practice {
  box-shadow:
    0 6px 14px rgba(0, 0, 0, 0.12),
    inset 0 -4px 0 rgba(255, 152, 0, 0.45);
}

.hub-cta__word {
  line-height: 1;
  overflow: visible;
  display: flex;
  align-items: center;
}
.hub-cta__word :deep(.word-display),
.hub-cta__word :deep(.word-visual) {
  overflow: visible !important;
  padding: 8px;
}

.hub-cta__subtitle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  color: rgba(0, 0, 0, 0.65);
  line-height: 1.3;
  margin: 6px 0 0;
}

.hub-rest__unlock {
  margin-top: 18px;
  background: none;
  border: none;
  padding: 4px 8px;
  font-size: 0.8rem;
  color: rgba(0, 0, 0, 0.5);
  text-decoration: underline;
  cursor: pointer;
}

.hub-cta__subtitle-icon {
  color: rgba(0, 0, 0, 0.45);
  flex-shrink: 0;
}

.hub-cta-group--blocked .hub-cta__subtitle--blocked {
  font-size: 0.78rem;
  color: rgba(0, 0, 0, 0.55);
}

/* Parent-facing explainer at the bottom of the hub. Intentionally
   low-contrast so it's glanceable but doesn't compete with the CTAs.
   Rendered as a two-column grid so each topic word ("Learn" /
   "Practice") sits in its own column and all body text aligns to a
   shared left edge — the right side of the widest topic word. */
.hub-modes-note {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 0.5rem;
  row-gap: 0.5rem;
  /* margin-top: auto pushes the explainer to the bottom of .hub-layout,
     which itself stretches to fill the .study-hub column. */
  margin: auto auto 0;
  padding: 0 4px;
  font-size: 0.78rem;
  line-height: 1.45;
  color: rgba(0, 0, 0, 0.5);
  text-align: left;
  max-width: 380px;
}

.hub-modes-note dt {
  font-weight: 600;
  color: rgba(0, 0, 0, 0.7);
}

.hub-modes-note dd {
  margin: 0;
}

.hub-modes-note em {
  font-style: italic;
  color: rgba(0, 0, 0, 0.65);
}
</style>
