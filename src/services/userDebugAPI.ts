/**
 * User Debug API for letterspractice.
 *
 * Console-accessible API for inspecting and managing user state.
 * Mounted as `window.letterspractice.user` in main.ts.
 *
 * Provides:
 *   - show*() methods for console inspection
 *   - getProgressSummary() for structured data (UI / drip-email consumption)
 *   - clearUserProgress() for full reset-to-fresh-user
 *
 * All read operations use stable @vue-skuilder/db APIs.
 * clearUserProgress() uses a mix of public API + raw PouchDB for bulk deletion.
 *
 * See: agent/user-data-hooks/a.1.assessment.md
 */

import { getDataLayer } from '@vue-skuilder/db';
import { DocType, DocTypePrefixes } from '@vue-skuilder/db';
import type { UserDBInterface, UsrCrsDataInterface, StudySessionDoc } from '@vue-skuilder/db';
import type { CourseElo } from '@vue-skuilder/common';
import type { TagScores } from './lessons/progress/types';
import config from '../../skuilder.config.json';
import type {
  UserProfileData,
  LetterProgressionState,
  PrescribedProgressState,
} from './userState.types';
import type { LessonProgressState } from './lessons.types';
import { USER_STATE_KEYS } from './userState.types';
import { resetDevDateOffset } from '../dbg/devDateOffset';
import {
  captureUserProfile as captureSnapshot,
  loadUserProfile as loadSnapshot,
  wipeUserStateDocs,
  downloadSnapshot,
  type UserProfileSnapshot,
} from './userProfileSnapshot';

const COURSE_ID: string = config.course;
const ONBOARDING_STORAGE_KEY = 'letterspractice-onboarding';
const SESSION_TRACKING_STORAGE_PREFIX = 'sk-session-tracking';

// ============================================================================
// Internals
// ============================================================================

function getUserDB(): UserDBInterface | null {
  try {
    return getDataLayer().getUserDB();
  } catch {
    console.warn('[LP User] Data layer not initialized yet.');
    return null;
  }
}

async function getCourseDB(): Promise<UsrCrsDataInterface | null> {
  const userDB = getUserDB();
  if (!userDB) return null;
  try {
    return await userDB.getCourseInterface(COURSE_ID);
  } catch {
    console.warn('[LP User] Failed to get course interface.');
    return null;
  }
}

/**
 * Access the internal PouchDB instance for raw queries / bulk operations.
 * Same escape hatch used by UserDBDebugger in @vue-skuilder/db.
 */
function getRawDB(): any | null {
  const userDB = getUserDB();
  if (!userDB) return null;
  const rawDB = (userDB as any).localDB;
  if (!rawDB) {
    console.warn('[LP User] Unable to access raw database instance.');
    return null;
  }
  return rawDB;
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleString();
}

function formatReviewRow(doc: any, diffMs: number) {
  const diffMin = Math.round(diffMs / 60000);
  let when: string;
  if (diffMin < 0) {
    const absMin = Math.abs(diffMin);
    when = absMin < 60 ? `${absMin}m overdue` : `${(absMin / 60).toFixed(1)}h overdue`;
  } else if (diffMin < 60) {
    when = `in ${diffMin}m`;
  } else if (diffMin < 1440) {
    when = `in ${(diffMin / 60).toFixed(1)}h`;
  } else {
    when = `in ${(diffMin / 1440).toFixed(1)}d`;
  }

  return {
    card: doc.cardId.length > 30 ? doc.cardId.slice(0, 30) + '…' : doc.cardId,
    when,
    scheduledFor: doc.scheduledFor,
    agent: doc.schedulingAgentId,
  };
}

// ============================================================================
// Structured Data — reusable by UI / drip-email / reports
// ============================================================================

export interface ProgressSummary {
  username: string;
  isLoggedIn: boolean;
  isGuest: boolean;
  courseId: string;

  letterProgression: {
    unlockedLetters: string[];
    unlockedCount: number;
    wstProgress: Record<string, number>;
  } | null;

