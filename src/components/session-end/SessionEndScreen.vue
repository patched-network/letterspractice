<template>
  <div class="session-end-screen">
    <div class="end-screen-split">
      <!-- Hero: Letters Practicing Vignette -->
      <div class="end-screen-hero">
        <div class="vignette-wrapper">
          <JJugglingVignette
            ref="vignetteRef"
            :stage="vignetteStage"
            :auto-play="true"
          />

          <!-- Info icon overlay -->
          <button
            class="info-toggle"
            :class="{ 'is-pulse': !infoSeen }"
            aria-label="About this animation"
            @click="toggleInfo"
          >
            <v-icon icon="mdi-information-outline" size="22" />
          </button>

          <!-- Info callout (auto-shown on first visit, dismissible) -->
          <transition name="info-fade">
            <div v-if="infoOpen" class="info-callout" role="dialog">
              <p class="info-text">
                The letters love their work, but they also have lots of hobbies.
                While you practice your letters, the letters work together to do
                some practice of their own! Come back again to see the skills grow.
              </p>
              <button class="info-dismiss" @click="dismissInfo">Got it</button>
            </div>
          </transition>
        </div>
      </div>

      <!-- Sidebar: parent-facing summary + actions (desktop/laptop) -->
      <aside class="end-screen-sidebar">
        <div class="sidebar-summary">
          <!-- Zero cards drawn. Reachable since the intro gate began hard-zeroing
               withheld cards: a free-tier account at the ceiling that has also
               cleared its review queue has genuinely nothing due. Rendering the
               normal summary here would show a row of zeroes and read as a
               failure, so say what actually happened instead. -->
          <div v-if="nothingToStudy" class="nothing-due">
            <v-icon size="28" color="success" class="mb-2">mdi-check-circle-outline</v-icon>
            <p class="nothing-due__title">All caught up</p>
            <p class="nothing-due__body">
              <template v-if="atThreshold">
                Everything in {{ childPossessive }} current set is reviewed and
                due nothing right now. New letters and lessons come with the full
                version — otherwise, check back tomorrow when reviews come round.
              </template>
              <template v-else>
                Nothing is due right now — reviews come back around on their own
                schedule. Check again tomorrow.
              </template>
            </p>
          </div>

          <SessionSummary
            v-else
            :new-topics="summary.newTopics"
            :reviewed-topics="summary.reviewedTopics"
            :trouble-spots="summary.troubleSpots"
            :coming-soon="summary.comingSoon"
            :total-cards="summary.totalCards"
          />
        </div>

        <div class="sidebar-actions">
          <!-- Fridge sheet: "print it" until the family has one, then
               "colour these in" whenever the session introduced something.
               Policy in services/fridgeSheet.ts. -->
          <FridgeSheetNudge
            v-if="fridgeNudge.kind !== 'none'"
            :nudge="fridgeNudge"
            @opened="onFridgeSheetOpened"
            @dismissed="onFridgeSheetDismissed"
          />

          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-chart-line"
            @click="goToProgress"
          >
            See progress
          </v-btn>

          <!-- Funnel: create account -->
          <template v-if="props.userTier === 'funnel'">
            <v-btn
              color="primary"
              variant="elevated"
              size="small"
              prepend-icon="mdi-account-plus"
              @click="router.push('/signup')"
            >
              Create Account
            </v-btn>
          </template>

          <!-- Free tier: word-count progress, then the milestone. Progress
               pressure, not time pressure — nothing here counts down. -->
          <template v-else-if="props.userTier === 'trial' && props.showPurchaseCta">
            <div class="purchase-nudge">
              <span class="nudge-text">
                <template v-if="atThreshold">
                  {{ wordCountLabel }} words — everything so far stays free
                </template>
                <template v-else>
                  {{ wordCountLabel }} of {{ wordThresholdLabel }} free words
                </template>
              </span>
              <v-btn
                color="primary"
                variant="elevated"
                size="small"
                @click="offer && router.push(offer.path)"
              >
                {{ atThreshold ? `Keep going — ${offer?.price} once` : 'Get Lifetime Access' }}
              </v-btn>
            </div>
          </template>

          <!-- Paid: share -->
          <template v-else-if="props.userTier === 'paid'">
            <v-btn
              variant="tonal"
              color="primary"
              size="small"
              prepend-icon="mdi-share-variant"
              @click="handleShare"
            >
              Share
            </v-btn>
          </template>
        </div>
      </aside>
    </div>

    <!-- Abbreviated strip: shown on narrow form factors (mobile/tablet) -->
    <div class="end-screen-strip">
      <div class="strip-stats">
        <span class="strip-stat">
          <strong>{{ summary.totalCards }}</strong>
          {{ summary.totalCards === 1 ? 'card' : 'cards' }}
        </span>
        <span v-if="summary.newTopics.length > 0" class="strip-stat">
          <strong>{{ summary.newTopics.length }}</strong> new
        </span>
        <span v-if="summary.troubleSpots.length > 0" class="strip-stat trouble">
          <strong>{{ summary.troubleSpots.length }}</strong> working&nbsp;on
        </span>
      </div>
      <FridgeSheetNudge
        v-if="fridgeNudge.kind !== 'none'"
        :nudge="fridgeNudge"
        compact
        class="strip-fridge"
        @opened="onFridgeSheetOpened"
        @dismissed="onFridgeSheetDismissed"
      />

      <div class="strip-actions">
        <v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-chart-line"
          @click="router.push('/progress')"
        >
          See progress
        </v-btn>

        <!-- Funnel: create account -->
        <template v-if="props.userTier === 'funnel'">
          <v-btn
            color="primary"
            variant="elevated"
            size="small"
            prepend-icon="mdi-account-plus"
            @click="router.push('/signup')"
          >
            Create Account
          </v-btn>
        </template>

        <!-- Trial at milestone/final-week: purchase nudge -->
        <template v-else-if="props.userTier === 'trial' && props.showPurchaseCta">
          <v-btn
            color="primary"
            variant="elevated"
            size="small"
            @click="offer && router.push(offer.path)"
          >
            Get Lifetime
          </v-btn>
        </template>

        <!-- Paid: share -->
        <template v-else-if="props.userTier === 'paid'">
          <v-btn
            variant="tonal"
            color="primary"
            size="small"
            prepend-icon="mdi-share-variant"
            @click="handleShare"
          >
            Share
          </v-btn>
        </template>

        <!-- Expand/collapse details -->
        <v-btn
          variant="text"
          size="small"
          :prepend-icon="stripExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          @click="stripExpanded = !stripExpanded"
        >
          {{ stripExpanded ? 'Hide details' : 'See details' }}
        </v-btn>
      </div>

      <!-- Expandable detailed summary (mobile accordion) -->
      <transition name="strip-expand">
        <div v-if="stripExpanded" class="strip-detail">
          <SessionSummary
            :new-topics="summary.newTopics"
            :reviewed-topics="summary.reviewedTopics"
            :trouble-spots="summary.troubleSpots"
            :coming-soon="summary.comingSoon"
            :total-cards="summary.totalCards"
          />
        </div>
      </transition>
    </div>
  </div>

  <v-snackbar v-model="showCopiedSnackbar" :timeout="2500" location="bottom">
    Link copied!
  </v-snackbar>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, toRef } from 'vue';
