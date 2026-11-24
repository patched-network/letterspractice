/**
 * Trophy case: the session-end keyboard.
 *
 * When a practice session finishes, the persistent keyboard turns into a
 * letter-sound player for everything the learner has unlocked, coloured by
 * what happened this session. It's a short wind-down, not an open-ended toy
 * (see services/dailyDose.ts for the same reasoning at day scale): after
 * TROPHY_WINDOW_MS the keys settle and the screen comes to rest.
 *
 * Shared by StudyPracticeView (the real thing) and /dbg/session-end.
 */

import { computed, onBeforeUnmount, ref, type Ref } from 'vue';
import { useSessionSummary, type SessionRecordEntry } from './useSessionSummary';
import { getDefaultCatalogueIndex } from '../../content/phoneticAnalytics/lib/catalogue';
import { toPhonemeAudioKey, getPhonemeAudioUrl } from '../services/phonetics/phonemeCache';

export const TROPHY_WINDOW_MS = 45_000;
/** How long the letter keys take to dim when the window closes. */
export const TROPHY_DIM_MS = 2_500;
export const TROPHY_REST_MESSAGE = 'See you next time!';

/** Extract individual letter characters from a grapheme (e.g. "sh" → ["s","h"]) */
function lettersFromGrapheme(grapheme: string): string[] {
  return grapheme.replace(/_/g, '').split('').filter(ch => /[a-zA-Z]/.test(ch)).map(ch => ch.toLowerCase());
}

/**
 * @param records     the finished session's records (drives colours + glow)
 * @param baseLetters the learner's unlocked graphemes (drives keycaps + chords)
 */
export function useTrophyCase(records: Ref<SessionRecordEntry[]>, baseLetters: Ref<string[]>) {
  const { summary } = useSessionSummary(records);

  /**
   * Key colors derived from session summary:
   *   Green  (#43A047) — newly introduced this session (highest priority)
   *   Blue   (#42A5F5) — reviewed / exercised
   *   Amber  (#FFA726) — trouble spots (failed exercises)
   *   Default — other unlocked letters (no override)
   */
  const keyColors = computed<Record<string, string>>(() => {
    const colors: Record<string, string> = {};
    const sum = summary.value;

    // Trouble spots (amber) — lowest priority, applied first
    for (const spot of sum.troubleSpots) {
      for (const ch of lettersFromGrapheme(spot.grapheme)) {
        colors[ch] = '#FFA726';
      }
    }

    // Reviewed topics (blue)
    for (const topic of sum.reviewedTopics) {
      for (const ch of lettersFromGrapheme(topic.grapheme)) {
        if (!colors[ch]) colors[ch] = '#42A5F5';
      }
    }

    // New topics (green) — highest priority, always overrides
    for (const topic of sum.newTopics) {
      for (const ch of lettersFromGrapheme(topic.grapheme)) {
        colors[ch] = '#43A047';
      }
    }

    return colors;
  });

  /** New-topic letters glow. */
  const glowLetters = computed<string[]>(() => {
    const glow: string[] = [];
    for (const topic of summary.value.newTopics) {
      for (const ch of lettersFromGrapheme(topic.grapheme)) {
        if (!glow.includes(ch)) glow.push(ch);
      }
    }
    return glow;
  });

  /**
   * Chord definitions: multi-letter graphemes the user has earned, mapped to
   * the phoneme audio URL that should play when both constituent keys are
   * pressed simultaneously. Multi-char entries (e.g. "sh", "a_e") are resolved
   * through the GPC catalogue to their primary phoneme, then to an audio URL.
   */
  const chordDefinitions = computed<Record<string, string>>(() => {
    const index = getDefaultCatalogueIndex();
    const chords: Record<string, string> = {};

    for (const entry of baseLetters.value) {
      // Skip single letters — those are keycaps, not chords
      const stripped = entry.replace(/_/g, '');
      if (stripped.length < 2) continue;

      // Look up the grapheme in the catalogue to get its primary phoneme
      const gpcEntries = index.byGrapheme.get(entry);
      if (!gpcEntries || gpcEntries.length === 0) continue;

      // Take the highest-priority teaching entry
      const gpc = gpcEntries[0];
      if (!gpc.phoneme) continue;

      try {
        const audioKey = toPhonemeAudioKey(gpc.phoneme);
        chords[entry] = getPhonemeAudioUrl(audioKey);
      } catch {
        // Unknown phoneme — skip
      }
    }

    return chords;
  });

  /** True once the window has run out: input blocked, letters dimmed. */
  const resting = ref(false);
  /** Current window length and start (epoch ms), for TrophyWindowBar. */
  const windowMs = ref(TROPHY_WINDOW_MS);
  const windowStartedAt = ref(0);
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** Open the play window; `resting` flips after `ms`. Restartable. */
  function startWindow(ms: number = TROPHY_WINDOW_MS) {
    clearTimeout(timer);
    resting.value = false;
    windowMs.value = ms;
    windowStartedAt.value = Date.now();
    timer = setTimeout(() => {
      resting.value = true;
    }, ms);
  }

  onBeforeUnmount(() => clearTimeout(timer));

  // Keyboard props. At rest the letters dim through the keyboard's own
  // per-key fade (slowed to TROPHY_DIM_MS) and a spacebar appears carrying the
  // sign-off. The spacebar stays un-dimmed so it reads; the caller still
  // passes `disabled` so nothing plays.
  const letters = computed(() =>
    resting.value ? [...baseLetters.value, 'space'] : [...baseLetters.value],
  );
  const enabledLetters = computed(() => (resting.value ? ['space'] : [...baseLetters.value]));
  const spaceText = computed(() => (resting.value ? TROPHY_REST_MESSAGE : undefined));

  return {
    summary,
    keyColors,
    glowLetters,
    chordDefinitions,
    resting,
    windowMs,
    windowStartedAt,
    startWindow,
    letters,
    enabledLetters,
    spaceText,
  };
}
