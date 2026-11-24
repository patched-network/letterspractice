import { onBeforeUnmount, onMounted, type Ref } from 'vue';
import { landingEvent, track } from '../services/landingEvents';

/**
 * Wires landing-page events onto a root element (see services/landingEvents.ts):
 *
 * - `seen:<section>`: once per page load, when a `[data-track-seen]` element is
 *   meaningfully on screen (35% of the viewport or of the section, whichever is
 *   smaller, since tall sections never reach a fixed ratio of themselves).
 * - `cta:<id>`: clicks inside a `[data-track]` element (the attribute holds the
 *   full event name).
 * - `link:<target>`: clicks on any other link, so new links are covered without
 *   instrumenting them.
 * - `signup-submit`: form submits bubbling up from the email signup.
 *
 * Delegated listeners on the root, so components only carry data attributes.
 */
export function useLandingTracking(root: Ref<HTMLElement | null>) {
  const seen = new Set<string>();
  let observer: IntersectionObserver | null = null;

  const onIntersect = (entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      const section = el.dataset.trackSeen;
      if (!section || seen.has(section) || !entry.isIntersecting) continue;
      const needed = 0.35 * Math.min(entry.boundingClientRect.height, window.innerHeight);
      if (entry.intersectionRect.height < needed) continue;
      seen.add(section);
      track(`seen:${section}`);
      observer?.unobserve(el);
    }
  };

  const linkTarget = (a: HTMLAnchorElement): string | null => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#')) return null;
    if (href.startsWith('mailto:')) return 'mailto';
    try {
      const url = new URL(href, window.location.origin);
      return url.origin === window.location.origin ? url.pathname : url.hostname;
    } catch {
      return null;
    }
  };

  const onClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    const tagged = target?.closest<HTMLElement>('[data-track]');
    if (tagged?.dataset.track) {
      track(tagged.dataset.track);
      return;
    }
    const a = target?.closest<HTMLAnchorElement>('a[href]');
    const t = a && linkTarget(a);
    if (t) track(landingEvent.link(t));
  };

  const onSubmit = () => track(landingEvent.signupSubmit);

  onMounted(() => {
    const el = root.value;
    if (!el) return;
    el.addEventListener('click', onClick);
    el.addEventListener('submit', onSubmit);
    if ('IntersectionObserver' in window) {
      const thresholds = Array.from({ length: 21 }, (_, i) => i / 20);
      observer = new IntersectionObserver(onIntersect, { threshold: thresholds });
      el.querySelectorAll('[data-track-seen]').forEach((s) => observer!.observe(s));
    }
  });

  onBeforeUnmount(() => {
    root.value?.removeEventListener('click', onClick);
    root.value?.removeEventListener('submit', onSubmit);
    observer?.disconnect();
  });
}
