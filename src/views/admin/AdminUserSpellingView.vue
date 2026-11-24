<template>
  <v-container fluid style="max-width: 1500px">
    <v-row>
      <v-col cols="12" md="10" offset-md="1">
        <div class="d-flex align-center mb-4">
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-arrow-left"
            :to="{ name: 'AdminUserProgress', params: { username } }"
          >
            Back to progress
          </v-btn>
          <v-spacer />
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-timeline-clock-outline"
            :to="{ name: 'AdminUserSessions', params: { username } }"
          >
            Sessions
          </v-btn>
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-refresh"
            :loading="loading"
            @click="reload"
          >
            Refresh
          </v-btn>
        </div>

        <div class="d-flex align-baseline mb-2 flex-wrap" style="gap: 8px">
          <h1 class="text-h4">Spelling misses</h1>
          <v-chip color="primary" variant="tonal" size="small">
            <v-icon start size="small">mdi-account</v-icon>
            <code>{{ username }}</code>
          </v-chip>
          <v-chip size="x-small" variant="tonal" color="grey">admin view</v-chip>
        </div>
        <p class="text-caption text-medium-emphasis mb-4">
          Every wrong spelling answer, newest first. <strong>At the time</strong> is what the
          record carries — <em>unjudged</em> means no GPC got the miss.
          <strong>Grader now</strong> re-grades the same answer with the current rules
          (<code>questions/spelling/grade.ts</code>). Where the grader is wrong, copy the row as a
          case, correct its expectation, and add it to <code>gradeCases.ts</code>.
        </p>

        <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable>
          {{ error }}
        </v-alert>

        <div v-if="loading" class="text-center pa-8">
          <v-progress-circular indeterminate color="primary" />
        </div>

        <template v-else>
          <v-row dense class="mb-2">
            <v-col v-for="tile in tiles" :key="tile.label" cols="6" sm="4" md="2">
              <v-card variant="tonal" :color="tile.color" class="pa-2 text-center">
                <div class="text-h6">{{ tile.value }}</div>
                <div class="text-caption">{{ tile.label }}</div>
              </v-card>
            </v-col>
          </v-row>

          <div class="d-flex align-center flex-wrap mb-3" style="gap: 12px">
            <v-btn-toggle v-model="filter" density="compact" color="primary" variant="outlined">
              <v-btn value="all" size="small">All ({{ attempts.length }})</v-btn>
              <v-btn value="first" size="small">First attempts ({{ counts.first }})</v-btn>
              <v-btn value="unjudged-then" size="small">Unjudged at the time ({{ counts.unjudgedThen }})</v-btn>
              <v-btn value="unjudged-now" size="small">Unjudged now ({{ counts.unjudgedNow }})</v-btn>
            </v-btn-toggle>
          </div>

          <v-alert v-if="attempts.length === 0" type="info" variant="tonal">
            No wrong spelling answers recorded for this user.
          </v-alert>

          <v-table v-else density="compact" class="spelling-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Word</th>
                <th>Answer</th>
                <th>Attempt</th>
                <th>At the time</th>
                <th>Grader now</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(a, i) in visible" :key="i">
                <td class="text-no-wrap">{{ fmtTime(a.timeStamp) }}</td>
                <td><strong>{{ a.word }}</strong></td>
                <td><code>{{ a.answer }}</code></td>
                <td>{{ a.firstAttempt ? '1st' : 'retry' }}</td>
                <td>
                  <span v-if="a.recorded === 'unjudged'" class="text-warning">unjudged</span>
                  <VerdictList v-else :verdicts="a.recorded" />
                </td>
                <td>
                  <span v-if="a.now.unjudged" class="text-warning">unjudged ({{ a.now.unjudged }})</span>
                  <VerdictList v-else :verdicts="nowVerdicts(a)" />
                </td>
                <td>
                  <v-btn size="x-small" variant="text" @click="copyCase(a, i)">
                    {{ copiedRow === i ? 'copied ✓' : 'copy as case' }}
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
        </template>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h, type FunctionalComponent } from 'vue';
import { useRoute } from 'vue-router';
import { fetchSpellingAttemptsForUser, type SpellingAttempt } from '@/services/adminUsersService';
import { parseGpcTag } from '@/services/tags';
import type { Verdict } from '@/questions/spelling/grade';
import { caseSource } from '@/questions/spelling/gradeCheck';

const route = useRoute();
const username = ref<string>(String(route.params.username ?? ''));

const loading = ref(true);
const error = ref<string | null>(null);
const attempts = ref<SpellingAttempt[]>([]);
const filter = ref<'all' | 'first' | 'unjudged-then' | 'unjudged-now'>('all');
const copiedRow = ref<number | null>(null);

const VerdictList: FunctionalComponent<{ verdicts: Record<string, Verdict> }> = (props) =>
  h(
    'span',
    Object.entries(props.verdicts).map(([gpc, v], i) =>
      h('span', { class: v === 'hit' ? 'text-success' : 'text-error' }, `${i ? ' · ' : ''}${gpc} ${v === 'hit' ? '✓' : '✗'}`),
    ),
  );

const nowVerdicts = (a: SpellingAttempt): Record<string, Verdict> =>
  Object.fromEntries(Object.entries(a.now.verdicts).map(([tag, v]) => [parseGpcTag(tag)?.gpcShortId ?? tag, v]));

const counts = computed(() => ({
  first: attempts.value.filter((a) => a.firstAttempt).length,
  unjudgedThen: attempts.value.filter((a) => a.recorded === 'unjudged').length,
  unjudgedNow: attempts.value.filter((a) => a.now.unjudged).length,
}));

// `!filter.value` covers v-btn-toggle's deselect, which clears the model.
const visible = computed(() => {
  switch (filter.value) {
    case 'first':
      return attempts.value.filter((a) => a.firstAttempt);
    case 'unjudged-then':
      return attempts.value.filter((a) => a.recorded === 'unjudged');
    case 'unjudged-now':
      return attempts.value.filter((a) => a.now.unjudged);
    default:
      return attempts.value;
  }
});

const tiles = computed(() => [
  { label: 'wrong answers', value: attempts.value.length, color: 'primary' },
  { label: 'first attempts', value: counts.value.first, color: 'primary' },
  { label: 'unjudged at the time', value: counts.value.unjudgedThen, color: 'warning' },
  { label: 'unjudged now', value: counts.value.unjudgedNow, color: 'warning' },
]);

async function copyCase(a: SpellingAttempt, row: number) {
  const text = caseSource({
    word: a.word,
    answer: a.answer.trim().toLowerCase(),
    expect: a.now.unjudged ? 'unjudged' : nowVerdicts(a),
    source: `${username.value} ${a.timeStamp.slice(0, 10)}`,
  });
  try {
    await navigator.clipboard.writeText(text);
    copiedRow.value = row;
  } catch (e) {
    error.value = `Clipboard unavailable: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

async function reload(): Promise<void> {
  loading.value = true;
  error.value = null;
  copiedRow.value = null;
  try {
    attempts.value = await fetchSpellingAttemptsForUser(username.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.spelling-table :deep(td),
.spelling-table :deep(th) {
  font-size: 0.78rem;
}
</style>