  elo: {
    globalScore: number;
    globalCount: number;
    tagScores: TagScores;
  } | null;

  lessonProgress: {
    completedLessons: string[];
    dismissedLessons: string[];
    currentLesson: string | null;
    skippedCount: number;
    sessionsSinceLastLesson: number;
    /** lessonId → ISO first-pass time; absent for lessons passed before tracking began */
    passedAt: Record<string, string>;
  } | null;

  prescribedProgress: {
    updatedAt: string;
    groupCount: number;
    groups: Record<string, {
      encounteredCardIds: string[];
      pendingTargetIds: string[];
      blockedTargetIds: string[];
      sessionsSinceSurfaced: number;
      lastSurfacedAt: string | null;
      lastSupportAt: string | null;
      lastResolvedSupportTags: string[];
    }>;
  } | null;

  reviews: {
    pendingCount: number;
    nextReviewTime: string | null;
  };

  activity: {
    seenCardCount: number;
    sessionCount: number;
    firstSession: string | null;
    lastSession: string | null;
  };

  profile: UserProfileData | null;
}

/**
 * Build a structured summary of user progress.
 *
 * Returns a plain object suitable for JSON serialization, console display,
 * UI rendering, or drip-email data population.
 */
export async function getProgressSummary(): Promise<ProgressSummary | null> {
  const userDB = getUserDB();
  if (!userDB) return null;

  const crs = await getCourseDB();

  // --- Letter progression ---
  let letterProgression: ProgressSummary['letterProgression'] = null;
  if (crs) {
    try {
      const state = await crs.getStrategyState<LetterProgressionState>(
        USER_STATE_KEYS.LETTER_PROGRESSION,
      );
      if (state) {
        letterProgression = {
          unlockedLetters: [...state.unlockedLetters],
          unlockedCount: state.unlockedLetters.length,
          wstProgress: { ...(state.wstProgress ?? {}) },
        };
      }
    } catch {
      // no-op
    }
  }

  // --- ELO ---
  let elo: ProgressSummary['elo'] = null;
  try {
    const reg = await userDB.getCourseRegDoc(COURSE_ID);
    if (reg?.elo && typeof reg.elo !== 'number') {
      const courseElo = reg.elo as CourseElo;
      const tagScores: TagScores = {};
      if (courseElo.tags) {
        for (const [tag, info] of Object.entries(courseElo.tags)) {
          // `recent` is the mastery signal (ring buffer of presentations);
          // absent on docs written before it existed.
          tagScores[tag] = { score: info.score, count: info.count, recent: info.recent };
        }
      }
      elo = {
        globalScore: courseElo.global?.score ?? 0,
        globalCount: courseElo.global?.count ?? 0,
        tagScores,
      };
    }
  } catch {
    // not registered or no elo
  }

  // --- Pending reviews ---
  let pendingCount = 0;
  let nextReviewTime: string | null = null;
  try {
    const reviews = await userDB.getPendingReviews(COURSE_ID);
    pendingCount = reviews.length;
    if (reviews.length > 0) {
      const sorted = reviews.sort((a, b) => {
        const tA = typeof a.reviewTime === 'string' ? a.reviewTime : a.reviewTime.toISOString();
        const tB = typeof b.reviewTime === 'string' ? b.reviewTime : b.reviewTime.toISOString();
        return new Date(tA).getTime() - new Date(tB).getTime();
      });
      const first = sorted[0];
      nextReviewTime =
        typeof first.reviewTime === 'string'
          ? first.reviewTime
          : first.reviewTime.toISOString();
    }
  } catch {
    // no reviews
  }

  // --- Seen cards ---
  let seenCardCount = 0;
  try {
    const seen = await userDB.getSeenCards(COURSE_ID);
    seenCardCount = seen.length;
  } catch {
    // no data
  }

  // --- Session tracking ---
  let sessionCount = 0;
  let firstSession: string | null = null;
  let lastSession: string | null = null;
  try {
    const stKey = `${SESSION_TRACKING_STORAGE_PREFIX}-default`;
    const raw = localStorage.getItem(stKey);
    if (raw) {
      const st = JSON.parse(raw);
      sessionCount = st.sessionCount ?? 0;
      firstSession = st.firstSessionDate || null;
      lastSession = st.lastSessionDate || null;
    }
  } catch {
    // no session tracking data
  }

  // --- Lesson progress ---
  let lessonProgress: ProgressSummary['lessonProgress'] = null;
  if (crs) {
    try {
      const lpState = await crs.getStrategyState<LessonProgressState>(
        USER_STATE_KEYS.LESSON_PROGRESS,
      );
      if (lpState) {
        lessonProgress = {
          completedLessons: [...lpState.completedLessons],
          dismissedLessons: [...(lpState.dismissedLessons ?? [])],
          currentLesson: lpState.currentLesson,
          skippedCount: lpState.skippedCount,
          sessionsSinceLastLesson: lpState.sessionsSinceLastLesson ?? 0,
          passedAt: { ...(lpState.passedAt ?? {}) },
        };
      }
    } catch {
      // no lesson progress
    }
  }

  // --- Prescribed progress ---
  let prescribedProgress: ProgressSummary['prescribedProgress'] = null;
  if (crs) {
    try {
      const ppState = await crs.getStrategyState<PrescribedProgressState>(
        USER_STATE_KEYS.PRESCRIBED_PROGRESS,
      );
      if (ppState) {
        const groups = Object.fromEntries(
          Object.entries(ppState.groups ?? {}).map(([groupId, group]) => [
            groupId,
            {
              encounteredCardIds: [...(group.encounteredCardIds ?? [])],
              pendingTargetIds: [...((group as any).pendingTargetIds ?? [])],
              blockedTargetIds: [...(group.blockedTargetIds ?? [])],
              sessionsSinceSurfaced: group.sessionsSinceSurfaced ?? 0,
              lastSurfacedAt: group.lastSurfacedAt ?? null,
              lastSupportAt: group.lastSupportAt ?? null,
              lastResolvedSupportTags: [...(group.lastResolvedSupportTags ?? [])],
            },
          ]),
        );
        prescribedProgress = {
          updatedAt: ppState.updatedAt,
          groupCount: Object.keys(groups).length,
          groups,
        };
      }
    } catch {
      // no prescribed progress
    }
  }

  // --- User profile ---
  let profile: UserProfileData | null = null;
  if (crs) {
    try {
      profile = await crs.getStrategyState<UserProfileData>(USER_STATE_KEYS.USER_PROFILE);
    } catch {
      // no profile
    }
  }

  const username = userDB.getUsername();

  return {
    username,
    isLoggedIn: userDB.isLoggedIn(),
    isGuest: username.startsWith('sk-guest-'),
    courseId: COURSE_ID,
    letterProgression,
    elo,
    lessonProgress,
    prescribedProgress,
    reviews: { pendingCount, nextReviewTime },
    activity: { seenCardCount, sessionCount, firstSession, lastSession },
    profile,
  };
}

