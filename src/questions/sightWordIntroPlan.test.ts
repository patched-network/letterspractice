/**
 * planSightWordIntro — which steps misbehave, who minds, where silent letters go.
 * Over the real phonetic index (recorded sight words).
 *
 * Run with: npx vitest run src/questions/sightWordIntroPlan.test.ts
 */

import { describe, it, expect } from 'vitest';
import { getPhonetics } from '../services/phonetics';
import { planSightWordIntro } from './sightWordIntroPlan';

function plan(word: string) {
  const p = getPhonetics(word);
  if (!p) throw new Error(`no phonetics for "${word}"`);
  return planSightWordIntro(word, p.chunks);
}

describe('planSightWordIntro', () => {
  it('was: a misbehaves; w and s mind', () => {
    const p = plan('was');
    expect(p.steps).toHaveLength(3);
    expect(p.culprits).toEqual([[], [1], []]);
    expect(p.minders).toEqual([0, 2]);
  });

  it('said: ai misbehaves together', () => {
    const p = plan('said');
    expect(p.culprits).toEqual([[], [1, 2], []]);
    expect(p.minders).toEqual([0, 3]);
  });

  it("have: the a misbehaves on its own step (the e should make it long); the e hushes on a step of its own", () => {
    const p = plan('have');
    expect(p.steps).toHaveLength(4);
    expect(p.steps[2].letters).toEqual({ 2: 'speak' });
    expect(p.steps[3]).toEqual({ letters: { 3: 'silent-e' }, label: 'e' });
    expect(p.culprits).toEqual([[], [1], [], []]);
    expect(p.minders).toEqual([0, 2, 3]);
  });

  it('live: as have, the i ignores the e', () => {
    const p = plan('live');
    expect(p.culprits).toEqual([[], [1], [], []]);
    expect(p.minders).toEqual([0, 2, 3]);
  });

  it('are: a misbehaves on its own step, and the e just hushes', () => {
    const p = plan('are');
    expect(p.steps.map((s) => s.phoneme)).toEqual(['AA', 'R', undefined]);
    expect(p.culprits).toEqual([[0], [], []]);
    expect(p.minders).toEqual([1, 2]);
  });

  it('a silent letter that is no final e misbehaves itself, on a step before the next sound', () => {
    // two, as "t|o" with the w silent
    const p = planSightWordIntro('two', [
      { letters: { 0: 'speak' }, phoneme: 'T', gpcId: 'GPC-t-T' },
      { letters: { 2: 'speak' }, phoneme: 'UW', gpcId: 'GPC-WORD-two' },
    ]);
    expect(p.steps.map((s) => Object.keys(s.letters).join())).toEqual(['0', '1', '2']);
    expect(p.culprits).toEqual([[], [1], [2]]);
    expect(p.soundedAfter).toEqual([1, 2, 3]);
  });

  it("would: d keeps its usual sound, so it minds (though it carries the word's GPC)", () => {
    const p = plan('would');
    expect(p.culprits.at(-1)).toEqual([]);
    expect(p.minders).toEqual([0, 4]);
  });

  it('friend: only ie misbehaves', () => {
    const p = plan('friend');
    expect(p.culprits.flat()).toEqual([2, 3]);
    expect(p.minders).toEqual([0, 1, 4, 5]);
  });

  it('of, who: nobody left to mind (an onlooker reacts)', () => {
    for (const w of ['of', 'who']) expect(plan(w).minders, w).toEqual([]);
  });

  it("one: o misbehaves twice (/w/, /ʌ/), the e hushes on its own step, and n and e mind", () => {
    const p = plan('one');
    expect(p.steps.map((s) => s.letters)).toEqual([{ 0: 'speak' }, { 0: 'speak' }, { 1: 'speak' }, { 2: 'silent-e' }]);
    expect(p.culprits).toEqual([[0], [0], [], []]);
    expect(p.minders).toEqual([1, 2]);
  });

  it('every recorded sight word: a step per phoneme, every letter in a step, and somebody misbehaves', () => {
    for (const w of ['the', 'of', 'you', 'was', 'are', 'do', 'does', 'have', 'live', 'said', 'who', 'one', 'two', 'would', 'could', 'should', 'friend']) {
      const p = getPhonetics(w)!;
      const { steps, culprits } = planSightWordIntro(w, p.chunks);
      expect(steps.filter((s) => s.phoneme), w).toHaveLength(p.phonemes.length);
      expect(new Set(steps.flatMap((s) => Object.keys(s.letters).map(Number))).size, w).toBe(w.length);
      expect(culprits.flat().length, w).toBeGreaterThan(0);
    }
  });

  describe('soundedAfter (typed in spelling order)', () => {
    it('was: a sound per letter', () => {
      expect(plan('was').soundedAfter).toEqual([1, 2, 3]);
    });

    it('does: oe sounds /ʌ/, then s its own /z/ (and minds, with d)', () => {
      const p = plan('does');
      expect(p.soundedAfter).toEqual([1, 1, 2, 3]);
      expect(p.culprits).toEqual([[], [1, 2], []]);
      expect(p.minders).toEqual([0, 3]);
    });

    it('of: o sounds /ʌ/, f its /v/', () => {
      expect(plan('of').soundedAfter).toEqual([1, 2]);
    });

    it('one: o sounds /w/ and /ʌ/, n its /n/, and the e hushes', () => {
      expect(plan('one').soundedAfter).toEqual([2, 3, 4]);
    });

    it('are: a sounds /ɑ/ (as in car), r its /r/, and the e hushes', () => {
      expect(plan('are').soundedAfter).toEqual([1, 2, 3]);
    });

    it('have: a step per letter, the e hushing', () => {
      expect(plan('have').soundedAfter).toEqual([1, 2, 3, 4]);
    });

    it('every recorded sight word: never goes back, and every step has sounded by the last letter', () => {
      for (const w of ['the', 'of', 'you', 'was', 'are', 'do', 'does', 'have', 'live', 'said', 'who', 'one', 'two', 'would', 'could', 'should', 'friend']) {
        const { steps, soundedAfter } = plan(w);
        expect(soundedAfter, w).toHaveLength(w.length);
        soundedAfter.forEach((n, i) => expect(n, `${w}[${i}]`).toBeGreaterThanOrEqual(soundedAfter[i - 1] ?? 0));
        expect(soundedAfter.at(-1), w).toBe(steps.length);
      }
    });
  });
});
