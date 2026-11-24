/**
 * The thin learner-state picture stored on each `StudySessionDoc` at session
 * open and close.
 *
 * NOT `userProfileSnapshot` — that captures every card history, review and
 * strategy-state doc to reconstitute a whole learner. Writing it per session
 * would duplicate the user DB into itself on every sitting. What lands here is
 * the state a navigation strategy actually reads; the deltas between
 * consecutive sessions recover the trajectory.
 *
 * When adding a field the test is "would a nav strategy read this, or would an
 * analysis of one need it?" — not "is it about the user?".
 */

import { getDataLayer } from '@vue-skuilder/db';
import type { SessionStateSnapshot } from '@vue-skuilder/db';
import type { CourseElo } from '@vue-skuilder/common';
import config from '../../skuilder.config.json';
import { USER_STATE_KEYS } from './userState.types';
import type { LetterProgressionState } from './userState.types';
import type { LessonProgressState } from './lessons.types';

const COURSE_ID: string = config.course;

/**
 * Shape of the stored snapshot — the framework types the field as an open
 * `Record`. Every field optional: capture is best-effort per-read.
 */
export interface LpSessionStateSnapshot extends SessionStateSnapshot {
  /** ISO capture time. Distinct from the session's own start/end. */
  at?: string;

  /** Whether this was a real account or a guest at capture time. */
  isGuest?: boolean;

  /** Course-global ELO and the number of responses behind it. */
  elo?: { score: number; count: number };

  /** `reachableWordCount` is the entitlement metric — see dripGate. */
  progression?: {
    unlockedCount: number;
    unlockedLetters: string[];
    reachableWordCount: number;
    /** Letters with at least one WST success. Gates spelling. */
    wstProgressCount: number;
  };

  /**
   * `overdueCount` / `maxOverdueDays` separate a healthy backlog from the
   * stuck queue in agent/scheduler-teacher-audit/perceived-bug.md.
   */
  reviews?: {
    dueCount: number;
    overdueCount: number;
    maxOverdueDays: number;
  };

  lessons?: {
    completedCount: number;
    dismissedCount: number;
    currentLesson: string | null;
    sessionsSinceLastLesson: number;
  };
}

/**
 * Runs on the session-open path, so every read is individually guarded — an
 * unreadable field is simply absent rather than fatal.
 */
export async function captureSessionStateSnapshot(): Promise<LpSessionStateSnapshot> {
  const snapshot: LpSessionStateSnapshot = { at: new Date().toISOString() };

  let userDB;
  try {
    userDB = getDataLayer().getUserDB();
  } catch {
    return snapshot;
  }

  try {
    snapshot.isGuest = userDB.getUsername().startsWith('sk-guest-');
  } catch {
    // leave unset
  }

  const crs = await userDB.getCourseInterface(COURSE_ID);

  await Promise.all([
    // --- ELO ---
    (async () => {
      try {
        const reg = await userDB.getCourseRegDoc(COURSE_ID);
        if (reg?.elo && typeof reg.elo !== 'number') {
          const elo = reg.elo as CourseElo;
          snapshot.elo = { score: elo.global?.score ?? 0, count: elo.global?.count ?? 0 };
        }
      } catch {
        // not registered / no elo
      }
    })(),

    // --- Letter progression ---
    (async () => {
      try {
        const state = await crs.getStrategyState<LetterProgressionState>(
          USER_STATE_KEYS.LETTER_PROGRESSION,
        );
        if (state) {
          snapshot.progression = {
            unlockedCount: state.unlockedLetters.length,
            unlockedLetters: [...state.unlockedLetters],
            reachableWordCount: state.reachableWordCount ?? 0,
            wstProgressCount: Object.keys(state.wstProgress ?? {}).length,
          };
        }
      } catch {
        // no progression yet (day one)
      }
    })(),

    // --- Review backlog ---
    (async () => {
      try {
        const reviews = await userDB.getPendingReviews(COURSE_ID);
        const now = Date.now();
        let overdueCount = 0;
        let maxOverdueMs = 0;
        for (const r of reviews) {
          const t =
            typeof r.reviewTime === 'string'
              ? Date.parse(r.reviewTime)
              : r.reviewTime.valueOf();
          if (Number.isNaN(t)) continue;
          const overdueBy = now - t;
          if (overdueBy > 0) {
            overdueCount++;
            if (overdueBy > maxOverdueMs) maxOverdueMs = overdueBy;
          }
        }
        snapshot.reviews = {
          dueCount: reviews.length,
          overdueCount,
          maxOverdueDays: Math.round((maxOverdueMs / 86_400_000) * 10) / 10,
        };
      } catch {
        // no reviews
      }
    })(),

    // --- Lesson gate ---
    (async () => {
      try {
        const state = await crs.getStrategyState<LessonProgressState>(
          USER_STATE_KEYS.LESSON_PROGRESS,
        );
        if (state) {
          snapshot.lessons = {
            completedCount: state.completedLessons.length,
            dismissedCount: (state.dismissedLessons ?? []).length,
            currentLesson: state.currentLesson,
            sessionsSinceLastLesson: state.sessionsSinceLastLesson ?? 0,
          };
        }
      } catch {
        // no lesson progress
      }
    })(),
  ]);

  return snapshot;
}
