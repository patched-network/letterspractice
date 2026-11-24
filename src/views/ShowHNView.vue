<template>
  <div class="showhn-layout">
    <!-- Quiet affordance. Deliberately not a signup CTA: HN evaluators bounce
         at walls, and the demo's credibility depends on nothing being sold
         mid-demonstration. -->
    <header class="showhn-header">
      <div class="showhn-header__title">
        <strong>LettersPractice</strong>
        <span class="showhn-header__sub">technical demo</span>
      </div>
      <a href="/" class="showhn-header__link">back to letterspractice.com →</a>
    </header>

    <!-- Persona picker: canned learner profiles loaded into the throwaway
         guest. Guest-only — a signed-in user who consented to the demo is
         running against their child's REAL state, and loading a persona
         there would wipe it (also hard-guarded in selectPersona). Lives
         outside the side panels because it drives BOTH of them (and must
         survive either being collapsed). -->
    <section v-if="isGuest" class="personas">
      <em>learner stage</em>
      <button
        v-for="p in PERSONAS"
        :key="p.id"
        class="personas__chip"
        :class="{ 'personas__chip--active': activePersona === p.id }"
        :disabled="activePersona === p.id || personaBusy"
        :title="p.title"
        @click="selectPersona(p.id)"
      >
        {{ p.label }}
      </button>
      <span class="personas__note">canned profiles in a throwaway account — switching restarts the demo</span>
      <p v-if="personaError" class="personas__error">{{ personaError }}</p>
    </section>

    <!-- Signed-in guard. A guest's writes land in an isolated throwaway DB; a
         signed-in user's land on their child's real learner state. Blocks the
         session entirely rather than warning inline, so nothing is written
         before the user has agreed to it. -->
    <div v-if="!consented" class="showhn-gate">
      <div class="showhn-gate__card">
        <h2>You're signed in as {{ username }}.</h2>
        <p>
          This page runs a <em>real</em> study session — that's the whole point of it. Answers
          you give here will move your learner's ELO and schedule real reviews on their account.
        </p>
        <p class="showhn-gate__hint">
          To look around without touching their progress, open this page in a private window.
        </p>
        <v-btn color="warning" variant="flat" @click="proceed">Continue anyway</v-btn>
      </div>
    </div>

    <div v-else class="showhn-body">
      <!-- Left column: session + keyboard, stacked. The keyboard lives INSIDE
           this column (not across the full viewport) so it centers under the
           card it drives; the feed owns the full right-hand side. -->
      <div class="showhn-main">
        <!-- Panel handles: pinned to the seams of the session area, vertically
             centered — the collapse affordance lives OUTSIDE the panels so it
             reads as controlling the boundary, and stays put (and visible)
             whether the panel is open or collapsed. Desktop only; the tabs
             own panel selection on mobile. -->
        <button
          class="panel-handle panel-handle--left"
          :class="{ 'panel-handle--resizable': engineOpen }"
          :title="engineOpen ? 'drag to resize · click to hide engine activity' : 'show engine activity'"
          @pointerdown="startPanelDrag($event, 'feed')"
          @click="togglePanel('feed')"
        >
          {{ engineOpen ? '«' : '»' }}
        </button>
        <button
          class="panel-handle panel-handle--right"
          :class="{ 'panel-handle--resizable': progressOpen }"
          :title="progressOpen ? 'drag to resize · click to hide learner progress' : 'show learner progress'"
          @pointerdown="startPanelDrag($event, 'progress')"
          @click="togglePanel('progress')"
        >
          {{ progressOpen ? '»' : '«' }}
        </button>

        <!-- Live session: the REAL pipeline, not a canned preview. -->
        <section class="showhn-session">
          <div v-if="sessionPrepared" class="showhn-session__wrapper">
            <StudySession
              :key="runId"
              :content-sources="sessionContentSources"
              :session-time-limit="SESSION_MINUTES"
              :user="user"
              :session-config="studySessionConfig"
              :data-layer="dataLayer"
              :get-view-component="getViewComponent"
              :frameless="true"
              :hide-footer="true"
              transition-name="card-slide"
              transition-mode="default"
              @session-finished="handleSessionFinished"
              @card-loaded="firstCardLoaded = true"
              @time-changed="handleTimeChanged"
            >
              <template #session-finished>
                <div class="showhn-finished">
                  <p>Session complete. The annotations on the right are the real record of what just happened.</p>
                  <v-btn color="primary" variant="flat" @click="restart">Run it again</v-btn>
                </div>
              </template>
            </StudySession>
          </div>

          <div v-if="!firstCardLoaded && !sessionFinished" class="showhn-loading">
            <PunctuationThinking :glyph-height="140" :gap="18" />
            <p class="mt-4 text-medium-emphasis">Planning a session…</p>
          </div>
        </section>

        <div v-if="sessionPrepared && !sessionFinished" class="showhn-keyboard">
          <ProgressiveKeyboard
            ref="keyboardRef"
            :letters="keyboardLetters"
            :enabled-letters="keyboardEnabledLetters"
            :highlighted-letters="keyboardHighlightedLetters"
            :key-colors="keyboardColors"
            :space-text="keyboardContext.advanceText.value"
            :show-full-layout="keyboardContext.showFullLayout.value"
            :capture-keyboard="true"
            :lowercase-keycaps="true"
            :disabled="keyboardContext.disabled.value"
            @keypress="keyboardContext.dispatchKeyPress"
            @keyrelease="keyboardContext.dispatchKeyRelease"
            @keytap="keyboardContext.dispatchKeyTap"
            @keyhover="keyboardContext.dispatchKeyHover"
            @keyhoverend="keyboardContext.dispatchKeyHoverEnd"
            @kbd-space="keyboardContext.dispatchAdvance"
            @kbd-enter="keyboardContext.dispatchEnter"
            @arrow-left="keyboardContext.dispatchArrowLeft"
            @arrow-right="keyboardContext.dispatchArrowRight"
            @backspace="keyboardContext.dispatchBackspace()"
            @invalid-key="keyboardContext.dispatchInvalidKey"
          />
          <div class="showhn-timer">
            <StudySessionTimer
              :time-remaining="currentTimeRemaining"
              :session-time-limit="SESSION_MINUTES"
              @add-time="incrementSessionTime(SESSION_MINUTES)"
            />
          </div>
        </div>
      </div>

      <!-- Annotation feed: preamble / pinned state / append-only activity log.
           Desktop LHS (order in CSS); collapsible to a labeled rail. -->
      <aside
        ref="feedEl"
        class="showhn-feed"
        :class="{ 'panel--collapsed': !engineOpen, 'panel--offstage': mobilePanel !== 'engine' }"
        :style="feedStyle"
      >
        <button v-if="!engineOpen" class="panel__rail" title="expand" @click="engineOpen = true">
          engine activity
        </button>
        <template v-else>
        <!-- ZONE 1: preamble -->
        <section class="preamble" :class="{ 'preamble--collapsed': !preambleOpen }">
          <button class="preamble__toggle" @click="preambleOpen = !preambleOpen">
            {{ preambleOpen ? '−' : '+' }}
          </button>
          <h2>Engine activity</h2>
          <template v-if="preambleOpen">
            <p>
              LettersPractice is built on <a :href="SKUILDER_REPO" target="_blank" rel="noopener">Skuilder</a>,
              the open-source SRS++ courseware platform we maintain.
            </p>
            <p>
              This is a live study session, not a canned demo. Below is the
              engine's own bookkeeping, read back from the database as it happens —
              <strong>nothing here is recomputed for display.</strong>
            </p>
          </template>
        </section>

        <!-- ZONE 2: pinned live state (state, not events — a log would duplicate it) -->
        <section v-if="state" class="statestrip">
          <div class="statestrip__row">
            <span class="statestrip__stat">
              <em>learner ELO</em>
              <strong>{{ currentElo !== null ? currentElo.toFixed(0) : '—' }}</strong>
            </span>
            <span class="statestrip__stat">
              <em>queue</em>
              <strong>{{ state.supplyLength }}</strong>
              <span v-if="state.failedLength" class="statestrip__warn">+{{ state.failedLength }} retry</span>
            </span>
            <span v-if="backlog" class="statestrip__stat" :title="backlog.nextDueIn ? `next due ${backlog.nextDueIn}` : 'reviews due now'">
              <em>reviews</em>
              <strong>{{ backlog.dueNow }}</strong>
              <span class="statestrip__muted">/ {{ backlog.scheduledTotal }} due</span>
              <a class="statestrip__src" :href="SKUILDER_LINKS.srsGenerator.url" target="_blank" rel="noopener"
                 :title="SKUILDER_LINKS.srsGenerator.title">↗</a>
            </span>
            <span v-if="backlog && backlog.backlogMultiplier > 1" class="statestrip__stat statestrip__stat--hot">
              <em>backlog pressure</em>
              <strong>×{{ backlog.backlogMultiplier.toFixed(2) }}</strong>
            </span>
          </div>

          <div v-if="activeHints.length" class="statestrip__hints">
            <em>active hints</em>
            <code v-for="h in activeHints" :key="h.tag" class="chip chip--hint">
              {{ h.tag }} {{ formatFactor(h.factor) }}
            </code>
          </div>
        </section>

        <!-- ZONE 3: append-only activity log -->
        <p v-if="timeline.length === 0" class="showhn-feed__empty">
          Answer a card, and watch the engine react.
        </p>

        <!-- TransitionGroup: new events grow in with a brief flash, existing
             ones slide down. Entries are patched by key on resolve (pending →
             resolved), which correctly does NOT re-trigger the enter. -->
        <TransitionGroup tag="ol" name="feedin" class="showhn-feed__list">
          <li v-for="e in timeline" :key="e.id">
            <!-- ================= PLAN ================= -->
            <div v-if="e.kind === 'plan'" class="ev ev--plan">
              <div class="ev__head">
                <span class="chip chip--plan">PLAN</span>
                <span v-if="e.status === 'pending'" class="ev__title ev__title--pending">
                  planning…<span v-if="e.label"> ({{ e.label }})</span>
                </span>
                <span v-else-if="e.report" class="ev__title">
                  <strong>{{ e.report.generatedCount }}</strong> candidates →
                  <strong>{{ e.report.finalCount }}</strong> selected
                  <span v-if="e.label" class="ev__muted">({{ e.label }})</span>
                </span>
                <span v-else class="ev__title ev__muted">replan completed — no plan captured</span>

                <button v-if="e.report" class="ev__expand" @click="toggle(e.id)">
                  {{ expanded.has(e.id) ? 'collapse' : 'expand' }}
                </button>
                <a class="ev__src" :href="SKUILDER_LINKS.pipeline.url" target="_blank" rel="noopener"
                   :title="SKUILDER_LINKS.pipeline.title">{{ SKUILDER_LINKS.pipeline.label }} ↗</a>
              </div>

              <div v-if="e.report && expanded.has(e.id)" class="ev__detail">
                <h4>generators</h4>
                <table class="tbl">
                  <tr v-for="g in e.report.generators" :key="g.name">
                    <td><code>{{ g.name }}</code></td>
                    <td>{{ g.cardCount }} cards</td>
                    <td class="tbl__muted">{{ g.newCount }} new · {{ g.reviewCount }} review</td>
                    <td class="tbl__num">top {{ g.topScore.toFixed(3) }}</td>
                  </tr>
                </table>

                <h4>filters</h4>
                <table class="tbl">
                  <tr v-for="f in e.report.filters" :key="f.name">
                    <td><code>{{ f.name }}</code></td>
                    <td class="tbl__up">{{ f.boosted ? `+${f.boosted}` : '·' }}</td>
                    <td class="tbl__down">{{ f.penalized ? `−${f.penalized}` : '·' }}</td>
                    <td class="tbl__muted">{{ f.removed ? `${f.removed} removed` : `${f.passed} passed` }}</td>
                  </tr>
                </table>

                <h4>selected ({{ e.report.selected.length }})</h4>
                <div v-for="c in e.report.selected" :key="c.cardId" class="pcard">
                  <div class="pcard__head">
                    <code>{{ c.cardId }}</code>
                    <span class="ev__muted">{{ c.origin }}</span>
                    <span class="tbl__num">{{ c.finalScore.toFixed(3) }}</span>
                  </div>
                  <div class="pcard__prov">
                    <span v-for="(p, i) in c.provenance" :key="i" class="chip" :class="`chip--${p.action}`">
                      {{ p.strategy }} {{ p.score.toFixed(2) }}
                    </span>
                  </div>
                </div>

                <template v-if="e.report.nearMisses.length">
                  <h4>near misses (top {{ e.report.nearMisses.length }})</h4>
                  <div v-for="c in e.report.nearMisses" :key="c.cardId" class="pcard pcard--dim">
                    <div class="pcard__head">
                      <code>{{ c.cardId }}</code>
                      <span class="tbl__num">{{ c.finalScore.toFixed(3) }}</span>
                    </div>
                  </div>
                </template>

                <p v-if="e.report.discardedTail" class="ev__tail">{{ e.report.discardedTail.note }}</p>
              </div>
            </div>

            <!-- ================= HINTS ================= -->
            <div v-else-if="e.kind === 'hints'" class="ev ev--hints">
              <div class="ev__head">
                <span class="chip chip--hints">HINTS</span>
                <span class="ev__title">session hints changed</span>
                <a class="ev__src" :href="SKUILDER_LINKS.outcomeObserver.url" target="_blank" rel="noopener"
                   :title="SKUILDER_LINKS.outcomeObserver.title">{{ SKUILDER_LINKS.outcomeObserver.label }} ↗</a>
              </div>
              <div class="ev__changes">
                <div v-for="c in e.changes" :key="c.tag" class="ev__change">
                  <code>{{ c.tag }}</code>
                  <span v-if="c.from === null">added {{ formatFactor(c.to!) }}</span>
                  <span v-else-if="c.to === null">cleared</span>
                  <span v-else>{{ formatFactor(c.from) }} → {{ formatFactor(c.to) }}</span>
                </div>
              </div>
              <p class="ev__note">
                The framework provides the hook; the boost policy is course-side.
              </p>
            </div>

            <!-- ================= RESPONSE ================= -->
            <div v-else class="ev ev--response" :class="{ 'ev--wrong': !e.isCorrect }">
              <div class="ev__head">
                <span class="chip" :class="e.isCorrect ? 'chip--ok' : 'chip--bad'">{{ e.isCorrect ? '✓' : '✗' }}</span>
                <code class="ev__card">{{ e.cardId }}</code>
                <span class="ev__muted">{{ e.nextCardAction }}</span>
              </div>

              <div class="ev__tags">
                <code v-for="t in e.tags" :key="t" class="chip">{{ t }}</code>
              </div>

              <dl class="ann__rows">
                <div class="ann__row">
                  <dt>
                    learner ELO
                    <a class="ann__src" :href="SKUILDER_LINKS.eloService.url" target="_blank" rel="noopener"
                       :title="SKUILDER_LINKS.eloService.title">↗</a>
                  </dt>
                  <dd>
                    <template v-if="e.userElo">
                      {{ e.userElo.before.toFixed(0) }} →
                      <strong>{{ e.userElo.after.toFixed(0) }}</strong>
                      <span class="ann__delta" :class="deltaClass(e.userElo.delta)">{{ signed(e.userElo.delta) }}</span>
                    </template>
                    <span v-else-if="!e.resolved" class="ann__pending">writing…</span>
                    <span v-else class="ann__pending" title="The write did not land inside the read-back window.">not observed</span>
                  </dd>
                </div>

                <div class="ann__row">
                  <dt>
                    next review
                    <a class="ann__src" :href="SKUILDER_LINKS.srsMath.url" target="_blank" rel="noopener"
                       :title="SKUILDER_LINKS.srsMath.title">↗</a>
                  </dt>
                  <dd>
                    <template v-if="e.srs">
                      in <strong>{{ formatInterval(e.srs.intervalSeconds) }}</strong>
                      <span class="ann__muted">({{ formatDate(e.srs.nextReviewAt) }})</span>
                    </template>
                    <span v-else-if="!e.resolved" class="ann__pending">scheduling…</span>
                    <span v-else class="ann__muted">none scheduled</span>
                  </dd>
                </div>

                <div class="ann__row">
                  <dt>card difficulty</dt>
                  <dd>
                    <template v-if="e.cardEloAtServe !== null">
                      {{ e.cardEloAtServe.toFixed(0) }}
                      <span class="ann__muted" title="The card's rating when it was served. Card ratings settle over time from learner responses.">at serve</span>
                    </template>
                    <span v-else class="ann__muted">—</span>
                  </dd>
                </div>
              </dl>
            </div>
          </li>
        </TransitionGroup>
        </template>
      </aside>

      <!-- Mobile only (<960px): the page stacks to a single scroller and shows
           one side panel at a time; these tabs pick which. -->
      <nav class="showhn-tabs">
        <button
          class="showhn-tabs__tab"
          :class="{ 'showhn-tabs__tab--active': mobilePanel === 'engine' }"
          @click="selectMobilePanel('engine')"
        >
          engine activity
        </button>
        <button
          class="showhn-tabs__tab"
          :class="{ 'showhn-tabs__tab--active': mobilePanel === 'progress' }"
          @click="selectMobilePanel('progress')"
        >
          learner progress
        </button>
      </nav>

      <!-- Progress panel (desktop RHS): the parent-facing synthesis of the
           SAME learner state the engine feed annotates — /progress's report
           cards, fed by the same local DB, re-read as answers land. The
           engine pane shows the machinery; this pane shows what it's for. -->
      <aside
        ref="progressEl"
        class="showhn-progress"
        :class="{ 'panel--collapsed': !progressOpen, 'panel--offstage': mobilePanel !== 'progress' }"
        :style="progressStyle"
      >
        <button v-if="!progressOpen" class="panel__rail" title="expand" @click="progressOpen = true">
          learner progress
        </button>
        <template v-else>
          <section class="progresshead">
            <h2>Learner progress</h2>
            <p>
              The same learner state, as a parent sees it: the curriculum report and the
              words it makes decodable. Updates live as answers land.
            </p>
          </section>
          <div class="showhn-progress__cards">
            <CurriculumCard :summary="progressSummary" :navigable="false" />
            <ReachableWordsCard :summary="progressSummary" />
          </div>
        </template>
      </aside>
    </div>

  </div>
