/**
 * How a deployment presents itself, in its own words: the deal it offers (the
 * landing hero's pricing line, the home page's search/preview tagline, the
 * llms.txt access notes) and how to reach whoever runs it (the footer's
 * contact address and social profiles, also the structured data's `sameAs`).
 *
 * The open build has none (no price, no word limit, nothing to say). A
 * deployment supplies `src/deployment/overlay/pitch.ts` (default export). It
 * must stay plain data: build scripts load it under Node
 * (scripts/prerender-public.ts), where the overlay's index.ts (Vue, the
 * framework) can't load. In the browser, ./index.ts picks it up.
 *
 * This file is pure (no import.meta.glob), so Node code can import it.
 */
import type { PageMeta } from "../content/pages";
import type { SocialLink } from "../content/landingPageCopy";

export interface Pitch {
    /** Appended to the home page's description, e.g. "First 1000 words free!". The whole stays under 160 characters. */
    tagline: string;
    /** The landing hero's pricing line, up to the bold part, e.g. "The first 1,000 words are free, then $20 for". */
    pricing: string;
    /** The bold end of that line, e.g. "lifetime access". */
    pricingHighlight: string;
    /** Further bullets for llms.txt's Access section, e.g. a regional free offer. */
    access?: string[];
    /** The footer's contact address. */
    contactEmail?: string;
    /** The footer's social profiles; also the home page's structured-data `sameAs`. */
    social?: SocialLink[];
}

/** The home page's meta: the site-wide one plus the deployment's tagline, if any. */
export function withPitch(home: PageMeta, pitch: Pitch | null): PageMeta {
    return pitch ? { ...home, description: `${home.description} ${pitch.tagline}` } : home;
}

/** The social profiles' URLs (structured data `sameAs`). */
export function socialUrls(pitch: Pitch | null): string[] {
    return pitch?.social?.map((s) => s.url) ?? [];
}

/** The pricing line as one sentence (llms.txt), or null without a pitch. */
export function pricingSentence(pitch: Pitch | null): string | null {
    return pitch ? `${pitch.pricing} ${pitch.pricingHighlight}.` : null;
}