import { useRouter } from 'vue-router';
import SessionSummary from './SessionSummary.vue';
import JJugglingVignette from '../../practicing/JJugglingVignette.vue';
import {
  useSessionSummary,
  type SessionRecordEntry,
} from '../../composables/useSessionSummary';
import { markArrivedFromSession } from '../../composables/useSessionArrival';
import { incrementDevDayOffset } from '../../dbg/devDateOffset';
import FridgeSheetNudge from './FridgeSheetNudge.vue';
import { decideFridgeSheetNudge, type FridgeSheetNudge as FridgeSheetNudgeKind } from '../../services/fridgeSheet';
import { shareUrl } from '../../config/site';
import { sellOffer } from '../../entitlement';
import {
  getFridgeSheetState,
  getLetterProgression,
  markFridgeSheetOpened,
  dismissFridgeSheetPrompt,
} from '../../services/userState';

// ---------------------------------------------------------------------------
// Props & Emits
// ---------------------------------------------------------------------------

const props = defineProps<{
  /** The session record array emitted by StudySession's session-finished event */
  sessionRecords: SessionRecordEntry[];
  /** Vignette progression stage (0-based; the stage loader clamps to the terminal stage) */
  vignetteStage?: number;
  /** User tier for CTA selection */
  userTier?: 'funnel' | 'trial' | 'paid' | 'unknown';
  /**
   * Words the child's introduced graphemes make decodable — the free tier's
   * progress metric. Replaced the trial's sessions/days countdown: the
   * boundary is an achievement now, not a calendar.
   */
  wordCount?: number;
  /** The free-tier word ceiling (the entitlement provider's wordLimit); undefined when there is none. */
  wordThreshold?: number;
  /** Whether to show the purchase CTA (milestone or ceiling logic) */
  showPurchaseCta?: boolean;
  /**
   * Fridge-sheet nudge override. `auto` (default) reads persisted state and
   * letter progression; the others force a rendering (debug view).
   */
  fridgeSheetMode?: 'auto' | 'none' | 'print' | 'colour';
}>();

