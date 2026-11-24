/**
 * Registers the Vuetify components the landing page doesn't render
 * (vuetifyDeferredComponents.ts) when first needed, instead of at boot.
 *
 * They're globally registered, like the rest, because the framework's
 * prebuilt components (common-ui, courseware) resolve Vuetify components by
 * name at runtime. Global registration still works after mount: it applies to
 * whatever renders next. So:
 *
 * - the router awaits this before every route but the landing page
 *   (router/index.ts), so no view renders before its components exist;
 * - the landing page starts it on the visitor's first interaction
 *   (LandingPage.vue), like the course machinery (courseware.ts).
 *
 * main.ts binds the app before installing the router, whose first navigation
 * may already need this.
 */
import type { App } from "vue";

let app: App | null = null;
let ready: Promise<void> | null = null;

export function bindDeferredVuetify(target: App): void {
  app = target;
}

export function ensureDeferredVuetify(): Promise<void> {
  ready ??= import("./vuetifyDeferredComponents")
    .then(({ deferredComponents }) => {
      if (!app) throw new Error("[vuetifyDeferred] no app bound (bindDeferredVuetify in main.ts)");
      for (const [name, component] of Object.entries(deferredComponents)) {
        if (!app.component(name)) app.component(name, component);
      }
    })
    .catch((err) => {
      ready = null; // a later navigation tries again
      throw err;
    });
  return ready;
}
