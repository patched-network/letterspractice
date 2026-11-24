/**
 * Poster configuration types and presets.
 *
 * A Poster is an 8.5x11 print-ready flyer with a hero greeting, body copy,
 * a CTA QR code, and a row of tear-off slips along the bottom. Each variant
 * targets a specific community or distribution channel.
 */

export interface PosterConfig {
  /** Short slug appended to letterspractice.com — also encoded in QR codes. */
  slug: string;

  /** Main headline (large, top of poster body). */
  headline: string;

  /** Sub-headline beneath the LetterPeople hero. */
  subhead: string;

  /** ~50 word descriptive paragraph. */
  body: string;

  /** Three short trust/positioning bullets. */
  bullets: string[];

  /** Big call-to-action line, sits next to the main QR. */
  cta: string;

  /** Whether to render the tear-off strip along the bottom. */
  tearStripEnabled: boolean;

  /** Number of slips in the tear-off strip. */
  slipCount: number;

  /** Text shown at the top of each tear-off slip. */
  slipHeading: string;

  /** Region label printed on the poster (e.g. "Free for PEI families"). */
  regionBadge?: string;
}

const BASE_URL = "letterspractice.com";

export const fullUrl = (slug: string): string => {
  const clean = slug.replace(/^\/+/, "");
  return clean ? `${BASE_URL}/${clean}` : BASE_URL;
};

export const PEI_POSTER: PosterConfig = {
  slug: "pei",
  headline: "Let's do our letters practice.",
  subhead: "Friendly letters help your child learn to read.",
  body: "An early-literacy app for ages 2 to 5, in 2 to 5 minutes a day. Animated letter characters guide each tiny lesson while you watch alongside. Made on Prince Edward Island by a family of readers — free, forever, for Island families.",
  bullets: [
    "Made on PEI — free forever for Islanders",
    "No ads, no tracking, no subscriptions",
    "Learning-science backed; built with care",
  ],
  cta: "Try it free →",
  tearStripEnabled: true,
  slipCount: 8,
  slipHeading: "letters practice",
  regionBadge: "Free for PEI families",
};

export const DEFAULT_POSTER: PosterConfig = {
  slug: "",
  headline: "Let's do our letters practice.",
  subhead: "Friendly letters help your child learn to read.",
  body: "An early-literacy app for ages 2 to 5, in 2 to 5 minutes a day. Animated letter characters guide each tiny lesson while you watch alongside.",
  bullets: [
    "First 1,000 words free, then $20 for lifetime access",
    "No ads, no tracking, no subscriptions",
    "Learning-science backed; built by a family",
  ],
  cta: "Try it free →",
  tearStripEnabled: true,
  slipCount: 8,
  slipHeading: "letters practice",
};