// Kept for backwards-compat with existing listeners; no longer wired to a button.
defineEmits<{
  (e: 'go-home'): void;
}>();

const router = useRouter();

// Local scalar computeds rather than reaching into props in the template for
// the formatting — keeps the thousands separator in one place, and matches the
// house idiom of binding templates to plain locals.
const wordCountLabel = computed(() => (props.wordCount ?? 0).toLocaleString());
const wordThresholdLabel = computed(() => (props.wordThreshold ?? 0).toLocaleString());
const atThreshold = computed(
  () =>
    props.wordThreshold !== undefined &&
    (props.wordCount ?? 0) >= props.wordThreshold,
);

/**
 * The session drew no cards at all.
 *
 * Newly reachable: `IntroGateFilter` hard-zeroes withheld intros rather than
 * penalizing them, so a free-tier account at the word ceiling that has also
 * cleared its review queue can legitimately have an empty candidate set. The
 * framework handles that correctly — `loadCard(null)` finishes the session —
 * but the default summary would render a column of zeroes, which reads as a
 * bug rather than as "nothing is due".
 */
const nothingToStudy = computed(() => props.sessionRecords.length === 0);

const childPossessive = 'your child\'s';

function goToProgress() {
  // Mark this as a post-session arrival so the header suppresses its
  // "Study Now" CTA on /progress — you just studied; don't nag.
  markArrivedFromSession();
  router.push('/progress');
}

// ---------------------------------------------------------------------------
// Session Summary
// ---------------------------------------------------------------------------

const recordsRef = toRef(props, 'sessionRecords');
const { summary, loadComingSoon } = useSessionSummary(recordsRef);

const vignetteStage = computed(() => props.vignetteStage ?? 0);
const vignetteRef = ref<InstanceType<typeof JJugglingVignette> | null>(null);

// ---------------------------------------------------------------------------
// Fridge sheet nudge (services/fridgeSheet.ts)
// ---------------------------------------------------------------------------

const fridgeNudge = ref<FridgeSheetNudgeKind>({ kind: 'none' });

async function loadFridgeNudge() {
  const mode = props.fridgeSheetMode ?? 'auto';
  const newGraphemes = summary.value.newTopics.map((t) => t.grapheme);
  if (mode === 'none') {
    fridgeNudge.value = { kind: 'none' };
    return;
  }
  if (mode === 'print') {
    fridgeNudge.value = { kind: 'print' };
    return;
  }
  if (mode === 'colour') {
    fridgeNudge.value = decideFridgeSheetNudge({
      state: { updatedAt: '', openedAt: 'debug', dismissCount: 0 },
      userTier: 'paid',
      unlockedCount: 99,
      newGraphemes: newGraphemes.length > 0 ? newGraphemes : ['m', 'sh'],
    });
    return;
  }
  try {
    const [state, progression] = await Promise.all([getFridgeSheetState(), getLetterProgression()]);
    fridgeNudge.value = decideFridgeSheetNudge({
      state,
      userTier: props.userTier ?? 'unknown',
      unlockedCount: progression?.unlockedLetters.length ?? 0,
      newGraphemes,
    });
  } catch (e) {
    console.debug('[SessionEndScreen] Could not decide fridge sheet nudge:', e);
  }
}

