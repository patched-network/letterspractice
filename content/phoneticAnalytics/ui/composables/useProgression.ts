import sequenceData from '@data/gpc-sequence.json';
import { 
  learnSkill, 
  reviewSkill, 
  getMasteryScore, 
  SRS_TIERS,
  SRSSkillState
} from '@lib/srs';

// Centralize the definition of what constitutes the "Base" knowledge
// This matches the "Step 0" logic from the analysis
export const INITIAL_GPCS = ['GPC-s-S', 'GPC-n-N', 'GPC-i-IH', 'GPC-t-T'];

export const SEQUENCE_LENGTH = sequenceData.sequence.length - 1;
export const MAX_SIMULATION_DAYS = SEQUENCE_LENGTH + 100; // Allow 100 days of extra reinforcement

/**
 * Calculates the current mastery score for a skill by simulating its history
 * up to the current day.
 * 
 * @param introDay The day (step) the skill was first introduced
 * @param currentDay The current day (step) in the simulation
 */
function simulateSRSScore(introDay: number, currentDay: number): number {
  if (currentDay < introDay) return 0;

  let state: SRSSkillState = learnSkill(introDay);
  
  // Simulate the ideal student's review history
  // They review exactly when the "decay duration" for the current tier expires.
  while (true) {
    const tierConfig = SRS_TIERS[state.tier];
    const nextReviewDay = state.lastReviewTime + tierConfig.decayDuration;

    // If the next review is in the future (relative to current simulation day),
    // then we stop simulating history.
    if (nextReviewDay > currentDay) {
      break;
    }

    // Otherwise, perform the review and continue
    state = reviewSkill(state, nextReviewDay);
    
    // Safety break for max tier (though reviewSkill clamps tier anyway)
    if (state.tier >= SRS_TIERS.length - 1 && nextReviewDay + SRS_TIERS[SRS_TIERS.length-1].decayDuration > currentDay) {
       break; 
    }
  }

  return getMasteryScore(state, currentDay);
}

/**
 * Returns a Learner Profile Map based on the curriculum progression step.
 * Treats the 'step' as 'days elapsed'.
 * 
 * @param step The step number (0 to MAX_SIMULATION_DAYS) representing current day
 */
export function getProfileForStep(step: number): Map<string, number> {
  const profile = new Map<string, number>();
  const currentDay = step;

  // 1. Add Initial Base (Introduced at Day 0)
  INITIAL_GPCS.forEach(id => {
    profile.set(id, simulateSRSScore(0, currentDay));
  });

  // 2. Add GPCs from sequence
  // We stop adding new GPCs if we are past the sequence length, 
  // but we continue simulating scores for all known GPCs.
  const limit = Math.min(step, SEQUENCE_LENGTH);
  
  for (let i = 1; i <= limit; i++) {
    const entry = sequenceData.sequence[i];
    if (entry && entry.gpcId) {
      // The step 'i' in the sequence is treated as the introduction day
      profile.set(entry.gpcId, simulateSRSScore(i, currentDay));
    }
  }
  
  // If we are in reinforcement phase (step > SEQUENCE_LENGTH),
  // we ensure all previously learned GPCs are still included (which the loop above handles,
  // since we cap 'limit' at SEQUENCE_LENGTH but simulate using 'currentDay').
  // Wait, if step > SEQUENCE_LENGTH, 'limit' is SEQUENCE_LENGTH.
  // The loop runs 1..SEQUENCE_LENGTH.
  // simulateSRSScore(i, currentDay) uses the actual currentDay (e.g. 250).
  // So decay/review continues correctly.
  
  // However, we must ensure we include ALL items if we are past the end.
  // The loop 'i <= limit' does that correctly.

  return profile;
}

/**
 * Get metadata for a specific step (e.g. for display)
 */
export function getStepInfo(step: number) {
  if (step === 0) {
    return {
      description: "Initial Base (s, n, i, t)",
      coverage: sequenceData.sequence[0]?.coveragePercent ?? 0
    };
  }
  
  if (step > SEQUENCE_LENGTH) {
    const lastEntry = sequenceData.sequence[SEQUENCE_LENGTH];
    const extraDays = step - SEQUENCE_LENGTH;
    return {
      description: `Reinforcement Phase (+${extraDays} days)`,
      coverage: lastEntry.coveragePercent
    };
  }
  
  const entry = sequenceData.sequence[step];
  return {
    description: `Unlocks ${entry.gpcId}`,
    coverage: entry.coveragePercent
  };
}
