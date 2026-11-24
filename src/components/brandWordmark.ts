/**
 * The "Letters Practice" wordmark treatment, shared by the app-shell header
 * (CourseHeader) and the marketing footer (LandingFooter) so the two can't
 * drift: brand colours plus a subtle jiggle, letters drawn without faces.
 */
import type { WordOptions } from "../letterpeople/Word";
import {
    createJiggleTransform,
    composeTransforms,
    BRAND_COLOR_TRANSFORM,
} from "../letterpeople/transforms";

/**
 * Lettermark options. Arms start hidden but carry a colour, because the header
 * shows one arm later so the P can wave.
 */
export function brandWordmarkOptions(spacing = 2): WordOptions {
    return {
        spacing,
        letterOptions: {
            lineWidth: 22,
            borderWidth: 0,
            showEyes: false,
            showArms: false,
            showMouth: false,
            armColor: "black",
        },
    };
}

/** Brand colours, then the jiggle. The jiggle keeps no state between calls, so one instance can be shared. */
export const brandWordmarkTransform = composeTransforms(
    BRAND_COLOR_TRANSFORM,
    createJiggleTransform({
        intensity: 3,
        rotationRange: 13,
        duration: 2800,
        ease: "outElastic(1, .8)",
        stagger: 20,
    }),
);
