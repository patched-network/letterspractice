<template>
  <div class="study-hub">
    <!-- Study Mode Acknowledgment (first-time funnel users) -->
    <v-card v-if="showStudyModeAcknowledgment" class="mb-4 pa-6 text-center">
      <v-icon size="64" color="primary" class="mb-4">mdi-account-child</v-icon>
      <h2 class="text-h5 mb-3">Ready to Start Learning Together?</h2>
      <p class="text-body-1 text-medium-emphasis mb-2">
        <strong>Study Mode</strong> is for active learning sessions with your child where progress is tracked and responses are recorded.
      </p>
      <p class="text-body-2 text-medium-emphasis mb-4">
        You'll have {{ GUEST_SESSION_LIMIT }} learning sessions before being asked to create an account.
      </p>
      <div class="mb-4">
        <v-btn size="large" color="primary" variant="elevated" @click="handleAcknowledgeStudyMode" class="mb-2">
          Start Learning Together
        </v-btn>
      </div>
      <p class="text-caption text-medium-emphasis">
        Still browsing? Try <router-link to="/peek">Preview Mode</router-link>
      </p>
    </v-card>

    <!-- Pre-session CTA (sessions 4-6, dismissible) -->
    <template v-else-if="showPreSessionCTA">
      <v-banner
        color="warning"
        icon="mdi-account-plus"
        lines="two"
        class="mb-4"
      >
        <template v-slot:text>
          <strong>Sign up to continue learning!</strong><br>
          Create a free account to keep your progress and continue your study sessions.
        </template>
        <template v-slot:actions>
          <v-btn variant="elevated" color="primary" @click="router.push('/signup')">Sign Up</v-btn>
          <v-btn
            v-if="canDismissPreSessionCTA"
            variant="text"
            @click="dismissPreSessionCTA"
          >
            Maybe Later
          </v-btn>
        </template>
      </v-banner>
    </template>

    <!-- Blocking CTA (session 7+, not dismissible) -->
    <template v-else-if="isBlocked">
      <v-card class="mb-4 pa-6 text-center">
        <v-icon size="64" color="warning" class="mb-4">mdi-alert-circle-outline</v-icon>
        <h2 class="text-h5 mb-3">Create Account to Continue</h2>
        <p class="text-body-1 text-medium-emphasis mb-4">
          You've completed {{ GUEST_SESSION_LIMIT }} study sessions as a guest. To continue your learning journey, please create a free account.
        </p>
        <v-btn size="large" color="primary" variant="elevated" @click="router.push('/signup')">
          Create Account
        </v-btn>
      </v-card>
    </template>

    <!-- Main Hub -->
    <template v-else>
      <!-- Free-tier ceiling reached. Sits above the choices because it
           explains them: no new lesson will be offered below. -->
      <FreeTierBanner
        v-if="dripState?.frozen"
        :count="dripState.count"
        class="mb-4"
        @see-more="router.push('/milestone')"
      />

      <HubChoices
        :next-lesson="nextLesson"
        :session-prepared="sessionPrepared"
        :practice-blocked="isHelloWorldLesson"
        :resting="restingToday"
        @learn="handleLearnClick"
        @practice="handlePracticeClick"
        @unlock="adultGateOpen = true"
      />
      <AdultGateDialog v-model="adultGateOpen" @passed="handleUnlockPassed" />

      <!-- Account-recovery reminder (non-blocking, never gates study): one
           quiet line at the foot of the hub, after a grace period. -->
      <EmailRecoveryNote
        v-if="showVerificationNag && user"
        :username="user.getUsername()"
        :email="userEmail"
        @hide="dismissVerificationNag"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getDataLayer } from '@vue-skuilder/db';