// ============================================================================
// Console Display — show*() methods
// ============================================================================

export const userDebugAPI = {
  /**
   * Show user identity and onboarding profile.
   */
  async showUser(): Promise<void> {
    const summary = await getProgressSummary();
    if (!summary) {
      console.warn('[LP User] No data available.');
      return;
    }

    console.group('👤 User');
    console.log(`Username:    ${summary.username}`);
    console.log(`Logged in:   ${summary.isLoggedIn ? 'Yes ✅' : 'No (Guest) ❌'}`);
    console.log(`Course:      ${summary.courseId}`);

    if (summary.profile) {
      console.group('📋 Onboarding Profile');
      console.log(`Child age:       ${summary.profile.childAge || 'Not set'}`);
      console.log(`Literacy level:  ${summary.profile.literacyLevel}`);
      console.log(`Completed at:    ${fmtDate(summary.profile.completedAt)}`);
      if (summary.profile.sensitiveWords?.length) {
        console.log(`Sensitive words: ${summary.profile.sensitiveWords.join(', ')}`);
      }
      console.log(`Seasonal:        ${summary.profile.seasonalSettings?.enabled ? 'On' : 'Off'}`);
      console.groupEnd();
    } else {
      console.log('Profile:     Not set (onboarding incomplete?)');
    }

    console.log(`Sessions:    ${summary.activity.sessionCount}`);
    console.log(`First:       ${fmtDate(summary.activity.firstSession ?? undefined)}`);
    console.log(`Last:        ${fmtDate(summary.activity.lastSession ?? undefined)}`);
    console.groupEnd();
  },

  /**
   * Show letter progression — unlocked letters and WST progress.
   */
  async showProgress(): Promise<void> {
    const summary = await getProgressSummary();
    if (!summary) {
      console.warn('[LP User] No data available.');
      return;
    }

    console.group('🔤 Letter Progression');

    if (summary.letterProgression) {
      const lp = summary.letterProgression;
      console.log(
        `Unlocked (${lp.unlockedCount}): ${lp.unlockedLetters.length > 0 ? lp.unlockedLetters.join(' ') : '(none)'}`,
      );

      const wstKeys = Object.keys(lp.wstProgress);
      if (wstKeys.length > 0) {
        console.group('📊 WST Progress (correct answers per letter)');
        console.table(
          Object.entries(lp.wstProgress)
            .sort(([, a], [, b]) => b - a)
            .map(([letter, count]) => ({ letter, correct: count })),
        );
        console.groupEnd();
      } else {
        console.log('WST Progress: (none yet)');
      }
    } else {
      console.log('No letter progression data (brand-new user)');
    }

    // ELO
    if (summary.elo) {
      console.group('📈 ELO');
      console.log(`Global: ${summary.elo.globalScore.toFixed(0)} (${summary.elo.globalCount} interactions)`);
      const tagKeys = Object.keys(summary.elo.tagScores);
      if (tagKeys.length > 0) {
        console.table(
          Object.entries(summary.elo.tagScores)
            .sort(([, a], [, b]) => b.score - a.score)
            .map(([tag, info]) => ({ tag, score: info.score.toFixed(0), interactions: info.count })),
        );
      }
      console.groupEnd();
    } else {
      console.log('ELO: Not available');
    }

    // Cards seen
    console.log(`Cards seen: ${summary.activity.seenCardCount}`);

    if (summary.prescribedProgress) {
      console.group('🧭 Prescribed Progress');
      console.log(`Updated: ${fmtDate(summary.prescribedProgress.updatedAt)}`);
      console.log(`Groups:  ${summary.prescribedProgress.groupCount}`);

      const rows = Object.entries(summary.prescribedProgress.groups).map(([groupId, group]) => ({
        group: groupId,
        encountered: group.encounteredCardIds.length,
        blocked: group.blockedTargetIds.length,
        sessionsSinceSurfaced: group.sessionsSinceSurfaced,
        lastSurfacedAt: group.lastSurfacedAt ? fmtDate(group.lastSurfacedAt) : 'N/A',
        lastSupportAt: group.lastSupportAt ? fmtDate(group.lastSupportAt) : 'N/A',
        supportTags: group.lastResolvedSupportTags.join(', '),
      }));

      if (rows.length > 0) {
        console.table(rows);
      } else {
        console.log('No prescribed groups recorded yet.');
      }
      console.groupEnd();
    } else {
      console.log('Prescribed Progress: Not available');
    }

    console.groupEnd();
  },

  /**
   * Show all scheduled reviews — both overdue and upcoming.
   */
  async showReviews(): Promise<void> {
    const rawDB = getRawDB();
    if (!rawDB) return;

    try {
      const prefix = DocTypePrefixes[DocType.SCHEDULED_CARD];
      const result = await rawDB.allDocs({
        startkey: prefix,
        endkey: prefix + '\ufff0',
        include_docs: true,
      });

      const reviews = result.rows
        .filter((r: any) => r.doc)
        .map((r: any) => r.doc)
        .filter((doc: any) => !doc.courseId || doc.courseId === COURSE_ID);

      const now = Date.now();

      const overdue: any[] = [];
      const upcoming: any[] = [];

      for (const r of reviews) {
        const time = typeof r.reviewTime === 'string' ? r.reviewTime : r.reviewTime.toISOString();
        const diffMs = new Date(time).getTime() - now;
        const entry = { doc: r, time, diffMs };
        if (diffMs <= 0) {
          overdue.push(entry);
        } else {
          upcoming.push(entry);
        }
      }

      overdue.sort((a, b) => a.diffMs - b.diffMs);
      upcoming.sort((a, b) => a.diffMs - b.diffMs);

      console.group(`📅 Scheduled Reviews (${reviews.length} total)`);

      if (overdue.length > 0) {
        console.group(`⏰ Overdue (${overdue.length})`);
        console.table(
          overdue.slice(0, 25).map((e) => formatReviewRow(e.doc, e.diffMs)),
        );
        if (overdue.length > 25) console.log(`... and ${overdue.length - 25} more`);
        console.groupEnd();
      }

      if (upcoming.length > 0) {
        console.group(`🔜 Upcoming (${upcoming.length})`);
        console.table(
          upcoming.slice(0, 25).map((e) => formatReviewRow(e.doc, e.diffMs)),
        );
        if (upcoming.length > 25) console.log(`... and ${upcoming.length - 25} more`);
        console.groupEnd();
      }

      if (reviews.length === 0) {
        console.log('No scheduled reviews.');
      }

      console.groupEnd();
    } catch (err) {
      console.error('[LP User] Error loading reviews:', err);
    }
  },

  /**
   * Show all user state in one call.
   */
  /**
   * Show the learner's recent study sessions.
   *
   * Reads the `SESSION::*` docs written by `SessionController` — the durable
   * per-sitting record that makes sessions (rather than individual cards) the
   * unit of analysis. `status` is the column to scan: `closed` ran to
   * completion, `abandoned` was navigated away from, `open` means the tab went
   * away mid-session.
   *
   * @param limit - How many of the most recent sessions to list.
   */
  async showSessions(limit = 10): Promise<void> {
    const userDB = getUserDB();
    if (!userDB) {
      console.warn('[LP User] No data layer available.');
      return;
    }

    let sessions: StudySessionDoc[];
    try {
      sessions = await userDB.getStudySessions(COURSE_ID);
    } catch (e) {
      console.warn('[LP User] Could not read study sessions:', e);
      return;
    }

    console.group(`📅 Study Sessions (${sessions.length} total)`);
    if (sessions.length === 0) {
      console.log('No sessions recorded yet. (Sessions are written from the');
      console.log('first study session started after this feature shipped.)');
      console.groupEnd();
      return;
    }

    console.table(
      sessions.slice(0, limit).map((s) => ({
        started: fmtDate(s.startTime),
        status: s.status,
        cards: s.tally?.cardsPresented ?? '—',
        correct: s.tally ? `${s.tally.correct}/${s.tally.responses}` : '—',
        runs: s.runs?.length ?? 0,
        letters: (s.stateAtStart as { progression?: { unlockedCount?: number } } | undefined)
          ?.progression?.unlockedCount ?? '—',
        session: s.sessionId.slice(-6),
      })),
    );
    console.log('Full docs: await window.letterspractice.user.getSessions()');
    console.groupEnd();
  },

  /** The raw study-session docs, newest first. */
  async getSessions(): Promise<StudySessionDoc[]> {
    const userDB = getUserDB();
    return userDB ? userDB.getStudySessions(COURSE_ID) : [];
  },

  async showAll(): Promise<void> {
    await this.showUser();
    await this.showProgress();
    await this.showReviews();
    await this.showSessions();
  },

  /**
   * Return a structured progress summary object.
   * Useful for programmatic access, future UI, or drip-email data.
   */
  async getSummary(): Promise<ProgressSummary | null> {
    const summary = await getProgressSummary();
    if (summary) {
      console.log('[LP User] Progress summary (also returned as object):');
      console.log(JSON.stringify(summary, null, 2));
    }
    return summary;
  },

  /**
   * Export all raw user documents for this course as JSON.
   * Includes card histories, scheduled reviews, strategy state.
   */
  async exportRaw(): Promise<string> {
    const rawDB = getRawDB();
    const userDB = getUserDB();
    if (!rawDB || !userDB) return '{}';

    try {
      const allDocs = await rawDB.allDocs({ include_docs: true });
      const data = {
        username: userDB.getUsername(),
        courseId: COURSE_ID,
        exportedAt: new Date().toISOString(),
        totalDocs: allDocs.rows.length,
        documents: allDocs.rows.map((row: any) => ({
          id: row.id,
          doc: row.doc,
        })),
      };

      const json = JSON.stringify(data, null, 2);
      console.log(`[LP User] Exported ${allDocs.rows.length} documents. Copy with:`);
      console.log('  copy(await window.letterspractice.user.exportRaw())');
      return json;
    } catch (err) {
      console.error('[LP User] Export failed:', err);
      return '{}';
    }
  },

  // ==========================================================================
  // Profile snapshots (persona substrate — see services/userProfileSnapshot.ts)
  // ==========================================================================

  /**
   * Serialize the current learner's complete course state as a portable,
   * time-invariant snapshot (timestamps stored as offsets from capture, so a
   * "three weeks in" capture still means three-weeks-in when loaded later).
   * Pure read; the live user is untouched.
   *
   * Usage:
   *   await letterspractice.user.captureUserProfile('three-weeks-in')            // → object
   *   await letterspractice.user.captureUserProfile('three-weeks-in', true)      // + download .json
   */
  async captureUserProfile(label?: string, download = false): Promise<UserProfileSnapshot> {
    const snap = await captureSnapshot(label);
    console.log(
      `[LP User] Captured '${snap.label}': ${snap.docs.length} docs from ${snap.sourceUsername}.`
    );
    if (download) downloadSnapshot(snap);
    else console.log("  Download with: captureUserProfile('label', true), or copy(JSON.stringify(snap))");
    return snap;
  },

  /**
   * Replace the current user's course state with a snapshot (object, JSON
   * string, or URL to fetch one from), rebased to "now".
   *
   * ⚠️  Destructive: wipes the current user's course state first, exactly like
   * clearUserProgress. Reload the page afterwards — in-memory session state is
   * not refreshed.
   */
  async loadUserProfile(snapshot: UserProfileSnapshot | string): Promise<void> {
    let snap = snapshot;
    if (typeof snap === 'string') {
      snap = snap.trimStart().startsWith('{')
        ? (JSON.parse(snap) as UserProfileSnapshot)
        : ((await (await fetch(snap)).json()) as UserProfileSnapshot);
    }
    await loadSnapshot(snap);
    console.log(`[LP User] Loaded profile '${snap.label}' (${snap.docs.length} docs, rebased to now).`);
    console.log('  Reload the page to run against the loaded state.');
  },

  // ==========================================================================
  // Mutations
  // ==========================================================================

  /**
   * Clear ALL user progress and restart as a fresh user against the current
   * course content.
   *
   * This deletes:
   *   1. Strategy state docs (UserProfile, LetterProgression)
   *   2. Card interaction histories (cardH* docs)
   *   3. Scheduled reviews (card_review_* docs)
   *   4. User outcome records (USER_OUTCOME* docs)
   *   5. localStorage: onboarding state, session tracking
   *   6. Drops and re-registers for the course (resets ELO)
   *
   * After completion, prompts a page reload.
   *
   * ⚠️  This is destructive and irreversible for guest users.
   *     For authenticated users with remote sync, deleted data may be
   *     restored from CouchDB on next sync — use with that understanding.
   */
  async clearUserProgress(): Promise<void> {
    const userDB = getUserDB();
    const rawDB = getRawDB();
    const crs = await getCourseDB();

    if (!userDB) {
      console.error('[LP User] Data layer not ready. Cannot clear.');
      return;
    }

    const username = userDB.getUsername();
    const isGuest = username.startsWith('sk-guest-');

    console.group('🗑️ Clearing user progress');
    console.log(`User: ${username} (${isGuest ? 'guest' : 'authenticated'})`);

    if (!isGuest) {
      console.warn(
        '⚠️  Authenticated user: local data will be deleted, but remote CouchDB may ' +
          'restore it on next sync. For a true reset, the server-side data must also be cleared.',
      );
    }

    let deletedCount = 0;

    // 1. Delete strategy state documents via public API
    if (crs) {
      try {
        await crs.deleteStrategyState(USER_STATE_KEYS.LETTER_PROGRESSION);
        console.log('  ✓ Deleted LetterProgression strategy state');
        deletedCount++;
      } catch (e) {
        console.warn('  ⚠ LetterProgression not found or already deleted');
      }

      try {
        await crs.deleteStrategyState(USER_STATE_KEYS.USER_PROFILE);
        console.log('  ✓ Deleted UserProfile strategy state');
        deletedCount++;
      } catch (e) {
        console.warn('  ⚠ UserProfile not found or already deleted');
      }
    }

    // 2. Bulk-delete all user-state doc families via the shared manifest
    // (userProfileSnapshot.ts). capture/load/clear iterate the same list, so
    // a doc kind added to the manifest is picked up by all three together.
    if (rawDB) {
      try {
        const counts = await wipeUserStateDocs();
        for (const [label, n] of Object.entries(counts)) {
          if (n > 0) {
            console.log(`  ✓ Deleted ${n} ${label} docs`);
            deletedCount += n;
          } else {
            console.log(`  - No ${label} docs to delete`);
          }
        }
      } catch (e) {
        console.warn('  ⚠ Error bulk-deleting user-state docs:', e);
      }
    }

    // 3. Reset ELO on course registration doc
    // Note: dropCourse/registerForCourse don't actually clear ELO —
    // dropCourse sets status='dropped' (ELO intact), registerForCourse
    // finds the existing entry and sets status='active' (ELO still intact).
    // So we reset it directly on the registration doc.
    try {
      const regDoc = await userDB.getCourseRegistrationsDoc();
      const courseEntry = regDoc.courses.find((c: any) => c.courseID === COURSE_ID);
      if (courseEntry) {
        courseEntry.elo = { global: { score: 1000, count: 0 }, tags: {}, misc: {} };
        courseEntry.status = 'active';
        await rawDB.put(regDoc);
        console.log('  ✓ Reset ELO to defaults on course registration');
      }
    } catch (e) {
      console.warn('  ⚠ Failed to reset ELO:', e);
    }

    // 4. Clear localStorage entries
    try {
      localStorage.removeItem(ONBOARDING_STORAGE_KEY);
      console.log('  ✓ Cleared onboarding localStorage');
    } catch {
      // localStorage not available
    }

    try {
      resetDevDateOffset();
      console.log('  ✓ Reset dev date offset');
    } catch {
      // dev shim not active or localStorage not available
    }

    try {
      // Clear session tracking for all course scopes
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(SESSION_TRACKING_STORAGE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
      if (keysToRemove.length > 0) {
        console.log(`  ✓ Cleared ${keysToRemove.length} session tracking entries`);
      }
    } catch {
      // localStorage not available
    }

    console.log(`\nDone. Deleted ${deletedCount} documents total.`);
    console.groupEnd();

    // Prompt reload
    console.log('\n🔄 Reload the page to start fresh:');
    console.log('   window.location.reload()');
    console.log('\n   Or auto-reload in 1 seconds...');

    setTimeout(() => {
      if (confirm('Reload page to apply reset?')) {
        window.location.reload();
      }
    }, 1000);
  },

  /**
   * Clear only onboarding data (localStorage + UserDB strategy state).
   * Lighter than clearUserProgress — preserves card history and ELO.
   */
  async clearOnboarding(): Promise<void> {
    const crs = await getCourseDB();

    console.group('🧹 Clearing onboarding data');

    if (crs) {
      try {
        await crs.deleteStrategyState(USER_STATE_KEYS.USER_PROFILE);
        console.log('  ✓ Deleted UserProfile strategy state');
      } catch {
        console.warn('  ⚠ UserProfile not found');
      }
    }

    try {
      localStorage.removeItem(ONBOARDING_STORAGE_KEY);
      console.log('  ✓ Cleared onboarding localStorage');
    } catch {
      // not available
    }

    console.log('Done. Reload to see fresh onboarding.');
    console.groupEnd();
  },

  /**
   * Unlock all 26 letter keycaps at once.
   * Useful for skipping GPC intros during development/testing.
   */
  async addAllLetters(): Promise<void> {
    const crs = await getCourseDB();
    if (!crs) {
      console.error('[LP User] Course DB not available.');
      return;
    }

    try {
      const current = await crs.getStrategyState<LetterProgressionState>(
        USER_STATE_KEYS.LETTER_PROGRESSION,
      );
      const state: LetterProgressionState = current ?? {
        unlockedLetters: [],
        updatedAt: new Date().toISOString(),
      };

      const allLetters = 'abcdefghijklmnopqrstuvwxyz'.split('');
      state.unlockedLetters = allLetters;
      state.updatedAt = new Date().toISOString();

      await crs.putStrategyState<LetterProgressionState>(
        USER_STATE_KEYS.LETTER_PROGRESSION,
        state,
      );
      console.log('[LP User] ✓ All 26 letters unlocked. Reload to see changes.');
    } catch (e) {
      console.error('[LP User] Failed to unlock all letters:', e);
    }
  },

  /**
   * Clear only letter progression state.
   * Re-locks all letters; user will need to redo GPC intros.
   */
  async clearLetterProgression(): Promise<void> {
    const crs = await getCourseDB();
    if (!crs) {
      console.error('[LP User] Course DB not available.');
      return;
    }

    try {
      await crs.deleteStrategyState(USER_STATE_KEYS.LETTER_PROGRESSION);
      console.log('[LP User] ✓ Letter progression cleared. All letters re-locked.');
    } catch {
      console.warn('[LP User] ⚠ No letter progression data found.');
    }
  },

  /**
   * Show help for available commands.
   */
  help(): void {
    console.log(`
🔧 LettersPractice User Debug API

  Inspection:
    .showUser()                Show identity, profile, session info
    .showProgress()            Show unlocked letters, WST progress, ELO, cards seen
    .showReviews()             Show all scheduled reviews (overdue + upcoming)
    .showSessions([n])         Show recent study sessions (status, tally, pipeline runs)
    .showAll()                 Run all show commands

  Data:
    .getSummary()              Get structured ProgressSummary object
    .getSessions()             Get raw StudySessionDoc[] (newest first)
    .exportRaw()               Export all raw user documents as JSON

  Mutations:
    .clearUserProgress()       ⚠️ FULL RESET — delete all progress, restart fresh
    .clearOnboarding()         Clear onboarding profile only (preserves progress)
    .addAllLetters()           Unlock all 26 letter keycaps at once
    .clearLetterProgression()  Re-lock all letters (must redo GPC intros)

  Meta:
    .help()                    Show this help message

  Usage:
    window.letterspractice.user.showAll()
    window.letterspractice.user.clearUserProgress()
    const data = await window.letterspractice.user.getSummary()
`);
  },
};

// ============================================================================
// Window mount
// ============================================================================

declare global {
  interface Window {
    letterspractice?: {
      user?: typeof userDebugAPI;
      [key: string]: unknown;
    };
  }
}

/**
 * Mount the debug API on `window.letterspractice.user`.
 *
 * Call this after data layer initialization in main.ts.
 */
export function mountUserDebugAPI(): void {
  if (typeof window === 'undefined') return;

  window.letterspractice = window.letterspractice || {};
  window.letterspractice.user = userDebugAPI;

  console.log(
    '[LP] User debug API mounted. Try: window.letterspractice.user.help()',
  );
}
