/**
 * Re-export ARPAbet type system from phoneticAnalytics
 *
 * Safe to import: no data dependencies (CMUdict/Subtlex not bundled)
 */

export type {
  ArpabetPhoneme,
  ArpabetVowel,
  ArpabetConsonant,
  ArpabetWithStress,
} from '../../../content/phoneticAnalytics/lib/types';

export {
  // Phoneme sets
  VOWELS,
  CONSONANTS,
  VOWEL_SET,
  CONSONANT_SET,
  PHONEME_SET,

  // Phoneme subcategories
  MONOPHTHONGS,
  DIPHTHONGS,
  STOPS,
  FRICATIVES,
  AFFRICATES,
  NASALS,
  LIQUIDS,
  GLIDES,
  VOICED_CONSONANTS,
  VOICELESS_CONSONANTS,
  VOICING_PAIRS,

  // Utility functions
  stripStress,
  isVowel,
  isConsonant,
  isValidPhoneme,
  isDiphthong,
  isMonophthong,
  getStress,
  countVowels,
  isMonosyllabic,
  getVoicingCounterpart,
  toArpabet,
  phonemeSeqToId,
  idToPhonemeSeq,

  // IPA conversion
  ARPABET_TO_IPA,
  toIPA,
} from '../../../content/phoneticAnalytics/lib/arpabet';
