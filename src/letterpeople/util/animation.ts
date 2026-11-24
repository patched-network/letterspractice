import { animate } from "animejs";

/** Promise-based delay */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wraps anime.js animate() in a Promise */
export function animatePromise(
  target: Element | Element[],
  props: Record<string, any>
): Promise<void> {
  return new Promise((resolve) => {
    animate(target, {
      ...props,
      onComplete: () => resolve(),
    });
  });
}
