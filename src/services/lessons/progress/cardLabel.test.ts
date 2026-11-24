/**
 * Run with: npx vitest run src/services/lessons/progress/cardLabel.test.ts
 */
import { describe, it, expect } from 'vitest';
import { wordFromCardId, labelForCardId } from './cardLabel';

describe('wordFromCardId', () => {
  it('reads the word out of missing-letters, word-selection and spelling ids', () => {
    expect(wordFromCardId('c-ml-worth-3')).toBe('worth');
    expect(wordFromCardId('c-ml-she-0,1')).toBe('she');
    expect(wordFromCardId('c-ws-ship-a1b2c3')).toBe('ship');
    expect(wordFromCardId('c-spelling-cat')).toBe('cat');
  });
  it('returns null for sound cards and unknown ids', () => {
    expect(wordFromCardId('c-wst-sh-SH')).toBeNull();
    expect(wordFromCardId('c-intro-s-S')).toBeNull();
    expect(wordFromCardId('something-else')).toBeNull();
  });
});

describe('labelForCardId', () => {
  it('prefers the word, then a sound label, then the raw id', () => {
    expect(labelForCardId('c-ml-worth-3')).toBe('worth');
    expect(labelForCardId('c-wst-sh-SH')).toBe("'sh' sound");
    expect(labelForCardId('c-wst-fg-group1-b')).toBe("'b' sound");
    expect(labelForCardId('mystery')).toBe('mystery');
  });
});