import { toCourseElo } from '@vue-skuilder/common';
import { getUserStatus } from '@vue-skuilder/common-ui';
import { useSessionTracker } from '../stores/sessionTracker';
import { useStudySession } from '../composables/useStudySession';
import {
  getLessonProgress,
  getLetterProgression,
  recordLessonSkipped,
  getDailyDose,
  recordDailyDoseUnlock,
} from '../services/userState';
import { isRestingToday } from '../services/dailyDose';
import AdultGateDialog from '../components/hub/AdultGateDialog.vue';
import { getNextLesson } from '../services/lessons';
import { preload3D } from '../lessons/index';
import type { LessonEligibilityContext, LessonTagElo } from '../services/lessons';
import config from '../../skuilder.config.json';
import type { LessonDefinition, LessonProgressState } from '../services/lessons.types';
import type { LetterProgressionState } from '../services/userState.types';
import { evaluateDripState, type DripState } from '../services/dripGate';
import HubChoices from '../components/hub/HubChoices.vue';
import FreeTierBanner from '../components/hub/FreeTierBanner.vue';
import EmailRecoveryNote from '../components/hub/EmailRecoveryNote.vue';
import { emailNoteDue, hideEmailNote, readHiddenAt, registeredAt } from '../services/emailNote';

// ---------------------------------------------------------------------------
// TWO boundaries, measured in different units — do not conflate them.
//
//   • GUEST preview (this file): sk-guest-* users, NO login. Capped at
//     GUEST_SESSION_LIMIT *sessions*, counted in the browser-local
//     `sessionTracker` store. Hitting the cap prompts account creation — it
//     does NOT gate paid content. A soft product lever (may drop to 3-4).
//
//   • FREE TIER (services/dripGate.ts): post-login accounts. Bounded by
//     *reachable words*, not sessions or days — an unpaid account stops being
//     offered new lessons and new GPC intros once it can decode
//     FREE_TIER_WORD_THRESHOLD words, and keeps everything already introduced
//     forever. There is no session budget and no clock.
//
// Different users, different units, different purpose. The session counter
// governs only the first of these.
// ---------------------------------------------------------------------------

/** Guest (no-login) preview cap before the create-account prompt. */
const GUEST_SESSION_LIMIT = 6;
/** Sessions before the cap at which the dismissible "sign up" nudge appears. */
const GUEST_SESSION_SOFT_CTA_LEAD = 2;

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

const router = useRouter();
const user = getDataLayer().getUserDB();
const sessionTracker = useSessionTracker();
const {
  sessionPrepared,
  initStudySession,
} = useStudySession();

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const preSessionCTADismissed = ref(false);
const userVerificationStatus = ref<'pending_verification' | 'verified' | 'suspended' | null>(null);
const verificationStatusLoading = ref(true);
const verificationNagDismissed = ref(false);
const userEmail = ref<string | null>(null);
/** Earliest entitlement registration: the note waits out a grace period after it. */
const userRegisteredAt = ref<Date | null>(null);
const lessonProgress = ref<LessonProgressState | null>(null);
const nextLesson = ref<LessonDefinition | null>(null);
/**
 * Entitlement state, resolved alongside the next lesson (both need the letter
 * progression document, so they share one read). Null until that resolves.
 * `frozen` is what the milestone surface renders against.
 */
const dripState = ref<DripState | null>(null);

let verificationPollInterval: ReturnType<typeof setInterval> | null = null;

async function pollVerificationStatus() {
  try {
    const statusResult = await getUserStatus();
    if (statusResult.ok && statusResult.status && statusResult.status !== 'pending_verification') {
      // Verified in another tab / on their phone — retire the nag silently.
      stopVerificationPoll();
      userVerificationStatus.value = statusResult.status;
    }
  } catch {
    // silently ignore poll failures
  }
}

function startVerificationPoll() {
  if (verificationPollInterval) return;
  verificationPollInterval = setInterval(pollVerificationStatus, 5000);
}

