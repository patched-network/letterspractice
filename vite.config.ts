import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import dts from "vite-plugin-dts";
import { VitePWA } from "vite-plugin-pwa";
import { staticCourse } from "./scripts/vite-plugin-static-course";
import { resolve } from "path";
import { fileURLToPath, URL } from "node:url";
import { execSync } from "node:child_process";
import { mdiSubset } from "./scripts/vite-plugin-mdi-subset";
import { preloadFonts } from "./scripts/vite-plugin-preload-fonts";
import { bootAfterPaint } from "./scripts/vite-plugin-boot-after-paint";
import { fontFallbacks } from "./scripts/postcss-font-fallbacks";
import { markdownHtml } from "./scripts/vite-plugin-markdown-html";
import { deploymentCsp } from "./scripts/vite-plugin-deployment-csp";
import { siteUrlTags } from "./scripts/vite-plugin-site-url-tags";

// The app's version, stamped on every study session (the data layer's
// `appVersion`): the git commit, "-dirty" for a build with uncommitted tracked
// changes to the app.
function appVersion(): string {
  try {
    const sha = execSync("git rev-parse --short HEAD").toString().trim();
    const dirty = execSync("git status --porcelain --untracked-files=no -- .").toString().trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return "unknown";
  }
}

// Determine build mode from environment variable
const buildMode = process.env.BUILD_MODE || "webapp";

// In dev mode, relax CSP to allow direct connections to the dev CouchDB.
//
// The data layer talks to CouchDB at an absolute URL — it does NOT go through
// the /couch proxy below — so in dev that's a different origin than the page
// and needs an explicit connect-src entry. Production needs no such entry:
// there, couch is same-origin (Caddy serves it at letterspractice.com/couch/),
// so 'self' already covers it. Hence `apply: "serve"` — this relaxation must
// never reach a built index.html.
//
// The origin is derived from the same env vars the app resolves (see
// src/ENVIRONMENT_VARS.ts) rather than hardcoded, so pointing
// VITE_COUCH_BASE_URL at a LAN address for on-device testing doesn't also
// require editing the policy here. localhost stays allowed regardless, so the
// default setup is unaffected.
const DEFAULT_COUCH_ORIGIN = "http://localhost:5984";

function resolveCouchOrigin(env: Record<string, string>): string {
  const host =
    env.VITE_COUCH_BASE_URL || env.VITE_COUCHDB_SERVER || "localhost:5984/";
  const protocol = env.VITE_COUCHDB_PROTOCOL === "https" ? "https" : "http";
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return DEFAULT_COUCH_ORIGIN;
  }
}

function devCspPlugin() {
  let couchOrigins = [DEFAULT_COUCH_ORIGIN];

  return {
    name: "dev-csp",
    apply: "serve" as const,
    configResolved(config: { env: Record<string, string> }) {
      couchOrigins = [
        ...new Set([DEFAULT_COUCH_ORIGIN, resolveCouchOrigin(config.env)]),
      ];
    },
    transformIndexHtml(html: string) {
      return html.replace(
        /connect-src 'self'/,
        `connect-src 'self' ${couchOrigins.join(" ")}`
      );
    },
  };
}

// The installed app: a home-screen icon that opens full-screen at the study
// hub, plus a service worker that precaches the app shell.
//
// The worker precaches only index.html and the build's own hashed assets.
// It does NOT touch:
//   - couch / express / payments / backend: live data, always network
//   - /audio: <audio> sends Range requests, and serving those from a worker
//     cache is fragile on Safari. Caddy's 10-day Cache-Control already keeps
//     the clips in the browser cache.
//   - /blog: a separate site (Cloudflare Pages behind Caddy). Navigations
//     there must reach the network, not get the SPA's index.html.
const BACKEND_PREFIXES = /^\/(couch|express|payments|backend|auth|blog)(\/|$)/;
// The last path segment has a file extension: /print/fridge-sheet.pdf,
// /og-image.png, … Static files, never SPA routes.
const FILE_PATH = /^[^?]*\/[^/?]*\.[^/?]*(\?.*)?$/;

