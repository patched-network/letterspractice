/**
 * Type definitions for user state documents persisted via strategy state.
 *
 * These documents are stored in the user's PouchDB (synced to CouchDB) using
 * the `UsrCrsDataInterface.putStrategyState()` / `getStrategyState()` API,
 * scoped to the letterspractice course.
 *
 * See: agent/user-state-storage/a.4.plan-revised.md
 */

import type { SessionLengthMode } from './sessionLengthPolicy';

/**
 * Strategy keys used as document identifiers in strategy state storage.
 *
 * Each key becomes part of the CouchDB document ID:
 *   `STRATEGY_STATE::{courseId}::{key}`
 */
export const USER_STATE_KEYS = {
  USER_PROFILE: 'UserProfile',
  LETTER_PROGRESSION: 'LetterProgression',
  LESSON_PROGRESS: 'LessonProgress',
  PRESCRIBED_PROGRESS: 'PrescribedProgress',
  VIGNETTE_PROGRESS: 'VignetteProgress',
  /** Cached "what's next" intro-forecast snapshot (see services/introForecast.ts). */
  INTRO_FORECAST: 'IntroForecast',
  /** Printable fridge sheet: opened / dismissed bookkeeping (see services/fridgeSheet.ts). */
  FRIDGE_SHEET: 'FridgeSheet',
  /** Which apps the account is used from (see services/androidApp.ts). Read by /admin. */
  PLATFORM: 'Platform',
  /** Study preferences that aren't in the framework's UserConfig (see services/sessionLengthPolicy.ts). */
  SESSION_PREFS: 'SessionPrefs',
  /** Practice sessions done today + grown-up unlocks (see services/dailyDose.ts). */
  DAILY_DOSE: 'DailyDose',
} as const;

/**
 * Persisted subset of onboarding data.
 *
 * Produced by the onboarding flow on completion; consumed by curriculum
 * strategies, content filters, and seasonal decoration logic at runtime.
 *
 * Excludes flow-control fields (completedScreens, startedAt, etc.) that are
 * only relevant to the onboarding UI itself.
 */
export interface UserProfileData {
  /** Age bracket selected during onboarding, e.g. "2-2.5 years" */
  childAge: string;

  /** Self-reported literacy level (1-4) */
  literacyLevel: 1 | 2 | 3 | 4;

  /** Content category preferences from onboarding */
  contentPreferences: Record<
    string,
    'not-interested' | 'neutral' | 'interested'
  >;

  /** Words/topics to exclude from content */
  sensitiveWords: string[];

  /** Seasonal/holiday decoration settings */
  seasonalSettings: {
    enabled: boolean;
    excludedHolidays: string[];
  };

  /** ISO timestamp of when onboarding was completed */
  completedAt?: string;
}

/**
 * Tracks which letters a user has unlocked and their per-letter mastery.
 *
 * Consumed by:
 *   - StudyPracticeView → ProgressiveKeyboard (which letters to show)
 *   - Curriculum / hard-ordering generator (which cards are eligible)
 *   - SpellingQuestion (available letter set for word selection)
 *
 * Note: The detailed schema for `letterMastery` and tier progression is
 * intentionally minimal here. It will be refined alongside the curriculum
 * sequencing work (see elephant.md: "Hard-ordering generator").
 */
export interface LetterProgressionState {
  /** Letters unlocked via GPC Intro completion (drives keycap visibility) */
  unlockedLetters: string[];

  /**
   * Per-letter WST correct-answer count.
   * Used by LetterGatingFilter to gate spelling/missing-letter cards
   * behind demonstrated phonemic awareness. Does NOT affect keycap unlock.
   */
  wstProgress?: Record<string, number>;

  /**
   * How many words `unlockedLetters` makes decodable — the entitlement metric.
   *
   * A pure function of `unlockedLetters` (see
   * `services/reachableWords/freeSlateCount.ts`), stored here rather than in
   * its own document precisely *because* it is derived: co-locating it with
   * its input means one read-modify-write instead of two, and it can never
   * drift from the array it describes. A second document would also mean a
   * second cache to scope by username — the shape that caused the
   * cross-account progression clobber.
   *
   * Absent on accounts last written before the counter shipped. Readers
   * compute from `unlockedLetters` in that case rather than writing (a
   * backfill-on-read would put a write on every read path); the next GPC
   * intro persists it.
   */
  reachableWordCount?: number;

