import type { Component } from "vue";
import type { RouteRecordRaw } from "vue-router";
import type { EntitlementProvider } from "../entitlement/types";
import type { AdminPanel } from "../views/admin/adminPanels";

/**
 * What a deployment adds to the open app: the default export of
 * `src/deployment/overlay/index.ts` (see ./index.ts). Every field is
 * optional; the open build is `{}`.
 *
 * Browser-side only: this file may pull in Vue, views and the framework. Data
 * that build scripts need under Node lives in the overlay's plain-data files
 * (pitch.ts, pages.ts, csp.json).
 */
export interface Deployment {
    /** Paid access (../entitlement/types.ts). Without one, everything is open and nothing is for sale. */
    entitlement?: EntitlementProvider;
    /** Top-level routes, e.g. checkout, payment return, gifting, legal pages. */
    routes?: RouteRecordRaw[];
    /** Children of /admin (paths relative to it, e.g. "users"). */
    adminRoutes?: RouteRecordRaw[];
    /** Links on the admin index and nav bar, after the app's own (../views/admin/adminPanels.ts). */
    adminPanels?: AdminPanel[];
    /** Rendered at the top of the admin index, e.g. alarms. No props. */
    adminWidgets?: Component[];
}
