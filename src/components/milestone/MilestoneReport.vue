<template>
  <div class="milestone">
    <!-- The number, first. It is the whole point. -->
    <header class="text-center mb-8">
      <div class="milestone__count">{{ countLabel }}</div>
      <h1 class="text-h5 mb-2">words within reach</h1>
      <p class="text-body-1 text-medium-emphasis">
        {{ childName }} has met {{ graphemeCount }} letters and letter teams — enough
        to sound out {{ countLabel }} different words.
      </p>
    </header>

    <!-- Evidence. The claim is checkable, so show some of it. -->
    <section v-if="sample.length" class="mb-8">
      <div class="d-flex flex-wrap justify-center ga-2">
        <v-chip v-for="w in sample" :key="w" color="primary" variant="tonal">
          {{ w }}
        </v-chip>
      </div>
      <p class="text-center text-caption text-medium-emphasis mt-3">
        A few of them. Try any word yourself on the
        <router-link to="/progress">progress page</router-link>.
      </p>
    </section>

    <!-- State of play. Two columns, deliberately symmetrical: this is a
         statement of what is true, not a pitch with an objection buried in it.
         The free column comes first and is never smaller. -->
    <section class="milestone__state mb-8">
      <v-card variant="tonal" color="success" class="pa-5">
        <div class="d-flex align-center mb-3">
          <v-icon class="mr-2">mdi-infinity</v-icon>
          <span class="text-subtitle-1 font-weight-bold">Free, from here on</span>
        </div>
        <ul class="milestone__list">
          <li>Every letter and letter team {{ childName.toLowerCase() }} has already met</li>
          <li>All {{ countLabel }} of those words, to keep practising</li>
          <li>Reviews, so nothing already learned slips away</li>
        </ul>
        <p class="text-caption mt-3 mb-0">
          No timer on any of it. Nothing gets taken away.
        </p>
      </v-card>

      <v-card variant="tonal" class="pa-5">
        <div class="d-flex align-center mb-3">
          <v-icon class="mr-2">mdi-arrow-right-circle-outline</v-icon>
          <span class="text-subtitle-1 font-weight-bold">What&rsquo;s next, with the full version</span>
        </div>
        <ul class="milestone__list">
          <li v-if="pendingSample.length">
            The letters and teams still ahead — {{ pendingSample.join(', ') }}
            <span v-if="pendingMore > 0">and {{ pendingMore }} more</span>
          </li>
          <li v-else>The letters and letter teams still ahead</li>
          <li>New lessons as {{ childName.toLowerCase() }} is ready for them</li>
          <li>The rest of the words — {{ ceilingLabel }} and beyond</li>
        </ul>
      </v-card>
    </section>

    <div class="text-center">
      <template v-if="purchasable">
        <v-btn color="primary" size="large" prepend-icon="mdi-cart" @click="emit('checkout')">
          Keep going — {{ price }} once
        </v-btn>
        <p class="text-caption text-medium-emphasis mt-3 mb-0">
          One payment. No subscription. Works for every child in the family.
        </p>
      </template>
      <v-btn variant="text" size="small" class="mt-4" @click="emit('back')">
        Back to practice
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * MilestoneReport — the free tier's ceiling, rendered from supplied state.
 *
 * Purely presentational: every number and word list arrives as a prop, so
 * `/dbg/milestone` can render states an account would need hours of study to
 * reach. `MilestoneView` is the thin loader that reads real user state and
 * passes it in.
 *
 * On the framing, which is the substance of this component: the trial-era
 * screen it replaced said "Your trial has ended". Nothing ends here. The child
 * keeps every grapheme they have met and every word those unlock, along with
 * the reviews that hold them in place; what stops is the supply of new
 * material. So the page reports a state rather than serving a notice — leads
 * with the number the family earned, shows words as evidence (the claim is
 * checkable, which is the whole trust argument for pricing on a word count),
 * and states both halves of the boundary side by side, free half first. The
 * ask comes last, after the reader has been told what they already have.
 */
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    /** Words the introduced graphemes make decodable. */
    count: number;
    /** Distinct graphemes introduced. */
    graphemeCount: number;
    /** A sample of currently-decodable words, highest-frequency first. */
    sample: string[];
    /** Free-slate graphemes not yet introduced — the concrete "what's next". */
    pending: string[];
    /** Total words the free slate can ever reach, for the "and beyond" line. */
    ceiling: number;
    /**
     * How the learner is referred to. Second person would be wrong — the
     * reader is the parent, the learner is the child. A prop so a profile name
     * can slot in later without touching the template.
     */
    childName?: string;
    /** False when nothing is for sale here (see sellOffer in src/entitlement/). */
    purchasable?: boolean;
    /** The offer's price, as shown on the buy button. */
    price?: string;
  }>(),
  { childName: 'Your child', purchasable: true, price: '' },
);

const emit = defineEmits<{
  (e: 'checkout'): void;
  (e: 'back'): void;
}>();

const countLabel = computed(() => props.count.toLocaleString());
const ceilingLabel = computed(() => props.ceiling.toLocaleString());

/**
 * A handful of the graphemes still ahead, named. "ch, qu, ph" is a far more
 * legible thing to be missing than "more content" — and at the threshold the
 * pending set is genuinely full of familiar ones, so naming them is honest
 * rather than teasing.
 */
const PENDING_SHOWN = 4;
const pendingSample = computed(() => props.pending.slice(0, PENDING_SHOWN));
const pendingMore = computed(() => Math.max(0, props.pending.length - PENDING_SHOWN));
</script>

<style scoped>
.milestone__count {
  font-size: clamp(3rem, 12vw, 5rem);
  font-weight: 700;
  line-height: 1;
  color: rgb(var(--v-theme-primary));
}

/* Symmetrical columns on desktop; free-tier card stays first when stacked. */
.milestone__state {
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr;
}

@media (min-width: 800px) {
  .milestone__state {
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
}

.milestone__list {
  margin: 0;
  padding-left: 1.1rem;
}

.milestone__list li + li {
  margin-top: 6px;
}
</style>
