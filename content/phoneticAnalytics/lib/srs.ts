/**
 * Spaced Repetition System (SRS) Forgetting Curve Model
 * 
 * Implements a Tiered Exponential Decay model.
 * Formula: Mastery(t) = Base + (Peak - Base) * e^(-lambda * t)
 * 
 * @see alignment.md (SRS section)
 */

export interface SRSTierConfig {
  /** The mastery score (0-1) immediately after review/learning */
  peak: number;
  /** The mastery score (0-1) at which a review is typically required */
  threshold: number;
  /** The number of days it takes to decay from peak to threshold */
  decayDuration: number;
}

// Configuration based on the user's "sawtooth" description
export const SRS_TIERS: SRSTierConfig[] = [
  { peak: 0.75, threshold: 0.40, decayDuration: 5 },   // Tier 0: Discovery
  { peak: 0.85, threshold: 0.45, decayDuration: 8 },   // Tier 1: Strengthening
  { peak: 0.90, threshold: 0.50, decayDuration: 14 },  // Tier 2: Consolidation
  { peak: 0.95, threshold: 0.60, decayDuration: 30 },  // Tier 3: Mastery
  { peak: 1.00, threshold: 0.70, decayDuration: 60 },  // Tier 4: Long-term
];

export const BASE_MASTERY = 0.1;

/**
 * State of a specific skill (GPC) in the SRS
 */
export interface SRSSkillState {
  /** Current Tier Level (0-based index into SRS_TIERS) */
  tier: number;
  /** Timestamp (ms) or Day Number of the last review */
  lastReviewTime: number;
}

/**
 * Calculate the decay constant (lambda) for a specific tier
 */
function calculateLambda(tierConfig: SRSTierConfig): number {
  // Formula derived from: Threshold = Base + (Peak - Base) * e^(-lambda * duration)
  // lambda = -ln((Threshold - Base) / (Peak - Base)) / duration
  
  const { peak, threshold, decayDuration } = tierConfig;
  const numerator = threshold - BASE_MASTERY;
  const denominator = peak - BASE_MASTERY;
  
  if (denominator === 0) return 0; // Avoid divide by zero if Peak == Base
  if (numerator <= 0) return 100; // Immediate decay if Threshold <= Base

  return -Math.log(numerator / denominator) / decayDuration;
}

/**
 * Get the current mastery score for a skill state at a specific time
 * 
 * @param state The current state of the skill
 * @param currentTime The current time (must match units of lastReviewTime, e.g. days)
 * @returns Mastery score between 0.0 and 1.0
 */
export function getMasteryScore(state: SRSSkillState, currentTime: number): number {
  const tierConfig = SRS_TIERS[Math.min(state.tier, SRS_TIERS.length - 1)];
  const lambda = calculateLambda(tierConfig);
  const elapsed = Math.max(0, currentTime - state.lastReviewTime);

  const decay = Math.exp(-lambda * elapsed);
  const score = BASE_MASTERY + (tierConfig.peak - BASE_MASTERY) * decay;

  return Math.max(0, Math.min(1, score)); // Clamp 0-1
}

/**
 * Perform a review on a skill, advancing its tier
 * 
 * @param state Current state
 * @param currentTime Time of review
 * @returns New state
 */
export function reviewSkill(state: SRSSkillState, currentTime: number): SRSSkillState {
  // Logic: 
  // If reviewing "early" (score high), maybe we don't advance tier? 
  // For this simple model, we assume a review implies successful recall/strengthening,
  // so we always bump the tier (up to max).
  
  const nextTier = Math.min(state.tier + 1, SRS_TIERS.length - 1);
  
  return {
    tier: nextTier,
    lastReviewTime: currentTime
  };
}

/**
 * Initialize a new skill
 * 
 * @param currentTime Start time
 * @returns Initial state (Tier 0)
 */
export function learnSkill(currentTime: number): SRSSkillState {
  return {
    tier: 0,
    lastReviewTime: currentTime
  };
}
