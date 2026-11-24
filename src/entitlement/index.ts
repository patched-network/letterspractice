/**
 * The active entitlement provider (see ./types.ts): the deployment's
 * (src/deployment/), or the open one.
 */
import { deployment } from "../deployment";
import { isAndroidApp } from "../services/androidApp";
import { openProvider } from "./open";
import type { EntitlementOffer, EntitlementProvider } from "./types";

export type { EntitlementOffer, EntitlementProvider } from "./types";

export const entitlement: EntitlementProvider = deployment.entitlement ?? openProvider;

/**
 * What can be bought here and now: the provider's offer, except in the Play
 * Store app, which sells nothing (services/androidApp.ts). Null hides every
 * buy button.
 */
export function sellOffer(): EntitlementOffer | null {
    return isAndroidApp() ? null : entitlement.offer;
}
