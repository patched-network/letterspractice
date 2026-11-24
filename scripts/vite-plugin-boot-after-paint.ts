/**
 * Start the app only after the page has painted.
 *
 * The landing page's hero paints from the prerendered HTML (index.html,
 * [data-prerender-show]); the app replaces it at mount. That only pays if the
 * browser paints the HTML before the entry script runs. A module script that
 * has arrived by the time the stylesheet has can run first, and evaluating the
 * entry chunk (the framework, PouchDB, Vuetify, ...) is seconds of main thread
 * on a phone, so the first paint waits for all of it. Lighthouse then also
 * counts the script's download and evaluation against FCP and LCP: on
 * lighthouse-metrics.com, three of six regions measured FCP ~3.8 s against
 * the lab's 0.9 s (a.2.tracking.md, PR #13).
 *
 * So the build replaces Vite's `<script type="module" src=entry>` with:
 *  - `<link rel="modulepreload" fetchpriority="low">` for the entry: its
 *    download starts with the HTML, as before, but yields to the stylesheet
 *    and the preloaded fonts. A modulepreload fetches and compiles; it doesn't
 *    run anything.
 *  - an inline script that, once the document is parsed and the browser has
 *    reported its first contentful paint, adds the module script. The
 *    preloaded module is reused, not fetched again. Waiting for the report
 *    rather than a frame (requestAnimationFrame, then a task) matters:
 *    Chromium times the paint at presentation, which can come a few ms after
 *    that task, and Lighthouse compares the script's start with that time
 *    (scripts/perf/paint-before-boot.ts caught it). A frame is the fallback
 *    where Paint Timing isn't supported.
 *
 * Only a page that shows part of its static copy ([data-prerendered="show"]:
 * the landing page) has anything to paint before the app; every other page
 * starts at once, as does a hidden tab (it paints nothing). A fallback timer
 * starts the app regardless if no paint is reported.
 *
 * The low priority costs the other pages little: the entry is by far the
 * largest file, so it finishes last either way.
 *
 * Build only (dev loads /src/main.ts as usual). The prerender templates its
 * pages from the built index.html, so they carry this too. Fails the build if
 * the entry script tag isn't found exactly once.
 */
import type { Plugin } from "vite";

const ENTRY_TAG = /<script type="module" crossorigin src="(\/assets\/[^"]+\.js)"><\/script>/g;

/** If no frame arrives in this long, start anyway. */
const FALLBACK_MS = 3000;

export function bootAfterPaint(): Plugin {
  return {
    name: "boot-after-paint",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const tags = [...html.matchAll(ENTRY_TAG)];
        if (tags.length !== 1) {
          throw new Error(`[boot-after-paint] expected one entry <script type="module" crossorigin src>, found ${tags.length}`);
        }
        const src = tags[0][1];
        const loader =
          `<link rel="modulepreload" crossorigin href="${src}" fetchpriority="low">\n` +
          `    <script>\n` +
          `      // Start the app after the first paint: scripts/vite-plugin-boot-after-paint.ts\n` +
          `      (function () {\n` +
          `        var started = false;\n` +
          `        function start() {\n` +
          `          if (started) return;\n` +
          `          started = true;\n` +
          `          var s = document.createElement("script");\n` +
          `          s.type = "module";\n` +
          `          s.crossOrigin = "";\n` +
          `          s.src = ${JSON.stringify(src)};\n` +
          `          document.head.appendChild(s);\n` +
          `        }\n` +
          `        function afterPaint() {\n` +
          `          if (document.visibilityState === "hidden") return start();\n` +
          `          if (!document.querySelector('[data-prerendered="show"]')) return start();\n` +
          `          setTimeout(start, ${FALLBACK_MS});\n` +
          `          try {\n` +
          `            if (PerformanceObserver.supportedEntryTypes.indexOf("paint") >= 0) {\n` +
          `              new PerformanceObserver(function (list, observer) {\n` +
          `                if (!list.getEntriesByName("first-contentful-paint").length) return;\n` +
          `                observer.disconnect();\n` +
          `                start();\n` +
          `              }).observe({ type: "paint", buffered: true });\n` +
          `              return;\n` +
          `            }\n` +
          `          } catch (e) {}\n` +
          `          requestAnimationFrame(function () { setTimeout(start, 0); });\n` +
          `        }\n` +
          `        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", afterPaint);\n` +
          `        else afterPaint();\n` +
          `      })();\n` +
          `    </script>`;
        return html.replace(ENTRY_TAG, () => loader);
      },
    },
  };
}
