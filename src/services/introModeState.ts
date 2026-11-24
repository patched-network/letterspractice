/**
 * Ephemeral in-session intro mode state.
 *
 * Tracks which ARPAbet phonemes were just introduced via a GPC intro view.
 * Consumed by question views (e.g. WordSelectionView) to provide extra
 * audio scaffolding regardless of ELO gap.
 *
 * Resets on page reload (module-level) and should be explicitly cleared
 * at session end via clearAll().
 */

import { PhonemeAudioKey } from "./phonetics";

const introModePhonemes = new Set<PhonemeAudioKey>();

export const introModeState = {
    set(phoneme: PhonemeAudioKey)      { introModePhonemes.add(phoneme); },
    isActive(phoneme: PhonemeAudioKey) { return introModePhonemes.has(phoneme); },
    clearAll()                { introModePhonemes.clear(); },
};
