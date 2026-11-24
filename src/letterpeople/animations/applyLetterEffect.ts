/**
 * Shared dispatcher mapping a LetterEffect (or array of effects) onto a
 * LetterInstance. Used by both PhoneticWord (chunk-driven playback) and the
 * lesson runner's word-step pulse handler so the two stay in lockstep.
 *
 * Effect catalog mirrors `LetterEffect` in useTimedWordPlayback.ts.
 */

import type { LetterEffect } from '../../composables/useTimedWordPlayback';
import type { AnimationParams, LetterInstance } from '../types';

export async function applyLetterEffect(
  letter: LetterInstance,
  effect: LetterEffect | LetterEffect[],
  animationParams?: AnimationParams,
): Promise<void> {
  const effects = Array.isArray(effect) ? effect : [effect];

  await Promise.all(
    effects.map(async (e) => {
      switch (e) {
        case 'speak': {
          if (letter.mouth?.isVisible()) {
            await letter.mouth.animateSpeak(animationParams);
          } else {
            await letter.mouth?.show({ duration: 100 });
            await letter.mouth?.animateSpeak(animationParams);
            await letter.mouth?.hide({ duration: 100 });
          }
          return;
        }

        case 'highlight': {
          const original =
            letter.svgElement.style.getPropertyValue('--letter-color') ||
            'currentColor';
          await letter.updateAppearance(
            { color: '#ffeb3b' },
            { duration: 150, ...animationParams },
          );
          await new Promise((r) => setTimeout(r, 300));
          await letter.updateAppearance({ color: original }, { duration: 150 });
          return;
        }

        case 'bounce': {
          const svg = letter.svgElement as SVGElement & {
            style: CSSStyleDeclaration;
          };
          svg.style.transition = 'transform 150ms ease-out';
          svg.style.transform = 'translateY(-10px)';
          await new Promise((r) => setTimeout(r, 150));
          svg.style.transform = 'translateY(0)';
          await new Promise((r) => setTimeout(r, 150));
          svg.style.transition = '';
          return;
        }

        case 'glow': {
          const svg = letter.svgElement as SVGElement & {
            style: CSSStyleDeclaration;
          };
          svg.style.filter = 'drop-shadow(0 0 8px gold)';
          await new Promise((r) => setTimeout(r, 400));
          svg.style.filter = '';
          return;
        }

        case 'silent-e': {
          const svg = letter.svgElement as SVGElement & {
            style: CSSStyleDeclaration;
          };
          svg.style.transition = 'opacity 200ms ease-out';
          svg.style.opacity = '0.6';
          await new Promise((r) => setTimeout(r, 300));
          svg.style.opacity = '1';
          await new Promise((r) => setTimeout(r, 200));
          svg.style.transition = '';
          return;
        }

        case 'r-control':
        case 'l-control': {
          const svg = letter.svgElement as SVGElement & {
            style: CSSStyleDeclaration;
          };
          svg.style.transition =
            'filter 200ms ease-out, opacity 200ms ease-out';
          svg.style.filter = 'drop-shadow(0 3px 0 currentColor)';
          svg.style.opacity = '0.6';
          await new Promise((r) => setTimeout(r, 400));
          svg.style.filter = '';
          svg.style.opacity = '1';
          await new Promise((r) => setTimeout(r, 200));
          svg.style.transition = '';
          return;
        }
      }
    }),
  );
}