  /**
   * ISO timestamp of the last intro that unlocked something new (a grapheme
   * or a sight word). Read by the intro hold-back (`services/introHoldback.ts`)
   * to space new intros while letter-sound debt is high. Absent on accounts
   * whose last unlock predates it (2026-11-18); the hold-back treats that as
   * "no recent intro", and the next unlock writes it.
   */
  lastIntroAt?: string;

  /** ISO timestamp of last update */
  updatedAt: string;
}

/**
 * Per-group state for the singleton prescribed-progress strategy.
 *
 * Mirrors the runtime prescribed generator's user-scoped trajectory tracking:
 * which prescribed targets have been encountered, whether targets are currently
 * blocked, and what support tags were recently resolved for surfacing help.
 */
export interface PrescribedProgressGroupState {
  encounteredCardIds: string[];
  pendingTargetIds: string[];
  lastSurfacedAt: string | null;
  sessionsSinceSurfaced: number;
  lastSupportAt: string | null;
  blockedTargetIds: string[];
  lastResolvedSupportTags: string[];
}

/**
 * User-scoped progress state for the singleton prescribed strategy.
 *
 * Stored under `USER_STATE_KEYS.PRESCRIBED_PROGRESS` when letterspractice wants
 * app-side visibility into the prescribed navigator's state for debugging or
 * reporting.
 */
export interface PrescribedProgressState {
  updatedAt: string;
  groups: Record<string, PrescribedProgressGroupState>;
}

/**
 * Progress through the post-session practicing vignettes (LetterPeople
 * skill-acquisition arcs, e.g. J teaching j to juggle).
 *
 * Stored under `USER_STATE_KEYS.VIGNETTE_PROGRESS`. Deliberately separate
 * from the sessionTracker funnel counters, whose semantics gate signup
 * prompts and must not change.
 */
export interface VignetteProgressState {
  updatedAt: string;
  /**
   * Number of post-session vignettes shown so far. The next vignette renders
   * stage `min(vignettesShown, maxStage)` — indexes past the end clamp to the
   * terminal (graduation) stage.
   */
  vignettesShown: number;
  /**
   * ISO timestamp of when each stage was first shown, keyed by 0-based
   * stage index. The terminal stage repeats forever; only its first showing
   * is recorded (`updatedAt` covers the latest). Optional: stages shown
   * before this field existed have no dates.
   */
  stageFirstShownAt?: Record<string, string>;
}

/**
 * Bookkeeping for the printable fridge sheet (services/fridgeSheet.ts).
 *
 * Stored under `USER_STATE_KEYS.FRIDGE_SHEET`. The sheet itself is static;
 * the only state the app holds is whether this family has (probably) got
 * one on the fridge, so the session-end screen can switch from "print it"
 * to "colour these in".
 */
export interface FridgeSheetState {
  updatedAt: string;
  /** First time the PDF was opened from the app. Treated as "printed". */
  openedAt?: string;
  /** Last time the print prompt was waved away. */
  dismissedAt?: string;
  /** How many times the print prompt was waved away (caps the nagging). */
  dismissCount: number;
}

/**
 * Which apps the account has been used from. Written by the app, read by the
 * admin Users view: a free-tier account at the 1,000-word wall that uses the
 * Play Store app can't buy from there (services/androidApp.ts).
 */
export interface PlatformState {
  updatedAt: string;
  /** First / latest launch of the Play Store app on this account. */
  androidAppFirstSeen?: string;
  androidAppLastSeen?: string;
}

/**
 * Per-account study preferences. The manual minutes value itself lives in the
 * framework's `UserConfig.sessionTimeLimit`; this holds only the Auto/Manual
 * switch, which has no home there.
 */
export interface SessionPrefsState {
  updatedAt: string;
  sessionLengthMode: SessionLengthMode;
}
