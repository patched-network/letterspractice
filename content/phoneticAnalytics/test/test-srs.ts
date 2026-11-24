import { strict as assert } from 'assert';
import { 
  SRS_TIERS, 
  SRSSkillState, 
  getMasteryScore, 
  reviewSkill, 
  learnSkill 
} from '../lib/srs';

// Minimal Test Runner Shim
function describe(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}
function it(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    console.error(`  ✗ ${name}`);
    console.error(e.message);
    process.exit(1);
  }
}

const EPSILON = 0.01;

function almostEqual(a: number, b: number, msg?: string) {
  if (Math.abs(a - b) > EPSILON) {
    throw new Error(`${msg}: ${a} is not approximately ${b}`);
  }
}

describe('SRS Forgetting Curve Model', () => {
  
  it('Tier 0: Starts at 0.75 and decays to 0.40 in 5 days', () => {
    const day0 = 0;
    const state = learnSkill(day0);
    
    // Day 0: Immediate Peak
    const score0 = getMasteryScore(state, day0);
    almostEqual(score0, 0.75, 'Tier 0 peak should be 0.75');

    // Day 5: Decay to Threshold
    const score5 = getMasteryScore(state, 5);
    almostEqual(score5, 0.40, 'Tier 0 day 5 should be ~0.40');

    // Day 10: Further decay (asymptotic to Base 0.1)
    const score10 = getMasteryScore(state, 10);
    assert(score10 < 0.40, 'Should decay further');
    assert(score10 > 0.10, 'Should stay above base');
  });

  it('Tier 1: Review bumps to 0.85 and decays to 0.45 in 8 days', () => {
    let time = 5; // Reviewed at day 5
    let state = learnSkill(0);
    state = reviewSkill(state, time);

    assert.equal(state.tier, 1, 'Should be in Tier 1');
    assert.equal(state.lastReviewTime, 5, 'Review time updated');

    // Immediate post-review
    const peak = getMasteryScore(state, time);
    almostEqual(peak, 0.85, 'Tier 1 peak should be 0.85');

    // Decay duration (8 days later = day 13)
    const threshold = getMasteryScore(state, time + 8);
    almostEqual(threshold, 0.45, 'Tier 1 day 8 should be ~0.45');
  });

  it('Tier 2: Review bumps to 0.90 and decays to 0.50 in 14 days', () => {
    let time = 13;
    let state: SRSSkillState = { tier: 1, lastReviewTime: 5 };
    state = reviewSkill(state, time);

    assert.equal(state.tier, 2, 'Should be in Tier 2');

    // Immediate post-review
    const peak = getMasteryScore(state, time);
    almostEqual(peak, 0.90, 'Tier 2 peak should be 0.90');

    // Decay duration (14 days later = day 27)
    const threshold = getMasteryScore(state, time + 14);
    almostEqual(threshold, 0.50, 'Tier 2 day 14 should be ~0.50');
  });

  it('Clamps scores between 0 and 1', () => {
    const state = learnSkill(0);
    const massiveTime = 99999;
    const score = getMasteryScore(state, massiveTime);
    assert(score >= 0.1, 'Should not drop below base (0.1)'); // Formula converges to base
    assert(score <= 1.0, 'Should not exceed 1.0');
  });

});
