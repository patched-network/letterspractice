<template>
  <v-card class="pa-4 mb-4 d-flex flex-column" style="height: 100%;">
    <v-card-title>
      Putting Them Together
    </v-card-title>

    <v-card-text class="flex-grow-1 d-flex flex-column">
      <div v-if="loading" class="text-center pa-6">
        <v-progress-circular indeterminate color="primary" size="28" />
      </div>

      <template v-else-if="result && showcase.length > 0">
        <p class="text-body-2 text-medium-emphasis mb-2">
          Here are some words that your reader is ready to take on, based on the
          letter-sounds they've practiced.
        </p>
        <p class="text-body-2 text-medium-emphasis mb-3">
          In general, these are good candidates to hand them during read-alouds,
          for either independent or lightly coached sounding-out.
        </p>

        <p class="text-subtitle-2 mb-1">New words</p>

        <!-- ============================================================ -->
        <!-- Hero showcase reel                                           -->
        <!-- ============================================================ -->
        <div
          class="reel"
          @mouseenter="hovered = true"
          @mouseleave="hovered = false"
          @focusin="onReelFocusIn"
          @focusout="onReelFocusOut"
        >
          <div v-if="currentItem" class="hero">
            <v-btn
              icon="mdi-chevron-left"
              variant="text"
              size="small"
              density="comfortable"
              aria-label="Previous word"
              @click="prev"
            />
            <div class="hero-stage">
              <v-fade-transition mode="out-in">
                <div :key="currentItem.word" class="hero-slide">
                  <v-chip
                    size="x-small"
                    variant="tonal"
                    :color="tierColor(currentItem.tier)"
                    class="mb-2"
                  >
                    {{ currentItem.sortLabel }}
                  </v-chip>
                  <div class="hero-word" :class="`hero-word--${currentItem.tier}`">
                    {{ currentItem.word }}
                  </div>
                  <div class="hero-hint text-caption text-medium-emphasis mt-1">
                    {{ tierHint(currentItem.tier) }}
                  </div>
                </div>
              </v-fade-transition>
            </div>
            <v-btn
              icon="mdi-chevron-right"
              variant="text"
              size="small"
              density="comfortable"
              aria-label="Next word"
              @click="next"
            />
          </div>

          <div v-if="showcase.length > 1" class="hero-dots">
            <button
              v-for="(item, i) in showcase"
              :key="item.word"
              class="hero-dot"
              :class="{ 'hero-dot--active': i === current }"
              :aria-label="`Show ${item.word}`"
              @click="goto(i)"
            />
          </div>
        </div>

        <v-divider class="my-4" />

        <!-- ============================================================ -->
        <!-- Cumulative reach — the whole skillset, not just the recent reel -->
        <!-- ============================================================ -->
        <div v-if="reachTotal > 0" class="reach-total">
          <p class="text-body-2 text-medium-emphasis mb-1">
            Altogether, we estimate your reader can take on around
          </p>
          <div class="reach-total__count">
            <span class="reach-total__num">~{{ niceTotal.toLocaleString() }}</span>
            <span class="reach-total__unit">words</span>
          </div>
          <p class="text-caption text-medium-emphasis mt-1 mb-0">
            with the letter-sounds they have so far.
          </p>

          <v-btn
            variant="text"
            size="small"
            color="primary"
            class="mt-1"
            @click="showAll = !showAll"
          >
            <v-icon size="16" class="mr-1">{{ showAll ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
            {{ showAll ? 'Hide' : 'See all' }}
          </v-btn>

          <v-expand-transition>
            <div v-if="showAll" class="reach-all">
              <div v-for="g in result.groups" :key="g.key" class="reach-all__group">
                <div class="reach-all__label">
                  {{ g.label }}
                  <span class="text-medium-emphasis">· {{ g.words.length }}</span>
                </div>
                <div class="reach-all__chips">
                  <button
                    v-for="w in visibleWords(g)"
                    :key="w.word"
                    type="button"
                    class="reach-chip reach-chip--btn"
                    :class="{ 'reach-chip--active': selectedWord && selectedWord.word === w.word }"
                    @click="selectReachWord(w)"
                  >{{ w.word }}</button>
                  <button
                    v-if="g.words.length > ALL_CAP && !expandedGroups.has(g.key)"
                    type="button"
                    class="reach-chip reach-chip--more"
                    @click="expandGroup(g.key)"
                  >+{{ g.words.length - ALL_CAP }} more</button>
                </div>
              </div>
            </div>
          </v-expand-transition>
        </div>

        <v-spacer />
        <v-divider class="my-4" />

        <!-- ============================================================ -->
        <!-- Interactive checker                                          -->
        <!-- ============================================================ -->
        <p class="text-subtitle-2 mb-1">Try a word</p>
        <p class="text-caption text-medium-emphasis mb-2">
          Type any word to see which sounds your reader has, and which are still new.
        </p>
        <v-text-field
          v-model="checkInput"
          density="compact"
          variant="outlined"
          placeholder="e.g. ship, frog, cake…"
          hide-details
          class="mb-3"
          style="max-width: 320px;"
          @keyup.enter="runCheck"
        >
          <template #append-inner>
            <v-btn size="small" variant="text" color="primary" @click="runCheck">check</v-btn>
          </template>
        </v-text-field>

        <div v-if="check" class="checker-result">
          <div class="checker-word mb-2">
            <span
              v-for="(seg, i) in check.segments"
              :key="i"
              class="checker-seg"
              :class="check.isSightWord ? 'checker-seg--sight' : `checker-seg--${seg.state}`"
              :title="check.isSightWord ? `${seg.text} — part of a sight word` : segTitle(seg)"
            >{{ seg.text }}</span>
          </div>
          <v-alert
            :type="verdictAlert.type"
            density="compact"
            variant="tonal"
            class="text-body-2"
          >
            {{ verdictAlert.text }}
          </v-alert>
        </div>
      </template>

      <!-- Cold-start: consonants but no vowel yet --------------------- -->
      <!-- Usually the very first time a parent sees this card (post session-1),
           so it does double duty: introduce what the section is *for*, then
           explain why it's empty right now (no vowel ⇒ nothing decodable yet). -->
      <!-- TODO: the i/it · a/cat examples are static; could be sourced from the
           next vowel(s) in the curriculum once the ordering is exposed here. -->
      <div v-else-if="vowelGap" class="vowel-gap">
        <p class="vowel-gap__lead mb-3">
          This is where we explore what your reader is ready to take on using their built skills.
        </p>
        <p class="vowel-gap__lead mb-3">

        </p>
        <p class="text-medium-emphasis mb-3">
          There's nothing here yet, because we haven't met any <strong>vowels</strong>. Consonents
          come earlier because they're the easiest sounds to tell apart.
        </p>
        <p class="text-medium-emphasis mb-0">
            <strong>i</strong> (as in <em>it</em>) and <strong>a</strong>
          (as in <em>cat</em>) will be arriving soon, and this section will fill up fast!
        </p>
      </div>

      <!-- Zero state -------------------------------------------------- -->
      <!-- No phonics skills recorded yet, so there's nothing to decode and
           the checker would only ever fail — show forward-looking copy only. -->
      <div v-else class="zero-state">
        <v-icon size="32" color="primary" class="mb-2">mdi-book-open-page-variant-outline</v-icon>
        <p class="text-body-2 text-medium-emphasis mb-2">
          As your reader picks up new letter-sounds, this is where you'll
          discover and explore what they're ready to read.
        </p>
        <p class="text-body-2 text-medium-emphasis mb-0">
          We'll surface words to try together — handy picks for co-reading and
          read-alouds, with the occasional one to hand off and let them sound
          out on their own.
        </p>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import type { ProgressSummary } from '@/services/userDebugAPI';
import {
  getReachableWords,
  buildGpcProfile,
  buildShowcase,
  checkWord,
  isVowelGpc,
  type ReachableResult,
  type ScoredWord,
  type FeatureGroup,
  type ShowcaseItem,
  type WordTier,
  type CheckSegment,
  type CheckResult,
  type GpcMastery,
} from '@/services/reachableWords';
import { useSkillHighlight, type SkillHighlightState } from '@/composables/useSkillHighlight';
import { sightWordInPlay } from '@/services/lessons/progress/sightWordsReporter';

const props = defineProps<{ summary: ProgressSummary | null }>();

const AUTO_MS = 4000;
/** Max words rendered per feature group in the "See all" panel. */
const ALL_CAP = 60;

const loading = ref(true);
const result = ref<ReachableResult | null>(null);
const profile = ref<Map<string, GpcMastery>>(new Map());

const checkInput = ref('');
const check = ref<CheckResult | null>(null);

const showAll = ref(false);
/** A word clicked in the "See all" panel — holds the skill highlight until
 *  cleared (toggled off, checker runs, panel collapses, or data reloads). */
const selectedWord = ref<ScoredWord | null>(null);
/** Feature-group keys whose word list has been fully expanded (past ALL_CAP). */
const expandedGroups = ref<Set<string>>(new Set());

/** Words to render for a group — capped, unless the group's been expanded. */
function visibleWords(g: FeatureGroup): ScoredWord[] {
  return expandedGroups.value.has(g.key) ? g.words : g.words.slice(0, ALL_CAP);
}
function expandGroup(key: string): void {
  expandedGroups.value = new Set(expandedGroups.value).add(key);
}

// ---------------------------------------------------------------------------
// Cumulative reach — the full skillset total (contrast to the recency reel)
// ---------------------------------------------------------------------------

/** Everything within reach: confident (solid) + read-together (stretch). */
const reachTotal = computed(() =>
  result.value ? result.value.solid.length + result.value.stretch.length : 0,
);

/** Round to a friendly figure — these are estimates, so don't feign precision. */
function roundNice(n: number): number {
  if (n < 20) return n;
  if (n < 100) return Math.round(n / 5) * 5;
  if (n < 1000) return Math.round(n / 10) * 10;
  return Math.round(n / 50) * 50;
}
const niceTotal = computed(() => roundNice(reachTotal.value));

// Skill highlight — shimmer the decoding skills in "The Pieces", but only while
// the reel has the reader's attention. Tiles lighting up in time with an
// unattended, self-advancing carousel is just motion noise.
const highlight = useSkillHighlight();
const hovered = ref(false);
/** Keyboard focus within the reel. Mouse-click focus is left to `hovered` +
 *  `navigated`, so a clicked chevron doesn't hold the reel paused until the
 *  reader happens to click elsewhere. */
const focused = ref(false);
/** Clicked through (chevron/dot) — holds the highlight until the reel next moves
 *  on its own, so it outlives the pointer leaving (touch, or glancing over at
 *  the Pieces). */
const navigated = ref(false);
/** Hover/focus pause the reel; clicking through only restarts its dwell. */
const paused = computed(() => hovered.value || focused.value);
const engaged = computed(() => paused.value || navigated.value);

// ---------------------------------------------------------------------------
// Showcase reel
// ---------------------------------------------------------------------------

const showcase = computed<ShowcaseItem[]>(() =>
  result.value ? buildShowcase(result.value) : [],
);
const current = ref(0);
const currentItem = computed<ShowcaseItem | null>(() => showcase.value[current.value] ?? null);

// Cold-start: consonants exercised but no vowel yet. Every decodable word needs
// a vowel, so the empty reel is *correct* here — we explain why rather than show
// a bare "nothing yet". Distinct from the truly-blank profile (generic copy).
const vowelGap = computed(() => {
  if (showcase.value.length > 0) return false;
  let anyConsonant = false;
  let anyVowel = false;
  for (const m of profile.value.values()) {
    if (!m.seen) continue;
    if (isVowelGpc(m.gpcId)) anyVowel = true;
    else anyConsonant = true;
  }
  return anyConsonant && !anyVowel;
});

let autoTimer: ReturnType<typeof setInterval> | null = null;

function stopAuto(): void {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
}
/** (Re)start the dwell timer — a no-op while the reel is paused. */
function startAuto(): void {
  stopAuto();
  if (paused.value || showcase.value.length <= 1) return;
  autoTimer = setInterval(() => {
    current.value = (current.value + 1) % showcase.value.length;
    navigated.value = false; // moving on its own again → release the highlight
  }, AUTO_MS);
}
watch(paused, (p) => (p ? stopAuto() : startAuto()));

function onReelFocusIn(e: FocusEvent): void {
  focused.value = (e.target as HTMLElement).matches(':focus-visible');
}
function onReelFocusOut(e: FocusEvent): void {
  const reel = e.currentTarget as HTMLElement;
  if (!reel.contains(e.relatedTarget as Node | null)) focused.value = false;
}

function next(): void {
  if (showcase.value.length === 0) return;
  current.value = (current.value + 1) % showcase.value.length;
  navigated.value = true;
  startAuto(); // reset the dwell timer after a manual nudge
}
function prev(): void {
  if (showcase.value.length === 0) return;
  current.value = (current.value - 1 + showcase.value.length) % showcase.value.length;
  navigated.value = true;
  startAuto();
}
function goto(i: number): void {
  current.value = i;
  navigated.value = true;
  startAuto();
}

watch(
  showcase,
  () => {
    current.value = 0;
    navigated.value = false;
    startAuto();
  },
  { immediate: true },
);

// Mirror the current word's component skills into "The Pieces". A manual focus
// (checker result, or a clicked "See all" word) owns the highlight; otherwise
// the carousel drives it — but only while engaged (see `engaged`).
watch(
  [currentItem, check, selectedWord, engaged],
  () => {
    if (!highlight) return;
    if (check.value || selectedWord.value) return; // manual focus owns it
    const item = currentItem.value;
    if (!item || !engaged.value) {
      highlight.clear();
      return;
    }
    const map = new Map<string, SkillHighlightState>();
    for (const g of item.gpcs) map.set(g, 'used');
    highlight.set(map, true);
  },
  { immediate: true },
);

onUnmounted(() => {
  stopAuto();
  highlight?.clear();
});

function tierColor(tier: WordTier): string {
  return tier === 'solid' ? 'success' : 'warning';
}
function tierHint(tier: WordTier): string {
  return tier === 'solid'
    ? 'can likely sound this out on their own'
    : 'a good one to read together';
}

// ---------------------------------------------------------------------------
// Data load
// ---------------------------------------------------------------------------

watch(
  () => props.summary?.elo?.tagScores,
  async (tagScores) => {
    loading.value = true;
    check.value = null;
    showAll.value = false;
    selectedWord.value = null;
    expandedGroups.value = new Set();
    if (!tagScores) {
      result.value = null;
      profile.value = new Map();
      loading.value = false;
      return;
    }
    profile.value = buildGpcProfile(tagScores);
    try {
      result.value = await getReachableWords(tagScores);
    } catch (err) {
      console.error('[ReachableWordsCard] failed to compute reachable words:', err);
      result.value = null;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

// ---------------------------------------------------------------------------
// Interactive checker
// ---------------------------------------------------------------------------

function runCheck(): void {
  selectedWord.value = null; // checker supersedes a clicked "See all" word
  const text = checkInput.value.trim();
  if (!text) {
    check.value = null; // released → the watcher hands back to the carousel
    return;
  }
  check.value = checkWord(text, profile.value);
  pushCheckerHighlight();
}

/** Click a word in the "See all" panel → light up its decoding skills in
 *  "The Pieces". Click again to release; collapsing the panel also releases. */
function selectReachWord(w: ScoredWord): void {
  if (selectedWord.value?.word === w.word) {
    selectedWord.value = null; // toggle off → the watcher hands back to the carousel
    return;
  }
  check.value = null; // a click supersedes any checker result
  selectedWord.value = w;
  if (!highlight) return;
  const map = new Map<string, SkillHighlightState>();
  for (const g of w.gpcs) map.set(g, 'used');
  highlight.set(map, true);
}

// Releasing the panel drops any held selection so the carousel takes back over.
watch(showAll, (open) => {
  if (!open) {
    selectedWord.value = null;
    expandedGroups.value = new Set();
  }
});

function pushCheckerHighlight(): void {
  if (!highlight || !check.value) return;
  if (check.value.isSightWord) {
    // Sight words aren't built from teachable letter-skills — don't mislead.
    highlight.clear();
    return;
  }
  const map = new Map<string, SkillHighlightState>();
  for (const seg of check.value.segments) {
    if (!seg.gpcId) continue;
    if (seg.state === 'solid' || seg.state === 'shaky') map.set(seg.gpcId, 'used');
    else if (seg.state === 'new') map.set(seg.gpcId, 'missing');
  }
  highlight.set(map, true);
}

function segTitle(seg: CheckSegment): string {
  const sound = seg.phoneme ? `/${seg.phoneme}/` : '(silent)';
  switch (seg.state) {
    case 'solid':
      return `${seg.text} → ${sound} — solid`;
    case 'shaky':
      return `${seg.text} → ${sound} — still settling`;
    case 'new':
      return `${seg.text} → ${sound} — not introduced yet`;
    default:
      return `${seg.text} — not in the phonics scheme`;
  }
}

const verdictAlert = computed<{ type: 'success' | 'info' | 'warning'; text: string }>(() => {
  if (!check.value) return { type: 'info', text: '' };
  const { verdict, blockers, word } = check.value;
  if (verdict === 'sight') {
    const inPlay = sightWordInPlay(word, props.summary?.elo?.tagScores ?? {});
    return {
      type: 'info',
      text:
        `"${word}" is a sight word — it doesn't follow the usual rules, so it's one to learn by heart rather than sound out. ` +
        (inPlay ? "It's in play: your reader has met it and is practising it." : "Your reader hasn't met it here yet."),
    };
  }
  if (verdict === 'confident') {
    return { type: 'success', text: `Your reader can likely sound out "${word}" on their own.` };
  }
  if (verdict === 'stretch') {
    return {
      type: 'info',
      text: `"${word}" is a good stretch — all the sounds are familiar, just not rock-solid yet. A nice one to read together.`,
    };
  }
  const uniq = [...new Set(blockers)];
  const list = uniq.map((b) => `"${b}"`).join(', ');
  return {
    type: 'warning',
    text: `"${word}" is still ahead — the ${list} ${uniq.length > 1 ? 'sounds are' : 'sound is'} new. One to read aloud for them.`,
  };
});
</script>

<style scoped>
/* Hero showcase reel ------------------------------------------------------ */
.hero {
  display: flex;
  align-items: center;
  gap: 4px;
}
.hero-stage {
  flex: 1 1 auto;
  min-height: 110px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hero-slide {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.hero-word {
  font-family: 'Georgia', serif;
  font-size: 2.75rem;
  line-height: 1.1;
  letter-spacing: 0.04em;
}
.hero-word--solid {
  color: rgb(var(--v-theme-success));
}
.hero-word--stretch {
  color: rgb(var(--v-theme-warning));
}
.hero-hint {
  max-width: 220px;
}

.hero-dots {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
}
.hero-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: pointer;
  background: rgba(var(--v-theme-on-surface), 0.2);
  transition: background 0.2s, transform 0.2s;
}
.hero-dot--active {
  background: rgb(var(--v-theme-primary));
  transform: scale(1.3);
}

/* Cumulative reach ("Altogether… ~N words") ------------------------------- */
.reach-total {
  text-align: center;
}
.reach-total__count {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  line-height: 1;
}
.reach-total__num {
  font-size: 2.4rem;
  font-weight: 800;
  color: rgb(var(--v-theme-primary));
  font-variant-numeric: tabular-nums;
}
.reach-total__unit {
  font-size: 1.05rem;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
}
.reach-all {
  text-align: left;
  margin-top: 4px;
}
.reach-all__group {
  margin-bottom: 12px;
}
.reach-all__label {
  font-size: 0.78rem;
  font-weight: 700;
  margin-bottom: 4px;
}
.reach-all__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.reach-chip {
  font-size: 0.8rem;
  padding: 1px 8px;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.reach-chip--more {
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
  font-family: inherit;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}
.reach-chip--more:hover {
  background: rgba(var(--v-theme-primary), 0.12);
}
.reach-chip--btn {
  font-family: inherit;
  color: inherit;
  line-height: inherit;
  border: none;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.reach-chip--btn:hover {
  background: rgba(var(--v-theme-primary), 0.14);
}
.reach-chip--active {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

/* Cold-start (consonants, no vowel) — left-aligned prose, sized up since it
   has the whole card to itself. Mirrors the intro paragraph's voice. */
.vowel-gap {
  margin: auto 0;
  max-width: 52ch;
}
.vowel-gap p {
  font-size: 1.0625rem;
  line-height: 1.6;
}
.vowel-gap__lead {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-weight: 500;
}

/* Zero state -------------------------------------------------------------- */
.zero-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 12px 8px;
  margin: auto 0;
}

/* Interactive checker ----------------------------------------------------- */
.checker-word {
  font-family: 'Georgia', serif;
  font-size: 2rem;
  letter-spacing: 0.02em;
}
.checker-seg {
  display: inline-block;
  padding: 0 1px;
  border-bottom: 3px solid transparent;
}
.checker-seg--solid {
  color: rgb(var(--v-theme-success));
  border-bottom-color: rgb(var(--v-theme-success));
}
.checker-seg--shaky {
  color: rgb(var(--v-theme-warning));
  border-bottom-color: rgb(var(--v-theme-warning));
}
.checker-seg--new {
  color: rgb(var(--v-theme-error));
  border-bottom-color: rgb(var(--v-theme-error));
}
.checker-seg--unknown {
  color: rgba(var(--v-theme-on-surface), 0.4);
  text-decoration: line-through;
}
/* Sight word: learned whole, not sounded out — a quiet dotted underline. */
.checker-seg--sight {
  color: rgb(var(--v-theme-secondary));
  border-bottom: 3px dotted rgb(var(--v-theme-secondary));
}
</style>