</template>

<script setup lang="ts">
/**
 * /showHN — an ungated study session running the REAL session pipeline, with a
 * live feed of framework internals beside it.
 *
 * Strategy: `bd/launch-hn.md`. Engineering brief: `agent/show-hn-view/SPEC.md`.
 *
 * Three properties this view must preserve, in priority order:
 *
 * 1. **The session is real.** It consumes the same `useStudySession` config and
 *    the same `StudySession` component as `/study/practice`. A bespoke config
 *    would drift, and the moment it drifts the annotations stop describing the
 *    product — which is the entire claim being made to HN.
 * 2. **Every number is observed.** See `services/showHN/annotationFeed.ts`; no
 *    displayed value is recomputed client-side.
 * 3. **No walls.** No login, no session caps, no signup CTA interrupting the
 *    demo. Evaluators bounce at walls and then comment that they bounced.
 *
 * Identity: an ANONYMOUS visitor (the HN case) gets a constructed guest whose
 * PouchDB is namespaced to `/showHN` (`services/peekNamespace.ts`), so evaluator
 * traffic never touches a real learner's ELO/SRS state and the demo never
 * inherits one. The router hard-reloads on namespace crossings.
 *
 * A SIGNED-IN visitor is a different story. `CouchDBSyncStrategy.getCurrentUsername()`
 * resolves the couch `_session` cookie *before* falling back to `accomodateGuest()`,
 * so the guest-UUID swap is inert for them and the session runs against their real
 * account. That matters because this route is linked from the OSS README and the
 * landing page — i.e. read by members. Hence the consent gate below: it blocks
 * the session rather than warning inline, so nothing is written unasked.
 *
 * TODO(framework): the correct fix is a `forceGuest` flag on `DataLayerConfig`,
 * consumed by `CouchDBSyncStrategy.getCurrentUsername()`, set from `main.ts` when
 * `routeNamespace() === 'showhn'`. Roughly ten lines, but it needs a `db` publish,
 * so it's deferred to the next one. Drop this gate when that lands.
 *
 * Curriculum-leakage scope (SPEC.md rules 1-3): this renders per-card mechanism
 * only — tags, ELO movement, SRS intervals, nav decisions — all of which are
 * already devtools-visible to any trial user via /couch. It renders no
 * interference matrix, no GPC sequencing, no threshold policy, no lesson
 * registry, and nothing beyond the ~10-15 cards of the current session slice.
 */
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { getDataLayer } from '@vue-skuilder/db';
import { StudySession, StudySessionTimer } from '@vue-skuilder/common-ui';
import { allCourseWare } from '@vue-skuilder/courseware';
import ENV from '../ENVIRONMENT_VARS';
import { useStudySession, registerOutcomeObserver } from '../composables/useStudySession';
import { createAnnotationFeed, type ResponseAnnotation } from '../services/showHN/annotationFeed';
import { createSessionMonitor, type MonitorEvent } from '../services/showHN/sessionMonitor';
import { SKUILDER_LINKS, SKUILDER_REPO } from '../services/showHN/skuilderLinks';
import ProgressiveKeyboard from '../components/keyboard/ProgressiveKeyboard.vue';
import PunctuationThinking from '../components/loading/PunctuationThinking.vue';
import {
  createKeyboardContext,
  provideKeyboardContext,
  type KeyboardContextProvider,
} from '../composables/useKeyboardContext';
import { prefetchPhonemeAudio } from '../services/phonetics/phonemeCache';
import { getLetterProgression } from '../services/userState';
import { getProgressSummary, type ProgressSummary } from '../services/userDebugAPI';
import { provideSkillHighlight } from '../composables/useSkillHighlight';
import CurriculumCard from '../components/progress/CurriculumCard.vue';
import ReachableWordsCard from '../components/progress/ReachableWordsCard.vue';
import {
  loadUserProfile,
  makeEmptySnapshot,
  type UserProfileSnapshot,
} from '../services/userProfileSnapshot';

