<template>
  <v-container fluid style="max-width: 1400px;">
    <v-row>
      <v-col cols="12">
        <h1 class="text-h4 mb-4">Your Progress</h1>

        <div v-if="loading" class="text-center pa-8">
          <v-progress-circular indeterminate color="primary" />
        </div>

        <template v-else-if="summary">
          <!-- Parent-facing summary: curriculum checklist + words within reach,
               side-by-side on desktop, stacked on mobile. -->
          <v-row>
            <v-col cols="12" md="6">
              <CurriculumCard :summary="summary" />
            </v-col>
            <v-col cols="12" md="6">
              <ReachableWordsCard :summary="summary" />
            </v-col>
          </v-row>

          <!-- ============================================================
               Everything below is debug detail — useful for inspecting raw
               user state during development, noise for end users. Gated
               behind import.meta.env.DEV so it tree-shakes out of prod.
               ============================================================ -->
          <template v-if="isDev">
           <div class="dev-zone">
            <div class="dev-zone__label">
              <v-icon size="14" class="mr-1">mdi-tools</v-icon>
              Dev-only — raw user state, hidden in production
            </div>
            <!-- Account -->
            <v-card class="pa-4 mb-4">
              <v-card-title>Account</v-card-title>
              <v-card-text>
                <p><strong>Username:</strong> {{ summary.username }}</p>
                <p><strong>Status:</strong> {{ summary.isGuest ? 'Guest / Trial' : 'Registered' }}</p>
                <template v-if="summary.profile">
                  <v-divider class="my-3" />
                  <p><strong>Child age:</strong> {{ summary.profile.childAge || 'Not set' }}</p>
                  <p><strong>Literacy level:</strong> {{ summary.profile.literacyLevel }}</p>
                </template>
              </v-card-text>
            </v-card>

            <!-- Letters -->
            <v-card class="pa-4 mb-4">
              <v-card-title>Letters</v-card-title>
              <v-card-text>
                <template v-if="summary.letterProgression">
                  <p class="mb-2">
                    <strong>Unlocked ({{ summary.letterProgression.unlockedCount }}):</strong>
                  </p>
                  <div class="mb-3">
                    <v-chip
                      v-for="letter in summary.letterProgression.unlockedLetters"
                      :key="letter"
                      class="ma-1"
                      color="primary"
                      variant="tonal"
                    >
                      {{ letter }}
                    </v-chip>
                  </div>
                  <template v-if="wstEntries.length > 0">
                    <p class="text-subtitle-2 mb-2">WST Progress (correct answers)</p>
                    <v-table density="compact">
                      <thead>
                        <tr>
                          <th>Letter</th>
                          <th class="text-right">Correct</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="[letter, count] in wstEntries" :key="letter">
                          <td>{{ letter }}</td>
                          <td class="text-right">{{ count }}</td>
                        </tr>
                      </tbody>
                    </v-table>
                  </template>
                </template>
                <p v-else class="text-grey">No letters unlocked yet.</p>
                <p class="mt-2 text-body-2">
                  <a :href="fridgeSheetPdfUrl" target="_blank" rel="noopener">
                    <v-icon icon="mdi-printer-outline" size="16" class="mr-1" />Print the fridge sheet
                  </a>
                  <span class="text-medium-emphasis">
                    (or the <a :href="fridgeSheetPlainPdfUrl" target="_blank" rel="noopener">plain version</a>)
                    — colour in each key as it's earned.
                  </span>
                </p>
                <p class="text-body-2">
                  <a href="#" @click.prevent="emailFridgeSheet">
                    <v-icon icon="mdi-email-outline" size="16" class="mr-1" />Email it to me
                  </a>
                  <span v-if="fridgeEmailNote" class="text-medium-emphasis ml-2">{{ fridgeEmailNote }}</span>
                </p>
              </v-card-text>
            </v-card>

            <!-- ELO — grouped by namespace -->
            <v-card class="pa-4 mb-4">
              <v-card-title>ELO</v-card-title>
              <v-card-text>
                <template v-if="summary.elo">
                  <p class="mb-3">
                    <strong>Global:</strong> {{ summary.elo.globalScore.toFixed(0) }}
                    ({{ summary.elo.globalCount }} interactions)
                  </p>

                  <!-- Concept tags (always expanded) -->
                  <template v-if="conceptTagEntries.length > 0">
                    <div class="elo-group mb-4">
                      <div class="elo-group__header text-subtitle-2 mb-2">
                        Concept Mastery
                        <v-chip size="x-small" variant="tonal" class="ml-1">{{ conceptTagEntries.length }}</v-chip>
                      </div>
                      <v-table density="compact">
                        <thead>
                          <tr>
                            <th>Concept</th>
                            <th class="text-right">Score</th>
                            <th class="text-right">N</th>
                            <th class="text-right">Threshold</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="entry in conceptTagEntries" :key="entry.tag">
                            <td><code>{{ entry.tag }}</code></td>
                            <td class="text-right">{{ entry.score.toFixed(0) }}</td>
                            <td class="text-right">{{ entry.count }}</td>
                            <td class="text-right text-medium-emphasis">
                              <template v-if="entry.threshold">
                                {{ entry.threshold }}
                              </template>
                              <template v-else>—</template>
                            </td>
                          </tr>
                        </tbody>
                      </v-table>
                    </div>
                  </template>

                  <!-- GPC tags (collapsible, default collapsed) -->
                  <template v-if="gpcTagEntries.length > 0">
                    <div class="elo-group mb-4">
                      <div
                        class="elo-group__header elo-group__header--clickable text-subtitle-2 mb-2"
                        @click="showGpcTags = !showGpcTags"
                      >
                        <v-icon size="16" class="mr-1">
                          {{ showGpcTags ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
                        </v-icon>
                        GPC Detail
                        <v-chip size="x-small" variant="tonal" class="ml-1">{{ gpcTagEntries.length }}</v-chip>
                      </div>
                      <v-table v-if="showGpcTags" density="compact">
                        <thead>
                          <tr>
                            <th>Tag</th>
                            <th class="text-right">Score</th>
                            <th class="text-right">N</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="[tag, info] in gpcTagEntries" :key="tag">
                            <td>{{ formatTag(tag) }}</td>
                            <td class="text-right">{{ info.score.toFixed(0) }}</td>
                            <td class="text-right">{{ info.count }}</td>
                          </tr>
                        </tbody>
                      </v-table>
                    </div>
                  </template>

                  <!-- UI tags (collapsible, default collapsed) -->
                  <template v-if="uiTagEntries.length > 0">
                    <div class="elo-group mb-4">
                      <div
                        class="elo-group__header elo-group__header--clickable text-subtitle-2 mb-2"
                        @click="showUiTags = !showUiTags"
                      >
                        <v-icon size="16" class="mr-1">
                          {{ showUiTags ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
                        </v-icon>
                        UI Types
                        <v-chip size="x-small" variant="tonal" class="ml-1">{{ uiTagEntries.length }}</v-chip>
                      </div>
                      <v-table v-if="showUiTags" density="compact">
                        <thead>
                          <tr>
                            <th>Tag</th>
                            <th class="text-right">Score</th>
                            <th class="text-right">N</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="[tag, info] in uiTagEntries" :key="tag">
                            <td>{{ formatTag(tag) }}</td>
                            <td class="text-right">{{ info.score.toFixed(0) }}</td>
                            <td class="text-right">{{ info.count }}</td>
                          </tr>
                        </tbody>
                      </v-table>
                    </div>
                  </template>

                  <!-- Other tags (collapsible, default collapsed) -->
                  <template v-if="otherTagEntries.length > 0">
                    <div class="elo-group">
                      <div
                        class="elo-group__header elo-group__header--clickable text-subtitle-2 mb-2"
                        @click="showOtherTags = !showOtherTags"
                      >
                        <v-icon size="16" class="mr-1">
                          {{ showOtherTags ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
                        </v-icon>
                        Other
                        <v-chip size="x-small" variant="tonal" class="ml-1">{{ otherTagEntries.length }}</v-chip>
                      </div>
                      <v-table v-if="showOtherTags" density="compact">
                        <thead>
                          <tr>
                            <th>Tag</th>
                            <th class="text-right">Score</th>
                            <th class="text-right">N</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="[tag, info] in otherTagEntries" :key="tag">
                            <td><code>{{ tag }}</code></td>
                            <td class="text-right">{{ info.score.toFixed(0) }}</td>
                            <td class="text-right">{{ info.count }}</td>
                          </tr>
                        </tbody>
                      </v-table>
                    </div>
                  </template>
                </template>
                <p v-else class="text-grey">No ELO data yet.</p>
              </v-card-text>
            </v-card>

            <!-- Lesson State (debug detail) -->
            <v-card v-if="summary.lessonProgress" class="pa-4 mb-4">
              <v-card-title>Lesson State (raw)</v-card-title>
              <v-card-text>
                <p><strong>Completed:</strong> {{ summary.lessonProgress.completedLessons.join(', ') || '(none)' }}</p>
                <p><strong>Dismissed:</strong> {{ summary.lessonProgress.dismissedLessons.join(', ') || '(none)' }}</p>
                <p><strong>Current:</strong> {{ summary.lessonProgress.currentLesson || '(none)' }}</p>
                <p><strong>Skipped count:</strong> {{ summary.lessonProgress.skippedCount }}</p>
                <p><strong>Sessions since last lesson:</strong> {{ summary.lessonProgress.sessionsSinceLastLesson }}</p>
              </v-card-text>
            </v-card>

            <!-- Reviews -->
            <v-card class="pa-4 mb-4">
              <v-card-title>Reviews</v-card-title>
              <v-card-text>
                <p>
                  <strong>Pending:</strong> {{ summary.reviews.pendingCount }}
                </p>
                <p v-if="summary.reviews.nextReviewTime">
                  <strong>Next review:</strong> {{ fmtDate(summary.reviews.nextReviewTime) }}
                </p>
                <p v-else class="text-grey">No reviews scheduled.</p>
              </v-card-text>
            </v-card>

            <!-- Activity -->
            <v-card class="pa-4">
              <v-card-title>Activity</v-card-title>
              <v-card-text>
                <p><strong>Cards seen:</strong> {{ summary.activity.seenCardCount }}</p>
                <p><strong>Sessions:</strong> {{ summary.activity.sessionCount }}</p>
                <p><strong>First session:</strong> {{ fmtDate(summary.activity.firstSession) }}</p>
                <p><strong>Last session:</strong> {{ fmtDate(summary.activity.lastSession) }}</p>
              </v-card-text>
            </v-card>
           </div>
          </template>
        </template>

        <v-alert v-else type="warning" class="mt-4">
          Unable to load progress data.
        </v-alert>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import {
  FRIDGE_SHEET_PDF_URL as fridgeSheetPdfUrl,
  FRIDGE_SHEET_PLAIN_PDF_URL as fridgeSheetPlainPdfUrl,
  requestFridgeSheetEmail,
} from '../services/fridgeSheet';
import { markFridgeSheetOpened } from '../services/userState';

const fridgeEmailNote = ref('');
async function emailFridgeSheet() {
  fridgeEmailNote.value = 'Sending…';
  try {
    const { email } = await requestFridgeSheetEmail();
    fridgeEmailNote.value = `Sent to ${email}`;
    markFridgeSheetOpened();
  } catch (e) {
    fridgeEmailNote.value = e instanceof Error ? e.message : 'Could not send.';
  }
}
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getProgressSummary, type ProgressSummary } from '@/services/userDebugAPI';
import CurriculumCard from '@/components/progress/CurriculumCard.vue';
import ReachableWordsCard from '@/components/progress/ReachableWordsCard.vue';
import { provideSkillHighlight } from '@/composables/useSkillHighlight';

// Shared store: the "Putting Them Together" card highlights the atomic skills
// in "The Pieces" that decode the current/typed word.
provideSkillHighlight();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConceptTagEntry {
  tag: string;
  score: number;
  count: number;
  threshold: string | null;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const summary = ref<ProgressSummary | null>(null);

// import.meta.env.DEV is replaced with a literal `false` in prod builds,
// so the whole debug subtree (and any code it pulls in) tree-shakes out.
const isDev = import.meta.env.DEV;

// Collapsible ELO groups (debug-only)
const showGpcTags = ref(false);
const showUiTags = ref(false);
const showOtherTags = ref(false);

// ---------------------------------------------------------------------------
// Concept-threshold map (used by debug ELO table only)
// ---------------------------------------------------------------------------

import { LESSON_CATALOG } from '@/services/lessons';

/**
 * Build a map of concept tags → the mastery thresholds that reference them
 * across all lessons. Used by the concept ELO table to show "what's needed."
 */
function buildConceptThresholdMap(): Map<string, { minCount?: number; minElo?: number }[]> {
  const map = new Map<string, { minCount?: number; minElo?: number }[]>();
  for (const lesson of LESSON_CATALOG) {
    const prereqs = lesson.availabilityConditions?.masteryPrereqs ?? [];
    for (const prereq of prereqs) {
      if (!map.has(prereq.tag)) {
        map.set(prereq.tag, []);
      }
      map.get(prereq.tag)!.push({ minCount: prereq.minCount, minElo: prereq.minElo });
    }
  }
  return map;
}

const conceptThresholdMap = isDev ? buildConceptThresholdMap() : new Map<string, { minCount?: number; minElo?: number }[]>();

// ---------------------------------------------------------------------------
// ELO grouping (debug-only computeds — won't render in prod)
// ---------------------------------------------------------------------------

const wstEntries = computed(() => {
  if (!summary.value?.letterProgression?.wstProgress) return [];
  return Object.entries(summary.value.letterProgression.wstProgress)
    .sort(([, a], [, b]) => b - a);
});

const conceptTagEntries = computed<ConceptTagEntry[]>(() => {
  if (!summary.value?.elo?.tagScores) return [];
  const entries: ConceptTagEntry[] = [];
  for (const [tag, info] of Object.entries(summary.value.elo.tagScores)) {
    if (!tag.startsWith('concept:')) continue;

    const thresholds = conceptThresholdMap.get(tag);
    let threshold: string | null = null;
    if (thresholds && thresholds.length > 0) {
      const maxCount = Math.max(...thresholds.map((t) => t.minCount ?? 0));
      const maxElo = Math.max(...thresholds.map((t) => t.minElo ?? 0));
      const parts: string[] = [];
      if (maxCount > 0) parts.push(`N≥${maxCount}`);
      if (maxElo > 0) parts.push(`ELO≥${maxElo}`);
      threshold = parts.join(', ') || null;
    }

    entries.push({
      tag,
      score: info.score,
      count: info.count,
      threshold,
    });
  }
  return entries.sort((a, b) => b.count - a.count);
});

const gpcTagEntries = computed(() => {
  if (!summary.value?.elo?.tagScores) return [];
  return Object.entries(summary.value.elo.tagScores)
    .filter(([tag]) => tag.startsWith('gpc:'))
    .sort(([, a], [, b]) => b.score - a.score);
});

const uiTagEntries = computed(() => {
  if (!summary.value?.elo?.tagScores) return [];
  return Object.entries(summary.value.elo.tagScores)
    .filter(([tag]) => tag.startsWith('ui:'))
    .sort(([, a], [, b]) => b.score - a.score);
});

const otherTagEntries = computed(() => {
  if (!summary.value?.elo?.tagScores) return [];
  return Object.entries(summary.value.elo.tagScores)
    .filter(([tag]) => !tag.startsWith('concept:') && !tag.startsWith('gpc:') && !tag.startsWith('ui:'))
    .sort(([, a], [, b]) => b.score - a.score);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTag(tag: string): string {
  const parts = tag.split(':');
  if (parts.length >= 3) {
    const namespace = parts[1];
    const gpc = parts.slice(2).join(':');
    const [grapheme, ...phonemeParts] = gpc.split('-');
    const formatted = phonemeParts.length > 0 ? `${grapheme} → ${phonemeParts.join('-')}` : gpc;
    return `${namespace}: ${formatted}`;
  }
  return tag;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleString();
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(async () => {
  try {
    summary.value = await getProgressSummary();
  } catch (err) {
    console.error('[ProgressView] Failed to load summary:', err);
  }

  // /progress is open to guests *who have done work* (their progress is the
  // sale point, and the session-summary links here). But a not-signed-in
  // browser with no local activity — e.g. an account holder opening the
  // lifecycle-email link on a cold device — has nothing to show, so send them
  // to /login with a loopback + username prefill. (Logged-in-but-empty users
  // render the empty state; we must not bounce them or they'd loop.) Keep the
  // spinner up through navigation so empty cards never flash.
  const s = summary.value;
  const hasActivity = !!s && (s.activity.seenCardCount > 0 || s.activity.sessionCount > 0);
  if (!s || (!s.isLoggedIn && !hasActivity)) {
    const query: Record<string, string> = { redirect: route.fullPath };
    const hint = route.query.username;
    if (typeof hint === 'string' && hint) query.username = hint;
    router.replace({ path: '/login', query });
    return;
  }

  loading.value = false;
});
</script>

<style scoped>
.elo-group__header {
  display: flex;
  align-items: center;
}

.elo-group__header--clickable {
  cursor: pointer;
  user-select: none;
}

.elo-group__header--clickable:hover {
  color: rgb(var(--v-theme-primary));
}

/* Dev-only scaffolding — visibly fenced off from the parent-facing cards. */
.dev-zone {
  position: relative;
  margin-top: 16px;
  padding: 12px 12px 4px;
  border: 1px dashed rgba(var(--v-theme-warning), 0.6);
  border-radius: 12px;
  background:
    repeating-linear-gradient(
      45deg,
      rgba(var(--v-theme-warning), 0.04),
      rgba(var(--v-theme-warning), 0.04) 10px,
      transparent 10px,
      transparent 20px
    );
}
.dev-zone__label {
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-warning));
  margin-bottom: 10px;
}
/* Left accent so individual cards still read as dev when scrolled deep in. */
.dev-zone :deep(.v-card) {
  border-left: 3px solid rgba(var(--v-theme-warning), 0.5);
}
</style>

<!-- Skill-highlight styles moved to composables/skillHighlight.css, imported
     by useSkillHighlight.ts so they travel with the feature (also used on
     /showHN's progress panel). -->
