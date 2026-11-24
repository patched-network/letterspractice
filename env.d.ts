/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

/** The git commit this build came from (vite.config.ts `appVersion`). */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /**
   * The site's public origin, e.g. https://example.com (no trailing slash).
   * Canonical links, og:url, sitemap.xml and the changelog feed are built
   * from it (services/pageMeta.ts, scripts/prerender-public.ts). Unset: those
   * are skipped. Supplied by the deploy's .env.production.
   */
  readonly VITE_SITE_URL?: string
  /** Support address on auth error screens (config/site.ts). Unset: no contact line. */
  readonly VITE_SUPPORT_EMAIL?: string
}

// Vue module declarations
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// Vuetify module declarations
declare module 'vuetify'
declare module 'vuetify/components'
declare module 'vuetify/directives'
