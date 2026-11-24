/**
 * The rivals' identity on /learning-engine: a colour and a filled icon each,
 * used wherever a rival appears (section headings, the Wants / Argues with
 * rule, the dovetail widget's chips, pills and voice lines).
 *
 * Colours are the site's categorical palette (src/theme/categoricalPalette.ts),
 * deep tier: rival N takes slot N, deepened so a white glyph knocks out of a
 * disc (all >= 3.9:1). Slots 1–6 validated in order (deep tier), so RIVAL_ORDER (the chip row's order) on
 * on #fffef7 passes every check on adjacent pairs. All-pairs can't pass with five
 * hues, so colour is never the only identity: every mark also carries the
 * rival's icon or name.
 *
 * Lessons use the same hues in the base tier, so don't colour both sets on
 * one surface: the landing's Under the Hood technique chips stay uncoloured.
 */

import { CATEGORICAL, deepTier } from "../../theme/categoricalPalette";

export type RivalId = "curriculum" | "srs" | "interference" | "overload" | "procedural";

export interface RivalStyle {
    color: string;
    /** Filled mdi glyph, for knocking out of a coloured disc. */
    icon: string;
}

/** The validated order: rival N takes palette slot N; the dovetail chip row runs in it. */
export const RIVAL_ORDER: RivalId[] = ["curriculum", "srs", "interference", "overload", "procedural"];

const ICONS: Record<RivalId, string> = {
    curriculum: "mdi-map",
    srs: "mdi-sync",
    interference: "mdi-shield",
    overload: "mdi-trending-up",
    procedural: "mdi-puzzle",
};

export const RIVAL_STYLE = Object.fromEntries(
    RIVAL_ORDER.map((id, i) => [id, { color: deepTier(CATEGORICAL[i]), icon: ICONS[id] }]),
) as Record<RivalId, RivalStyle>;

export function isRivalId(id: string): id is RivalId {
    return id in RIVAL_STYLE;
}