/**
 * Fixed, generous, and not the age-derived policy used for real learners: the
 * audience here is an adult evaluator, and a 2-minute toddler session would end
 * before the interesting machinery (replans, ELO-neighbour composites) fires.
 */
const SESSION_MINUTES = 5;

const user = getDataLayer().getUserDB();
const dataLayer = getDataLayer();
const getViewComponent = (view_id: string) => allCourseWare.getView(view_id);

const {
  sessionPrepared,
  sessionFinished,
  sessionContentSources,
  currentTimeRemaining,
  studySessionConfig,
  initStudySession,
  handleTimeChanged,
  handleSessionFinished,
  incrementSessionTime,
  resetSession,
} = useStudySession();

// ---------------------------------------------------------------------------
// Annotation feed
// ---------------------------------------------------------------------------

const feed = createAnnotationFeed();
const currentElo = feed.currentElo;

// Registered in setup(), which is strictly before `StudySession` mounts (it is
// v-if'd on `sessionPrepared`) and therefore before the SessionController reads
// the observer list. Deregistered on unmount so a subsequent /study navigation
// in the same page lifecycle doesn't keep paying for read-backs.
const unregisterObserver = registerOutcomeObserver(feed.observer);
onUnmounted(unregisterObserver);

// Poll-driven half: pipeline runs, hint changes, live session state.
const monitor = createSessionMonitor();
const state = monitor.state;
onUnmounted(monitor.stop);

