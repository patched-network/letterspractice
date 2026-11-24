<template>
  <div>
    <div class="view-switch">
      <span class="text-caption text-medium-emphasis mr-2">view</span>
      <v-btn-toggle
        :model-value="choice"
        density="compact"
        variant="outlined"
        color="primary"
        mandatory
        @update:model-value="setChoice"
      >
        <v-btn value="lp" size="x-small">LettersPractice</v-btn>
        <v-btn value="fw" size="x-small">Framework</v-btn>
      </v-btn-toggle>
    </div>
    <fw-learner-view v-if="choice === 'fw'" :mode="fwMode" />
    <component :is="lpView" v-else />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, type Component } from 'vue';
import { useRoute } from 'vue-router';
import FwLearnerView from './FwLearnerView.vue';

/**
 * Route shell for the learner admin views while the framework's versions are
 * proved out: renders LP's view or the framework's, per a remembered toggle.
 * The route supplies both through `meta.lpView` (a lazy import) and
 * `meta.fwMode`.
 */
const STORAGE_KEY = 'lp.admin.learnerView';

const route = useRoute();

function readChoice(): 'lp' | 'fw' {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'fw' ? 'fw' : 'lp';
  } catch {
    return 'lp';
  }
}

const choice = ref<'lp' | 'fw'>(readChoice());

function setChoice(value: 'lp' | 'fw'): void {
  choice.value = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Private windows can refuse storage; the toggle still works for this page.
  }
}

type Loader = () => Promise<{ default: Component }>;
// One async wrapper per loader, so a query change (e.g. ?focus=) doesn't remount LP's view.
const asyncViews = new WeakMap<Loader, Component>();

const fwMode = computed(() => route.meta.fwMode as 'sessions' | 'session' | 'cards');
const lpView = computed(() => {
  const loader = route.meta.lpView as Loader;
  let view = asyncViews.get(loader);
  if (!view) {
    view = defineAsyncComponent(loader);
    asyncViews.set(loader, view);
  }
  return view;
});
</script>

<style scoped>
.view-switch {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 20px 0;
}
</style>
