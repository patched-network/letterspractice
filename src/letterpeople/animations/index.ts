/**
 * Animations Module
 *
 * Exports high-level animation sequences for LetterPeople.
 */

export {
  headShakeNo,
  speakPhoneme,
  sayNo,
  type SequenceOptions,
  type HeadShakeOptions,
  type SpeakPhonemeOptions,
  type SayNoOptions,
} from "./speech";

export {
  celebrate,
  RANDOM_CELEBRATIONS,
  type CelebrateOptions,
  type CelebrationType,
} from "./celebrations";

export {
  characterize,
  decharacterize,
  startIdle,
  type CharacterizeOptions,
  type IdleOptions,
} from "./presence";

export {
  floss,
  flossOneBeat,
  FLOSS_BEAT_LABELS,
  FLOSS_CYCLE_BEATS,
  FLOSS_DEFAULT_BEAT_MS,
  FLOSS_DEFAULT_AMPLITUDE,
  type FlossOptions,
  type FlossBeatOptions,
} from "./floss";

export { applyLetterEffect } from "./applyLetterEffect";