function pwaPlugin() {
  return VitePWA({
    registerType: "prompt", // never auto-reload; see services/pwa.ts
    injectRegister: false, // registered from main.ts
    manifest: {
      id: "/",
      name: "LettersPractice",
      // The home-screen label. U+200B (zero-width space) is an invisible
      // line-break opportunity: launchers that can't fit the name on one line
      // break it as "Letters / Practice" instead of hyphenating mid-word.
      // Only here, not in `name` (install dialogs, desktop shortcuts, search).
      short_name: "Letters​Practice",
      description: "Teach your child to read with a guided, interactive workbook.",
      lang: "en",
      start_url: "/study",
      scope: "/",
      display: "standalone",
      background_color: "#FFFEF7",
      theme_color: "#FFFEF7",
      categories: ["education", "kids"],
      icons: [
        { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    workbox: {
      globPatterns: ["index.html", "assets/**/*.{js,css,woff2}", "favicon.svg"],
      // Admin views (~0.9 MB) are for one user; everyone else would download
      // them in the background for nothing. Likewise the self-hosted fonts'
      // non-latin subsets (main.ts): a page fetches one only if its text uses
      // it, which for this app is next to never.
      globIgnores: [
        "assets/[aA]dmin*",
        ...["latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "vietnamese", "devanagari", "math", "symbols"].map(
          (subset) => `assets/*-${subset}-[0-9]*-normal-*.woff2`,
        ),
      ],
      navigateFallback: "index.html",
      navigateFallbackDenylist: [BACKEND_PREFIXES, FILE_PATH],
      cleanupOutdatedCaches: true,
      // The main chunk is ~3 MB (workbox's default cap is 2 MiB); a skipped
      // main chunk would make the precache pointless.
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      // (No runtime caching: the typefaces are self-hosted assets now,
      // precached above, where they used to be Google Fonts requests.)
    },
  });
}

export default defineConfig({
  plugins: [
    vue(),
    // `*.md?html`: markdown rendered at build time, so the app ships no
    // markdown parser (the changelog updates): scripts/vite-plugin-markdown-html.ts.
    markdownHtml(),
    devCspPlugin(),
    // The deployment's CSP sources (media host, payment provider):
    // scripts/vite-plugin-deployment-csp.ts.
    deploymentCsp(),
    siteUrlTags(),
    // A CouchDB build doesn't ship the packed static course:
    // scripts/vite-plugin-static-course.ts.
    staticCourse(),
    // Production builds ship only the icons the app names (~225 of ~7,400),
    // not @mdi/font's full stylesheet: scripts/vite-plugin-mdi-subset.ts.
    ...(buildMode === "webapp" ? [mdiSubset(__dirname)] : []),
    // <link rel="preload"> for the faces the landing page's first screen
    // uses: its headline (Poppins 700), body (Roboto 400, 700) and the app
    // bar's buttons (Roboto 500). scripts/vite-plugin-preload-fonts.ts; main.ts
    // loads the same faces before mount (FIRST_SCREEN_FACES), keep in step.
    // Also the icon font (the subset, 13 KB): the static hero's CTA buttons
    // carry icons, and unpreloaded it was found only after the stylesheet had
    // been parsed and the page laid out (~0.9 s on lighthouse-metrics' US West).
    ...(buildMode === "webapp"
      ? [
          preloadFonts([
            /roboto-latin-400-normal-/,
            /roboto-latin-500-normal-/,
            /roboto-latin-700-normal-/,
            /poppins-latin-700-normal-/,
            /materialdesignicons-/,
          ]),
          // The entry script starts after the first paint, so the
          // prerendered hero never waits for the app's evaluation:
          // scripts/vite-plugin-boot-after-paint.ts.
          bootAfterPaint(),
        ]
      : []),
    // PWA: web manifest + service worker, for the webapp build only.
    // Registration and the update policy live in src/services/pwa.ts.
    ...(buildMode === "webapp" && !process.env.VITEST ? [pwaPlugin()] : []),
    // Only include dts plugin for library builds
    ...(buildMode === "library"
      ? [
          dts({
            insertTypesEntry: true,
            include: ["src/questions/**/*.ts", "src/questions/**/*.vue"],
            exclude: ["**/*.spec.ts", "**/*.test.ts"],
            outDir: "dist-lib",
          }),
        ]
      : []),
  ],
  css: {
    postcss: {
      // "Roboto Fallback" / "Poppins Fallback" after Roboto / Poppins in every
      // font-family stack, so the font swap doesn't move text:
      // scripts/postcss-font-fallbacks.ts, src/theme/fontFallbacks.css.
      plugins: [fontFallbacks()],
    },
  },
  resolve: {
    // Array form: the `vue` entry needs an exact match (an object key would
    // also catch `vue/dist/...`, its own replacement included).
    alias: [
      // Alias for internal src paths
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      // Add events alias if needed (often required by dependencies)
      { find: "events", replacement: "events" },
      // Bare `vue` → the runtime-only ESM build, which is what ESM imports of
      // `vue` resolve to anyway. CommonJS `require("vue")` (vuedraggable's UMD
      // build; since 0.2.36 it arrives only via common-ui's TagsInput, through
      // vue-tags-input, off the boot path) otherwise resolves to vue.cjs.prod.js, the full
      // build, shipping Vue's template compiler (~100 KB) that nothing uses:
      // no component here compiles templates at runtime.
      ...(process.env.VITEST
        ? []
        : [{ find: /^vue$/, replacement: "vue/dist/vue.runtime.esm-bundler.js" }]),
      // In tests, stub the courseware barrel to avoid pulling in all course
      // types (math → paper.js → navigator crash in node environment)
      ...(process.env.VITEST
        ? [
            {
              find: "@vue-skuilder/courseware",
              replacement: resolve(__dirname, "src/test-stubs/courseware.ts"),
            },
          ]
        : []),
    ],
    extensions: [".js", ".ts", ".json", ".vue"],
    dedupe: [
      // Ensure single instances of core libs and published packages
      "vue",
      "vuetify",
      "pinia",
      "vue-router",
      "@vue-skuilder/db",
      "@vue-skuilder/common",
      "@vue-skuilder/common-ui",
      "@vue-skuilder/courseware",
    ],
  },
  // --- Dependencies optimization ---
  optimizeDeps: {
    include: ["events", "vuedraggable"],
  },
  server: {
    port: 5173, // Use standard Vite port for standalone projects
    // android/ is the Play Store app's Gradle project: thousands of generated
    // files, none of them the web app's.
    watch: { ignored: ["**/android/**"] },
    proxy: {
      // Business backend (payments + mailer)
      "/payments": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/backend": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/backend/, ''),
      },
      // Express app (auth, logs, etc.)
      "/auth": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/express": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/express/, ''),
      },
      "/couch": {
        target: "http://localhost:5984",
        changeOrigin: true,
      },
    },
  },
  build:
    buildMode === "library"
      ? {
          // Library build configuration
          sourcemap: true,
          target: "es2020",
          minify: "terser",
          terserOptions: {
            keep_classnames: true,
          },
          lib: {
            entry: resolve(__dirname, "src/questions/index.ts"),
            name: "VueSkuilderStandaloneQuestions",
            fileName: (format) =>
              `questions.${format === "es" ? "mjs" : "cjs.js"}`,
          },
          rollupOptions: {
            // External packages that shouldn't be bundled in library mode
            // For studio integration, we bundle vue-skuilder packages to avoid npm resolution issues
            external: [
              // Bundle everything for studio integration - no externals
            ],
            output: {
              // Global variables for UMD build
              globals: {
                vue: "Vue",
                "vue-router": "VueRouter",
                vuetify: "Vuetify",
                pinia: "Pinia",
                // Remove globals for bundled packages
                // '@vue-skuilder/common': 'VueSkuilderCommon',
                // '@vue-skuilder/common-ui': 'VueSkuilderCommonUI',
                // '@vue-skuilder/courseware': 'VueSkuilderCourseWare',
                // '@vue-skuilder/db': 'VueSkuilderDB',
              },
              exports: "named",
              // Preserve CSS in the output bundle
              assetFileNames: "assets/[name].[ext]",
            },
          },
          // Output to separate directory for library build
          outDir: "dist-lib",
          // Allow CSS code splitting for component libraries
          cssCodeSplit: true,
        }
      : {
          // Webapp build configuration (existing)
          sourcemap: true,
          target: "es2020",
          minify: "terser",
          terserOptions: {
            keep_classnames: true,
          },
          // Standard webapp output directory
          outDir: "dist",
          // Never inline a font into CSS as base64: the self-hosted fonts'
          // rarely-used subsets are under Vite's 4 KB default, and inlined
          // they'd sit in the render-blocking stylesheet for every visitor.
          // As files, a page fetches one only if its text needs it.
          assetsInlineLimit: (file: string) => (/\.(woff2?|ttf|eot|otf)$/.test(file) ? false : undefined),
        },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/vite-plugin-*.test.ts"],

    css: false,
    server: {
      deps: {
        // Force packages that import CSS through Vite's transform pipeline
        // so css:false can stub them (Node ESM can't handle .css natively)
        inline: [/@vojtechlanka/, /@vue-skuilder/],
      },
    },
  },
  // Add define block for process polyfills
  define: {
    global: "window",
    // Note: process.env removed to allow Vite's .env file handling
    "process.browser": true,
    "process.version": JSON.stringify(process.version),
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
});
