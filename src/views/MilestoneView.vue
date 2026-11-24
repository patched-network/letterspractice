<template>
  <v-container class="milestone-view" style="max-width: 760px">
    <div v-if="loading" class="text-center pa-12">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <MilestoneReport
      v-else
      :count="count"
      :grapheme-count="graphemeCount"
      :sample="sample"
      :pending="pending"
      :ceiling="ceiling"
      :purchasable="offer !== null"
      :price="offer?.price"
      @checkout="offer && router.push(offer.path)"
      @back="router.push('/study')"
    />
  </v-container>
</template>

<script setup lang="ts">
/**
 * MilestoneView — loads the free-tier state and hands it to MilestoneReport.
 *
 * Thin by design: the rendering (and the reasoning behind how the boundary is
 * framed) lives in `components/milestone/MilestoneReport.vue`, which is
 * prop-driven so `/dbg/milestone` can exercise states a real account would
 * take hours of study to reach.
 *
 * Reached from the hub banner and the session-end nudge; nothing redirects
 * here. A route-level bounce is what the retired trial guard did, and
 * re-introducing one would contradict the model — see the guard note in
 * `router/index.ts`.
 */

import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getLetterProgression, getReachableWordCount } from '../services/userState';
import { loadFreeSlateTable, reachableSample } from '../services/reachableWords/freeSlateCount';
import MilestoneReport from '../components/milestone/MilestoneReport.vue';
import { sellOffer } from '../entitlement';

const offer = sellOffer();

const router = useRouter();

const loading = ref(true);
const count = ref(0);
const graphemeCount = ref(0);
const sample = ref<string[]>([]);
const pending = ref<string[]>([]);
const ceiling = ref(0);

onMounted(async () => {
  try {
    const [progression, table, wordCount] = await Promise.all([
      getLetterProgression(),
      loadFreeSlateTable(),
      getReachableWordCount(),
    ]);

    count.value = wordCount;
    ceiling.value = table.meta.wordCount;

    const introduced = (progression?.unlockedLetters ?? []).map((l) => l.toLowerCase());
    graphemeCount.value = new Set(introduced).size;
    sample.value = reachableSample(table, introduced, 14);

    const have = new Set(introduced);
    pending.value = table.graphemes.filter((g) => !have.has(g));
  } catch (e) {
    console.warn('[MilestoneView] Failed to load milestone state:', e);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.milestone-view {
  padding-top: 48px;
  padding-bottom: 64px;
}
</style>