/**
 * One heterogeneous timeline, newest first. The two sources are independent
 * (observer-driven vs poll-driven) and are merged on `at` rather than being
 * forced through a single emitter — nothing needs them totally ordered beyond
 * display, and coupling them would put a DB read on the poll loop.
 */
type ActivityEvent = ResponseAnnotation | MonitorEvent;
const timeline = computed<ActivityEvent[]>(() =>
  [...feed.entries.value, ...monitor.events.value].sort((a, b) => b.at - a.at)
);

const preambleOpen = ref(true);

const expanded = ref(new Set<string>());
const toggle = (id: string) => {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
};

/** Only one course in this app, so the first backlog snapshot is the one. */
const backlog = computed(() => state.value?.backlog[0] ?? null);

const activeHints = computed(() =>
  Object.entries(state.value?.hints?.boostTags ?? {}).map(([tag, factor]) => ({ tag, factor }))
);

const runId = ref(0);
const firstCardLoaded = ref(false);

// ---------------------------------------------------------------------------
// Progress panel — the parent-facing synthesis of the same learner state
// ---------------------------------------------------------------------------

const engineOpen = ref(true);
/** Three columns want ~1280px; below that the progress panel starts folded. */
const progressOpen = ref(typeof window === 'undefined' || window.innerWidth >= 1280);
/** Mobile (<960px) shows one side panel at a time; the tabs pick which. */
const mobilePanel = ref<'engine' | 'progress'>('engine');