function onFridgeSheetOpened() {
  // Keep the prompt on screen for this session (the PDF opened in a new
  // tab; the parent may come back to it); it flips to "colour" next time.
  markFridgeSheetOpened();
}

function onFridgeSheetDismissed() {
  fridgeNudge.value = { kind: 'none' };
  dismissFridgeSheetPrompt();
}

// ---------------------------------------------------------------------------
// Info callout (first-visit auto-show)
// ---------------------------------------------------------------------------

const INFO_SEEN_KEY = 'lp.vignette.info.seen';

const infoSeen = ref(
  typeof localStorage !== 'undefined' && localStorage.getItem(INFO_SEEN_KEY) === '1',
);
const infoOpen = ref(false);

// Mobile/tablet accordion state for the abbreviated strip
const stripExpanded = ref(false);

function toggleInfo() {
  infoOpen.value = !infoOpen.value;
  markInfoSeen();
}

function dismissInfo() {
  infoOpen.value = false;
  markInfoSeen();
}

function markInfoSeen() {
  if (infoSeen.value) return;
  infoSeen.value = true;
  try {
    localStorage.setItem(INFO_SEEN_KEY, '1');
  } catch {
    // ignore (private mode etc.)
  }
}

// ---------------------------------------------------------------------------
// Share handler
// ---------------------------------------------------------------------------

/** What can be bought here; the purchase nudges only render when showPurchaseCta, which implies one. */
const offer = sellOffer();

const showCopiedSnackbar = ref(false);

async function handleShare() {
  const url = shareUrl();
  const text = 'Check out LettersPractice — early literacy practice for toddlers!';
  if (navigator.share) {
    try {
      await navigator.share({ title: 'LettersPractice', text, url });
    } catch {
      // user cancelled — ignore
    }
  } else {
    await navigator.clipboard.writeText(url);
    showCopiedSnackbar.value = true;
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(async () => {
  loadFridgeNudge();
  // Fire-and-forget: this runs the pipeline forecast (full card-space scan) and
  // caches it; the "Coming Soon" section fills in reactively when it resolves.
  // Don't block the rest of mount (dev day-offset, info popup) on it.
  void loadComingSoon();
  incrementDevDayOffset();

  // First-visit auto-show, slight delay so it doesn't pop before the screen settles.
  if (!infoSeen.value) {
    setTimeout(() => {
      infoOpen.value = true;
    }, 700);
  }
});
</script>

<style scoped>
.session-end-screen {
  width: 100%;
  /* No max-width: vignette hero bleeds to viewport edges (edge-frameless). */
  margin: 0;
  padding: 0;
  animation: fadeSlideUp 0.45s ease-out both;
  /* Fill the session-finished slot (a flex column in StudySession) so the
     vignette hero grows with the viewport. In non-flex parents (dbg embeds)
     this degrades to height:auto with the min-height floor below. */
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* Container-query host: lets the layout respond to its rendered width
     (not just window width), so the debug viewer's width sim works too. */
  container-type: inline-size;
  container-name: end-screen;
}

@keyframes fadeSlideUp {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.end-screen-split {
  display: flex;
  gap: 16px;
  /* Grow to fill available height; the min-height is a floor for short
     viewports (content overflows into the ancestor scroll area). */
  flex: 1;
  min-height: 480px;
  /* Right-only inset so the sidebar card breathes from the viewport edge
     while the hero on the left bleeds all the way out. */
  padding-right: 16px;
}

/* Hero — vignette: edge-frameless, no chrome */
.end-screen-hero {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  /* No background, no border, no radius — let the vignette own the space. */
}

.vignette-wrapper {
  position: relative;
  flex: 1;
  min-height: 0;
  padding: 0;
}

/* Sidebar — stays a contained card */
.end-screen-sidebar {
  flex: 0 0 320px;
  min-width: 280px;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  background: rgba(var(--v-theme-surface), 1);
  border-radius: 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  overflow: hidden;
  margin-top: 16px;
  margin-bottom: 16px;
}

.sidebar-summary {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* Empty-session state — see `nothingToStudy`. */
.nothing-due {
  padding: 20px 8px;
  text-align: center;
}

.nothing-due__title {
  margin: 0 0 6px;
  font-size: 1rem;
  font-weight: 700;
}

.nothing-due__body {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
  opacity: 0.8;
}

.sidebar-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 12px 16px 14px;
  border-top: 1px solid rgba(var(--v-border-color), 0.08);
  margin-top: auto;
}

.purchase-nudge {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

.nudge-text {
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  line-height: 1.3;
  text-align: center;
}

/* Info overlay */
.info-toggle {
  position: absolute;
  top: 10px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-surface), 0.85);
  backdrop-filter: blur(4px);
  color: rgba(var(--v-theme-on-surface), 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.15s;
  z-index: 2;
}

.info-toggle:hover {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgba(var(--v-theme-primary), 1);
}

.info-toggle.is-pulse {
  animation: infoPulse 2.4s ease-in-out infinite;
}

@keyframes infoPulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-primary), 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(var(--v-theme-primary), 0);
  }
}