function stopVerificationPoll() {
  if (verificationPollInterval) {
    clearInterval(verificationPollInterval);
    verificationPollInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Guest (no-login) Preview Gating (moved from the former StudyView, now removed)
// ---------------------------------------------------------------------------

// "Funnel user" == GUEST preview visitor: an sk-guest-* user with no account.
// GUEST_SESSION_LIMIT (see cap tiers above) applies only to these users; a
// logged-in account is bounded by the word ceiling, not by sessions.
const isFunnelUser = computed(() => {
  if (!user) return false;
  return user.getUsername().startsWith('sk-guest-');
});

// Non-blocking nag (was a hard gate — see relax-email-nag). Verification is
// never read for authorization server-side, so this only prompts; it never
// withholds study. Guests have no account to verify. It waits a few days
// after registration (signup already sent the email), and hiding it lasts
// two weeks on this device (services/emailNote.ts).
const showVerificationNag = computed(() => {
  if (isFunnelUser.value) return false;
  if (verificationStatusLoading.value) return false;
  if (verificationNagDismissed.value) return false;
  if (userVerificationStatus.value !== 'pending_verification') return false;
  const hiddenAt = user ? readHiddenAt(user.getUsername()) : null;
  return emailNoteDue(userRegisteredAt.value, hiddenAt);
});

// Poll only while the nag is live, so a verification completed elsewhere
// (e.g. the link opened on a phone) clears it without a manual refresh.
watch(showVerificationNag, (active) => {
  if (active) startVerificationPoll();
  else stopVerificationPoll();
});

const showStudyModeAcknowledgment = computed(() => {
  if (!isFunnelUser.value) return false;
  return !sessionTracker.studyModeAcknowledged;
});

const isBlocked = computed(() => {
  if (!isFunnelUser.value) return false;
  return sessionTracker.studySessionCount > GUEST_SESSION_LIMIT;
});

const showPreSessionCTA = computed(() => {
  if (!isFunnelUser.value) return false;
  if (preSessionCTADismissed.value) return false;
  const count = sessionTracker.studySessionCount;
  return count >= GUEST_SESSION_LIMIT - GUEST_SESSION_SOFT_CTA_LEAD && count <= GUEST_SESSION_LIMIT;
});

const canDismissPreSessionCTA = computed(() => {
  return sessionTracker.studySessionCount < GUEST_SESSION_LIMIT;
});

const isHelloWorldLesson = computed(() => nextLesson.value?.id === 'hello-world');

// Daily dose (services/dailyDose.ts): once today's practice is done the hub
// rests. Starts false so a slow/failed read fails open, like the drip gate.
const restingToday = ref(false);
const adultGateOpen = ref(false);

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const dismissPreSessionCTA = () => {
  preSessionCTADismissed.value = true;
};

const dismissVerificationNag = () => {
  verificationNagDismissed.value = true;
  if (user) hideEmailNote(user.getUsername());
};

const handleAcknowledgeStudyMode = () => {
  sessionTracker.acknowledgeStudyMode();
};

const handleLearnClick = () => {
  if (nextLesson.value) {
    router.push(`/study/lesson/${nextLesson.value.id}`);
  }
};

const handlePracticeClick = async () => {
  if (isHelloWorldLesson.value) return; // blocked until intro lesson handled
  if (nextLesson.value) {
    await recordLessonSkipped();
  }
  router.push('/study/practice');
};

// An unlock is for practice only: any pending lesson stays queued for a
// fresh day rather than being recorded as skipped.
const handleUnlockPassed = async () => {
  await recordDailyDoseUnlock();
  router.push('/study/practice');
};

/**
 * Resolve the next lesson using full eligibility context (including ELO data).
 * Falls back gracefully if ELO data isn't available.
 */
async function resolveNextLesson(progress: LessonProgressState | null): Promise<LessonDefinition | null> {
  let tagElo: LessonTagElo | undefined;
  try {
    const courseReg = await user.getCourseRegDoc(config.course);
    const courseElo = toCourseElo(courseReg.elo);
    tagElo = {};
    for (const [tag, data] of Object.entries(courseElo.tags)) {
      // `recent` is the first-attempt buffer the mastery gate reads.
      tagElo[tag] = { score: data.score, count: data.count, recent: data.recent };
    }
  } catch (e) {
    // ELO not available yet (new user, race condition) — mastery conditions
    // won't be checked, so lessons are offered based on prerequisites only
    console.debug('[StudyHubView] Could not load tag ELO for lesson eligibility:', e);
  }

  let unlockedLetterCount: number | undefined;
  let unlockedGraphemes: string[] | undefined;
  let letterProgression: LetterProgressionState | null = null;
  try {
    letterProgression = await getLetterProgression();
    unlockedLetterCount = letterProgression?.unlockedLetters.length ?? 0;
    unlockedGraphemes = letterProgression?.unlockedLetters ?? [];
  } catch (e) {
    // Progression not available yet — breadth gates won't be checked.
    console.debug('[StudyHubView] Could not load letter progression for lesson eligibility:', e);
  }

  // Entitlement wall. Once an unpaid account can decode the free-tier word
  // ceiling, no NEW lesson is offered — the twin of IntroGateFilter, which
  // withholds new GPC intros over the same condition. Lessons already passed,
  // and everything they released, are untouched: the wall stops supply, it
  // does not repossess.
  //
  // Errors fall through to offering the lesson (fail-open, per dripGate) —
  // a family wrongly told there is nothing more to learn is the worse failure.
  try {
    dripState.value = await evaluateDripState(letterProgression);
    if (dripState.value.frozen) return null;
  } catch (e) {
    console.debug('[StudyHubView] Drip gate evaluation failed, offering lesson:', e);
  }

  const ctx: LessonEligibilityContext = {
    progress,
    tagElo,
    unlockedLetterCount,
    unlockedGraphemes,
  };
  return getNextLesson(ctx);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onUnmounted(() => stopVerificationPoll());

onMounted(async () => {
  // Session counts are per-account; re-load if the user changed since last visit.
  void sessionTracker.ensureCurrent();

  void getDailyDose().then((dose) => {
    restingToday.value = isRestingToday(dose);
  });

  // 1. Pipeline prefetch (fire-and-forget — warm the session for Practice)
  initStudySession();
  // ...and the 3D chunks, for lessons and the GPC intros (no-op on SVG)
  preload3D();

  // 2. Load lesson progress + ELO to determine if a lesson is queued
  try {
    lessonProgress.value = await getLessonProgress();
    nextLesson.value = await resolveNextLesson(lessonProgress.value);
  } catch (e) {
    console.warn('[StudyHubView] Failed to load lesson progress:', e);
  }

  // 3. Session tracking — counted for guests AND logged-in users. Guest
  // counts feed the GUEST_SESSION_LIMIT signup prompt (browser-local);
  // logged-in counts persist to UserDB as activity accounting only (they
  // gate nothing since the trial retired — see the cap-tier note above).
  if (user) {
    const username = user.getUsername();
    sessionTracker.incrementStudySession();
    if (username.startsWith('sk-guest-')) {
      verificationStatusLoading.value = false;
    } else {
      try {
        const statusResult = await getUserStatus();
        if (statusResult.ok) {
          userVerificationStatus.value = statusResult.status || 'verified';
          userEmail.value = statusResult.email || null;
          userRegisteredAt.value = registeredAt(statusResult.entitlements);
        } else {
          userVerificationStatus.value = 'verified';
        }
      } catch {
        userVerificationStatus.value = 'verified';
      } finally {
        verificationStatusLoading.value = false;
      }
    }
  } else {
    verificationStatusLoading.value = false;
  }

});
</script>

<style scoped>
.study-hub {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px;
  min-height: calc(100vh - var(--v-layout-top, 0px));
}
</style>