function selectMobilePanel(panel: 'engine' | 'progress') {
  mobilePanel.value = panel;
  // The tabs are the only panel control on mobile (collapse affordances are
  // hidden there), so selecting a tab always opens its panel.
  if (panel === 'engine') engineOpen.value = true;
  else progressOpen.value = true;
}

// --- panel resize (desktop) --------------------------------------------------
// The seam handles double as resizers: drag sets an explicit width (persisted
// per-device in localStorage — the default clamp() can't know how wide a given
// screen wants the report cards); a click (movement under the tolerance)
// toggles the panel as before.

const PANEL_MIN_W = 240;
const PANEL_MAX_W = 640;
const DRAG_TOLERANCE_PX = 4;
const PANEL_W_KEYS = { feed: 'showhn-w-feed', progress: 'showhn-w-progress' } as const;
type PanelSide = keyof typeof PANEL_W_KEYS;

function storedPanelWidth(side: PanelSide): number | null {
  const n = Number(localStorage.getItem(PANEL_W_KEYS[side]));
  return Number.isFinite(n) && n >= PANEL_MIN_W && n <= PANEL_MAX_W ? n : null;
}

const feedEl = ref<HTMLElement | null>(null);
const progressEl = ref<HTMLElement | null>(null);
const feedWidth = ref<number | null>(storedPanelWidth('feed'));
const progressWidth = ref<number | null>(storedPanelWidth('progress'));

// Until a drag happens, no inline style — the CSS clamp() default applies.
// (.panel--collapsed's !important flex still wins over this while collapsed.)
const feedStyle = computed(() =>
  feedWidth.value !== null ? { flex: `0 0 ${feedWidth.value}px` } : undefined
);
const progressStyle = computed(() =>
  progressWidth.value !== null ? { flex: `0 0 ${progressWidth.value}px` } : undefined
);

/** Set when a pointerup ended a real drag, so the trailing click doesn't toggle. */
let suppressHandleClick = false;

function togglePanel(side: PanelSide) {
  if (suppressHandleClick) {
    suppressHandleClick = false;
    return;
  }
  if (side === 'feed') engineOpen.value = !engineOpen.value;
  else progressOpen.value = !progressOpen.value;
}

function startPanelDrag(e: PointerEvent, side: PanelSide) {
  const open = side === 'feed' ? engineOpen.value : progressOpen.value;
  if (!open) return; // collapsed: click-to-open only
  const panel = side === 'feed' ? feedEl.value : progressEl.value;
  if (!panel) return;

  const handle = e.currentTarget as HTMLElement;
  const widthRef = side === 'feed' ? feedWidth : progressWidth;
  const startX = e.clientX;
  const startW = panel.getBoundingClientRect().width;
  let moved = false;

  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - startX;
    if (!moved && Math.abs(dx) < DRAG_TOLERANCE_PX) return;
    if (!moved) {
      moved = true;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    }
    // Left panel grows rightward with the pointer; right panel grows leftward.
    const w = side === 'feed' ? startW + dx : startW - dx;
    widthRef.value = Math.round(Math.min(PANEL_MAX_W, Math.max(PANEL_MIN_W, w)));
  };

  const onUp = () => {
    handle.removeEventListener('pointermove', onMove);
    if (moved) {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      localStorage.setItem(PANEL_W_KEYS[side], String(widthRef.value));
      suppressHandleClick = true; // eat the click this pointerup produces
    }
  };

  handle.setPointerCapture(e.pointerId);
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp, { once: true });
  handle.addEventListener('pointercancel', onUp, { once: true });
}

// Cross-highlighting between the two progress cards (reachable word ↔ the
// GPC tiles that decode it). Provided here exactly as ProgressView does.
provideSkillHighlight();

const progressSummary = ref<ProgressSummary | null>(null);
let progressTimer: number | undefined;

/**
 * Re-read the summary from the local DB, debounced: timeline events arrive in
 * bursts, and the writes they announce land a beat AFTER the event appends
 * (constraint 2's read-back). A too-early read self-corrects — the feed's
 * read-back resolution bumps `currentElo`, which re-fires this watcher.
 * All local pouch reads; nothing goes to the server.
 */
function refreshProgress(delay = 500) {
  window.clearTimeout(progressTimer);
  progressTimer = window.setTimeout(() => {
    void getProgressSummary().then(
      (s) => (progressSummary.value = s),
      (e) => console.warn('[showHN] Progress summary refresh failed:', e)
    );
  }, delay);
}
onUnmounted(() => window.clearTimeout(progressTimer));

// Any activity (responses, plans, hints) or a resolved ELO read-back can mean
// the summary's inputs moved. Refreshing on all of it is fine — see above.
watch([() => timeline.value.length, currentElo], () => refreshProgress());

// ---------------------------------------------------------------------------
// Consent gate (see the identity note in the header comment)
// ---------------------------------------------------------------------------

const username = user.getUsername();
const isGuest = username.startsWith('sk-guest-');

/** Guests proceed straight in — their writes are already isolated. */
const consented = ref(isGuest);

// ---------------------------------------------------------------------------
// Personas (guest-only)
//
// Canned learner states hydrated into the throwaway guest, because a fresh
// visitor otherwise sees only the least interesting slice of the curriculum
// (LessonGateFilter is default-deny — SPEC.md "personas"). "Brand-new" is not
// a fixture: it's the empty profile, wiping back to day one via the same
// loadUserProfile path.
//
// Switching is in-place, no reload: tear the session down (unmount), swap the
// docs, then run the same beginSession that a cold mount runs. That works
// because every holder of learner state is re-initialized on this path — the
// SessionController is rebuilt by initStudySession + the runId key bump, the
// feed re-seeds its ELO baseline, the monitor re-baselines against the run
// history, keyboard base letters are re-read, and loadUserProfile itself
// invalidates the letter-progression module cache. If a new in-memory holder
// of user state appears and is NOT re-initialized here, this is the seam
// where it shows up (as stale unlocks/ELO after a switch).
// ---------------------------------------------------------------------------

const PERSONAS = [
  { id: 'fresh', label: 'brand-new', title: 'A first-time learner: nothing unlocked yet', fixture: null },
  {
    id: 'intermediate',
    label: 'a few weeks in',
    title: 'Several letters unlocked; reviews scheduled; mid-curriculum machinery active',
    fixture: '/personas/intermediate.snapshot.json',
  },
  {
    id: 'advanced',
    label: 'experienced',
    title: 'Late released-curriculum: full spelling exercises, learner independence',
    fixture: '/personas/advanced.snapshot.json',
  },
] as const;
type PersonaId = (typeof PERSONAS)[number]['id'];