.info-callout {
  position: absolute;
  top: 52px;
  right: 12px;
  max-width: 280px;
  padding: 12px 14px 10px;
  background: rgba(var(--v-theme-surface), 0.98);
  border: 1px solid rgba(var(--v-theme-primary), 0.35);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 3;
}

.info-text {
  font-size: 0.82rem;
  line-height: 1.4;
  color: rgba(var(--v-theme-on-surface), 0.85);
  margin: 0 0 8px;
}

.info-dismiss {
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(var(--v-theme-primary), 1);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  align-self: flex-end;
  display: block;
  margin-left: auto;
}

.info-dismiss:hover {
  text-decoration: underline;
}

.info-fade-enter-active,
.info-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.info-fade-enter-from,
.info-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Abbreviated bottom strip — hidden by default, shown on narrow form factors */
.end-screen-strip {
  display: none;
  flex-direction: column;
  gap: 8px;
  margin: 12px;
  padding: 10px 14px;
  background: rgba(var(--v-theme-surface), 1);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
}

.strip-stats {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 0.82rem;
  color: rgba(var(--v-theme-on-surface), 0.75);
}

.strip-stat strong {
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 1);
  font-variant-numeric: tabular-nums;
}

.strip-stat.trouble strong {
  color: rgba(var(--v-theme-warning), 1);
}

.strip-fridge {
  padding: 4px 0 6px;
}

.strip-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.strip-detail {
  border-top: 1px solid rgba(var(--v-border-color), 0.12);
  margin-top: 4px;
  max-height: 70vh;
  overflow-y: auto;
}

.strip-expand-enter-active,
.strip-expand-leave-active {
  transition: max-height 0.25s ease, opacity 0.2s ease;
  overflow: hidden;
}

.strip-expand-enter-from,
.strip-expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.strip-expand-enter-to,
.strip-expand-leave-from {
  max-height: 70vh;
  opacity: 1;
}

/* ── Responsive (container queries: respond to component width) ─────────── */

/* Tablets / small desktops: tighter gap, narrower sidebar */
@container end-screen (max-width: 840px) {
  .end-screen-split {
    gap: 12px;
    padding-right: 12px;
  }

  .end-screen-sidebar {
    flex-basis: 280px;
    min-width: 240px;
    max-width: 300px;
    margin-top: 12px;
    margin-bottom: 12px;
  }
}

/* Narrow form factors (tablet portrait / mobile): hide sidebar entirely,
   show abbreviated strip below the hero. Vignette gets the full width. */
@container end-screen (max-width: 720px) {
  .end-screen-split {
    padding-right: 0;
  }

  .end-screen-sidebar {
    display: none;
  }

  .end-screen-strip {
    display: flex;
  }
}

/* Mobile: tighten padding and ensure callout fits */
@container end-screen (max-width: 600px) {
  .end-screen-split {
    min-height: 320px;
    gap: 0;
  }

  .end-screen-strip {
    margin: 8px;
    padding: 8px 12px;
  }

  .info-callout {
    max-width: calc(100% - 24px);
  }
}
</style>
