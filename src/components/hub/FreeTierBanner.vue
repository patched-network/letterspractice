<template>
  <v-alert type="success" variant="tonal" icon="mdi-trophy-outline">
    <div class="text-subtitle-1 font-weight-bold mb-1">
      {{ countLabel }} words — and they all stay yours
    </div>
    <div class="text-body-2">
      Practice and reviews carry on as normal, keeping everything learned so far
      sharp. New letters, letter teams and lessons are part of the full version.
    </div>
    <template v-slot:append>
      <v-btn variant="elevated" color="primary" @click="emit('see-more')">
        See what&rsquo;s next
      </v-btn>
    </template>
  </v-alert>
</template>

<script setup lang="ts">
/**
 * FreeTierBanner — the hub's standing notice once the free tier's word ceiling
 * is reached.
 *
 * Shown permanently and without a dismiss affordance, deliberately: this is the
 * account's steady state rather than an event, and a parent who never buys
 * should still be able to tell what the app is doing — practising what the
 * child knows, not introducing what they don't. A dismissible nag would leave
 * that unexplained.
 *
 * The framing is deliberately not a lockout. What is true is that the child
 * keeps everything: the wording leads with what they have and mentions the
 * paid half second. See `bd/distribution.md` §"Entitlement Model:
 * reachable-words freemium".
 *
 * Presentational and prop-driven so `/dbg/study-hub` can render it without an
 * account that has actually reached the ceiling — the state is otherwise
 * hours of study away.
 */
import { computed } from 'vue';

const props = defineProps<{
  /** Words the child's introduced graphemes make decodable. */
  count: number;
}>();

const emit = defineEmits<{
  (e: 'see-more'): void;
}>();

const countLabel = computed(() => props.count.toLocaleString());
</script>