/** Survives manual reloads (the guest DB keeps the persona's state, so the UI should too). */
const PERSONA_ACTIVE_KEY = 'showhn-persona';

const activePersona = ref<PersonaId>(
  (sessionStorage.getItem(PERSONA_ACTIVE_KEY) as PersonaId | null) ?? 'fresh'
);
const personaError = ref<string | null>(null);
const personaBusy = ref(false);

async function selectPersona(id: PersonaId) {
  if (id === activePersona.value || personaBusy.value) return;
  // Hard guard, independent of the picker's v-if: never wipe a real account.
  if (!isGuest) {
    console.warn('[showHN] Persona load refused: signed-in user.');
    return;
  }
  personaBusy.value = true;
  personaError.value = null;

  // Tear down the live session BEFORE swapping the docs under it: unmount
  // StudySession (clears its tick interval; question components release the
  // keyboard config) and stop the monitor so nothing reads mid-wipe.
  monitor.stop();
  resetSession();
  firstCardLoaded.value = false;
  await nextTick();

  try {
    try {
      if (id === 'fresh') {
        await loadUserProfile(makeEmptySnapshot('fresh'));
      } else {
        const persona = PERSONAS.find((p) => p.id === id);
        if (!persona?.fixture) throw new Error(`unknown persona '${id}'`);
        const resp = await fetch(persona.fixture);
        if (!resp.ok) throw new Error(`fixture fetch: ${resp.status}`);
        // NB the SPA server answers unknown paths with index.html (status 200);
        // that fails JSON parsing here, landing in the fallback below.
        await loadUserProfile((await resp.json()) as UserProfileSnapshot);
      }
      activePersona.value = id;
    } catch (e) {
      console.warn('[showHN] Persona load failed; continuing as brand-new.', e);
      personaError.value = 'That profile isn’t available right now — running as brand-new instead.';
      await loadUserProfile(makeEmptySnapshot('fresh'));
      activePersona.value = 'fresh';
    }
    sessionStorage.setItem(PERSONA_ACTIVE_KEY, activePersona.value);

    feed.clear();
    monitor.reset();
    expanded.value = new Set();
    await beginSession();
    runId.value++;
  } catch (e) {
    // Even the brand-new fallback failed, or the session restart did. Leave
    // the picker usable so the visitor can retry rather than a frozen demo.
    console.error('[showHN] Persona switch failed.', e);
    personaError.value = 'Something went wrong switching profiles — try again, or reload the page.';
  } finally {
    personaBusy.value = false;
  }
}

async function beginSession() {
  prefetchPhonemeAudio(50);

  const progression = await getLetterProgression();
  keyboardContext.setBaseLetters(progression?.unlockedLetters ?? []);

  // Seed the ELO baseline BEFORE any response can land, so the first entry has
  // a real `before` to move from rather than resolving as unobserved.
  await feed.seed(ENV.STATIC_COURSE_ID);

  // Start polling before the session exists — `tick()` no-ops until a controller
  // registers itself, and starting here guarantees we catch the initial plan.
  monitor.start();
  refreshProgress(0); // covers cold mount AND persona switches (both land here)
  await initStudySession();
}

const proceed = async () => {
  consented.value = true;
  await beginSession();
};

const restart = async () => {
  feed.clear();
  monitor.reset();
  expanded.value = new Set();
  firstCardLoaded.value = false;
  await feed.seed(ENV.STATIC_COURSE_ID);
  // initStudySession() self-heals from the finished state (calls resetSession
  // internally); the key bump forces a fresh SessionController regardless.
  await initStudySession();
  runId.value++;
};

// ---------------------------------------------------------------------------
// Keyboard context (mirrors StudyPracticeView, minus the trophy-case mode)
// ---------------------------------------------------------------------------

const keyboardContext: KeyboardContextProvider = createKeyboardContext();
provideKeyboardContext(keyboardContext);

const keyboardRef = ref<InstanceType<typeof ProgressiveKeyboard> | null>(null);
watch(keyboardRef, (newRef) => {
  if (newRef) keyboardContext.connectKeyboard(newRef);
});

const keyboardLetters = computed(() => {
  const active = keyboardContext.hasQuestionConfig.value ? [...keyboardContext.activeLetters.value] : [];
  if (keyboardContext.showArrows.value) {
    if (!active.includes('arrowleft')) active.push('arrowleft');
    if (!active.includes('arrowright')) active.push('arrowright');
  }
  if (!active.includes('enter')) active.push('enter');
  if (keyboardContext.showAdvance.value && !active.includes('space')) active.push('space');
  return active;
});

const keyboardEnabledLetters = computed(() => {
  const enabled = keyboardContext.hasQuestionConfig.value ? [...keyboardContext.enabledLetters.value] : [];
  if (keyboardContext.showArrows.value) {
    if (!enabled.includes('arrowleft')) enabled.push('arrowleft');
    if (!enabled.includes('arrowright')) enabled.push('arrowright');
  }
  if (keyboardContext.showAdvance.value && !enabled.includes('space')) enabled.push('space');
  return enabled;
});

const keyboardHighlightedLetters = computed(() => Array.from(keyboardContext.highlights.value.keys()));

const keyboardColors = computed(() => {
  const colors: Record<string, string> = { ...keyboardContext.keyColors.value };
  for (const [letter, highlight] of keyboardContext.highlights.value.entries()) {
    if (typeof highlight === 'string') colors[letter] = highlight;
  }
  if (keyboardContext.advanceColor.value) colors['space'] = keyboardContext.advanceColor.value;
  return colors;
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;
const deltaClass = (n: number) => (n > 0 ? 'ann__delta--up' : n < 0 ? 'ann__delta--down' : 'ann__delta--flat');

/**
 * Boost factors are multiplicative. Rendering `×0.02` reads as noise; `÷50`
 * reads as "this concept is being held back hard", which is what it means.
 */
function formatFactor(factor: number): string {
  if (factor >= 1) return `×${factor % 1 === 0 ? factor : factor.toFixed(1)}`;
  return `÷${(1 / factor).toFixed(factor < 0.1 ? 0 : 1)}`;
}

function formatInterval(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 90) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 36) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  // Signed-in users start nothing until they've read the gate and clicked through.
  if (consented.value) void beginSession();
});
</script>

