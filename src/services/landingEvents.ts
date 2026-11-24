/**
 * Landing-page events, recorded as GoatCounter events (cookieless; counts only,
 * never linked to a visitor or a session). Written by the landing page
 * (useLandingTracking, SessionVideoSection) and read back by the deployment's landing-insights admin view, if any.
 *
 * The names are an API. GoatCounter keys its history by them, so renaming one
 * splits the series. Add names; don't rename them.
 *
 * GoatCounter's count.js ignores localhost, so dev sessions record nothing.
 */

/**
 * Section ids, carried as `data-track-seen` on each landing section's root
 * (the hero's own; the later sections' DeferredSection wrapper).
 */
export const LANDING_SECTIONS = [
  'hero',
  'under-the-hood',
  'video',
  'walkthrough',
  'mission',
  'footer',
] as const;
export type LandingSection = (typeof LANDING_SECTIONS)[number];

/** Primary calls to action, carried as `data-track="cta:<id>"`. */
export const LANDING_CTAS = [
  'hero-peek', // anonymous: "try a sample" → /peek
  'hero-study', // anonymous: "start learning" → /study
  'hero-resume', // logged in: resume → /study
  'hero-sample', // logged in: sample → /peek
  'fridge-sheet',
  'exercises',
  'curriculum',
  'learning-engine',
] as const;
export type LandingCta = (typeof LANDING_CTAS)[number];

export const VIDEO_QUARTILES = [25, 50, 75, 100] as const;
export type VideoQuartile = (typeof VIDEO_QUARTILES)[number];

export const landingEvent = {
  seen: (s: LandingSection) => `seen:${s}`,
  cta: (c: LandingCta) => `cta:${c}`,
  /** Fallback for links without an explicit cta: same-origin path, host, or `mailto`. */
  link: (target: string) => `link:${target}`,
  videoPlay: 'video-play',
  /** 25/50/75 fire when playback first reaches that point (seeking counts); 100 on `ended`. */
  videoQuartile: (q: VideoQuartile) => `video-${q}`,
  /** Any submit of the landing page's email form, valid or not. */
  signupSubmit: 'signup-submit',
} as const;

type GoatCounter = {
  count?: (vars: { path: string; title?: string; event?: boolean }) => void;
};

/** Record one event. No-op when GoatCounter isn't loaded (blocked, self-hosted without it). */
export function track(name: string): void {
  // count.js ignores localhost, so this is the only way to see events in dev.
  if (import.meta.env.DEV) console.debug('[track]', name);
  const gc = (window as unknown as { goatcounter?: GoatCounter }).goatcounter;
  gc?.count?.({ path: name, title: name, event: true });
}