<style scoped>
.showhn-layout {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--v-layout-top, 0px));
  overflow: hidden;
}

.showhn-header {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 20px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  font-size: 0.9rem;
}

.showhn-header__sub {
  margin-left: 10px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.showhn-header__link {
  color: rgba(var(--v-theme-on-surface), 0.6);
  text-decoration: none;
}
.showhn-header__link:hover {
  text-decoration: underline;
}

.showhn-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.showhn-gate {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
}

.showhn-gate__card {
  max-width: 52ch;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  padding: 28px 30px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-left: 4px solid #ffa726;
  border-radius: 8px;
  line-height: 1.55;
}

.showhn-gate__card h2 {
  font-size: 1.05rem;
  font-weight: 600;
}

.showhn-gate__hint {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.9rem;
}

/* Center column: session on top, keyboard pinned beneath it. Because the
   keyboard is inside this column, it centers under the card it drives rather
   than under the whole viewport (which read as off-center next to the feed).
   DOM order is main → feed → tabs → progress (main first = first screenful on
   the mobile stack); desktop visual order feed | main | progress via `order`. */
.showhn-main {
  order: 2;
  position: relative; /* anchors the panel handles to the session area's seams */
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.showhn-session {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  min-width: 0;
  min-height: 0;
}

.showhn-session__wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
}

.showhn-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: rgb(var(--v-theme-surface));
}

.showhn-finished {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 48px 24px;
  text-align: center;
  max-width: 42ch;
  margin: 0 auto;
}

/* --- side panels: shared collapse/offstage machinery -------------------- */

/* Collapsed: the panel shrinks to a labeled rail; content is v-if'd away. */
.panel--collapsed {
  flex: 0 0 34px !important;
  padding: 0 !important;
  overflow: hidden !important;
}

.panel__rail {
  writing-mode: vertical-rl;
  width: 100%;
  height: 100%;
  padding: 16px 0;
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.panel__rail:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.85);
}

/* Grabbable-looking tabs floating on the session/panel seams. */
.panel-handle {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 5;
  width: 24px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  line-height: 1;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-on-surface), 0.65);
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.14);
}
.panel-handle:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.95);
}
/* Open panel: the handle is a resizer first (drag), toggle second (click). */
.panel-handle--resizable {
  cursor: ew-resize;
  touch-action: none; /* pointermove must not become a scroll on touch */
}
.panel-handle--left {
  left: 0;
  border-left: none;
  border-radius: 0 8px 8px 0;
}
.panel-handle--right {
  right: 0;
  border-right: none;
  border-radius: 8px 0 0 8px;
}

/* --- feed (desktop LHS) ------------------------------------------------- */

.showhn-feed {
  order: 1;
  position: relative;
  flex: 0 0 clamp(320px, 27%, 430px);
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  overflow-y: auto;
  padding: 14px 16px 24px;
  font-size: 0.84rem;
}

/* --- progress panel (desktop RHS) --------------------------------------- */

.showhn-progress {
  order: 3;
  position: relative;
  flex: 0 0 clamp(320px, 27%, 430px);
  border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  overflow-y: auto;
  padding: 14px 16px 24px;
  font-size: 0.84rem;
}

.progresshead {
  position: relative;
  margin-bottom: 12px;
  padding-right: 24px;
  line-height: 1.5;
}
.progresshead h2 {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 6px;
}
.progresshead p {
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.showhn-progress__cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* --- mobile panel tabs (hidden on desktop) ------------------------------ */

.showhn-tabs {
  display: none;
}

.showhn-feed__empty {
  color: rgba(var(--v-theme-on-surface), 0.55);
  line-height: 1.5;
}

/* --- zone 1: preamble -------------------------------------------------- */

.preamble {
  position: relative;
  margin-bottom: 12px;
  padding-right: 24px;
  line-height: 1.5;
}

.preamble h2 {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 6px;
}

.preamble p {
  margin-bottom: 6px;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.preamble a {
  color: inherit;
}

.preamble__toggle {
  position: absolute;
  top: 0;
  right: 0;
  width: 20px;
  height: 20px;
  line-height: 1;
  border-radius: 4px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.preamble__toggle:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

/* --- personas (full-width strip under the header) ------------------------ */

.personas {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 7px 20px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  font-size: 0.84rem;
}

.personas em {
  font-style: normal;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-right: 2px;
}

.personas__chip {
  font-size: 0.78rem;
  padding: 2px 10px;
  border-radius: 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  color: rgba(var(--v-theme-on-surface), 0.75);
  background: transparent;
  cursor: pointer;
}
.personas__chip:hover:not(:disabled) {
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.personas__chip--active {
  border-color: #3f51b5;
  color: #3f51b5;
  font-weight: 600;
  cursor: default;
}

.personas__note {
  margin-left: auto;
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.personas__error {
  flex-basis: 100%;
  font-size: 0.78rem;
  color: #e65100;
  margin: 0;
}

/* --- zone 2: pinned state strip ---------------------------------------- */

.statestrip {
  position: sticky;
  top: 0;
  z-index: 1;
  margin-bottom: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  backdrop-filter: blur(3px);
}

.statestrip__row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}

.statestrip__stat {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.statestrip__stat em {
  font-style: normal;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.statestrip__stat strong {
  font-variant-numeric: tabular-nums;
}

.statestrip__stat--hot strong {
  color: #e65100;
}

.statestrip__muted,
.statestrip__warn {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.statestrip__warn {
  color: #ef6c00;
}

.statestrip__src {
  font-size: 0.7rem;
  text-decoration: none;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.statestrip__hints {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
}

.statestrip__hints em {
  font-style: normal;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-right: 4px;
}

/* --- zone 3: activity log ---------------------------------------------- */

.chip {
  font-size: 0.68rem;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  white-space: nowrap;
}
.chip--plan { background: rgba(63, 81, 181, 0.16); color: #3f51b5; font-weight: 600; letter-spacing: 0.04em; }
.chip--hints { background: rgba(142, 36, 170, 0.16); color: #8e24aa; font-weight: 600; letter-spacing: 0.04em; }
.chip--hint { background: rgba(142, 36, 170, 0.12); }
.chip--ok { background: rgba(67, 160, 71, 0.18); color: #2e7d32; font-weight: 700; }
.chip--bad { background: rgba(255, 167, 38, 0.22); color: #e65100; font-weight: 700; }
.chip--boosted { background: rgba(46, 125, 50, 0.14); color: #2e7d32; }
.chip--penalized { background: rgba(198, 40, 40, 0.12); color: #c62828; }
.chip--generated { background: rgba(63, 81, 181, 0.12); color: #3f51b5; }
.chip--passed { background: rgba(var(--v-theme-on-surface), 0.06); }

.ev {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-left: 3px solid rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 6px;
  padding: 8px 10px;
}

.ev--plan { border-left-color: #3f51b5; }
.ev--hints { border-left-color: #8e24aa; }
.ev--response { border-left-color: #43a047; }
.ev--wrong { border-left-color: #ffa726; }

.ev__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ev__title {
  flex: 1;
  min-width: 0;
}

.ev__title--pending {
  color: rgba(var(--v-theme-on-surface), 0.6);
  animation: showhn-pulse 1.1s ease-in-out infinite;
}

@keyframes showhn-pulse {
  50% { opacity: 0.45; }
}

.ev__card {
  flex: 1;
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ev__muted {
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.ev__expand,
.ev__src {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  text-decoration: none;
  white-space: nowrap;
}
.ev__expand:hover,
.ev__src:hover {
  color: rgba(var(--v-theme-on-surface), 0.9);
  text-decoration: underline;
}

.ev__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 6px 0;
}

.ev__changes {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ev__change {
  display: flex;
  gap: 8px;
  font-variant-numeric: tabular-nums;
}

.ev__note {
  margin-top: 6px;
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.ev__detail {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed rgba(var(--v-border-color), var(--v-border-opacity));
}

.ev__detail h4 {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin: 8px 0 3px;
}

.ev__tail {
  margin-top: 8px;
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
}
.tbl td {
  padding: 1px 4px 1px 0;
}
.tbl__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.tbl__muted { color: rgba(var(--v-theme-on-surface), 0.5); }
.tbl__up { color: #2e7d32; }
.tbl__down { color: #c62828; }

.pcard {
  margin-bottom: 5px;
}
.pcard--dim {
  opacity: 0.55;
}
.pcard__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.76rem;
}
.pcard__head code {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pcard__prov {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 2px;
}

.showhn-feed__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* New-event grow-in. Two animations on one enter: the li slides/fades in
   fast, while the .ev card inside carries a slower background flash so the
   arrival stays findable for a beat after the motion stops. Both run the
   full 1.2s so Vue keeps `feedin-enter-active` applied until the flash ends. */
.feedin-enter-active {
  animation: feedin-slide 1.2s ease-out;
}
.feedin-enter-active .ev {
  animation: feedin-flash 1.2s ease-out;
}
.feedin-move {
  transition: transform 0.3s ease;
}

@keyframes feedin-slide {
  0% {
    opacity: 0;
    transform: translateY(-10px) scale(0.97);
  }
  25% {
    opacity: 1;
    transform: none;
  }
  100% {
    opacity: 1;
    transform: none;
  }
}

@keyframes feedin-flash {
  0%,
  15% {
    background-color: rgba(var(--v-theme-on-surface), 0.09);
  }
  100% {
    background-color: transparent;
  }
}

.ann__rows {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 10px;
}

.ann__row {
  display: contents;
}

.ann__row dt {
  color: rgba(var(--v-theme-on-surface), 0.55);
  white-space: nowrap;
}

.ann__src {
  font-size: 0.7rem;
  text-decoration: none;
  color: rgba(var(--v-theme-on-surface), 0.35);
}
.ann__src:hover {
  color: rgba(var(--v-theme-on-surface), 0.85);
}

.ann__row dd {
  margin: 0;
}

.ann__delta {
  margin-left: 6px;
  font-variant-numeric: tabular-nums;
}
.ann__delta--up { color: #2e7d32; }
.ann__delta--down { color: #c62828; }
.ann__delta--flat { color: rgba(var(--v-theme-on-surface), 0.5); }

.ann__pending,
.ann__muted {
  color: rgba(var(--v-theme-on-surface), 0.45);
  font-size: 0.78rem;
}
.ann__muted { margin-left: 6px; }

/* --- keyboard --------------------------------------------------------- */

.showhn-keyboard {
  flex-shrink: 0;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px 16px 16px;
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
}

.showhn-timer {
  position: absolute;
  left: 16px;
  bottom: 16px;
}

/* Desktop-first, per SPEC — but HN readership is heavily mobile, so the bar
   here is "coherent", not merely non-broken: session + keyboard fill the
   first screenful (the app, playable immediately); the feed flows below it
   as one naturally-scrolling page. */
@media (max-width: 960px) {
  .showhn-layout {
    height: auto;
    min-height: 100dvh;
    overflow: visible;
  }

  .showhn-body {
    flex-direction: column;
  }

  /* First screenful ≈ viewport minus header: card playable without scrolling,
     panels discoverable by scrolling past the keyboard. */
  .showhn-main {
    order: 1;
    flex: none;
    height: calc(100dvh - 88px);
    min-height: 420px;
  }

  .showhn-keyboard {
    padding: 4px 8px 10px;
  }

  /* One side panel at a time below the session, chosen by the tabs. The
     desktop collapse affordances (rails, « » buttons) are hidden — the tabs
     are the only panel control here, and selecting a tab always opens. */
  .showhn-tabs {
    order: 2;
    display: flex;
    gap: 8px;
    padding: 10px 16px 0;
  }
  .showhn-tabs__tab {
    flex: 1;
    padding: 6px 0;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 16px;
    font-size: 0.8rem;
    color: rgba(var(--v-theme-on-surface), 0.7);
  }
  .showhn-tabs__tab--active {
    border-color: #3f51b5;
    color: #3f51b5;
    font-weight: 600;
  }

  .showhn-feed,
  .showhn-progress {
    order: 3;
    flex: none;
    overflow-y: visible;
    border: none;
    border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }

  .panel--offstage {
    display: none;
  }
  .panel__rail,
  .panel-handle {
    display: none;
  }

  /* The strip pins to the page (not the feed panel) once the page is the
     scroller; offset below the fixed app bar so it doesn't slide under it. */
  .statestrip {
    top: var(--v-layout-top, 0px);
    backdrop-filter: blur(6px);
    background: rgba(var(--v-theme-surface), 0.9);
  }

  .showhn-header {
    flex-direction: column;
    gap: 2px;
  }
}
</style>
