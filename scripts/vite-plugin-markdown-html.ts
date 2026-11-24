/**
 * `import html from "./file.md?html"`: the file rendered to an HTML string at
 * build time (src/content/roadmap/updatesMarkdown.ts), so the app ships the
 * HTML and not a markdown parser. Used for the roadmap/changelog updates
 * (src/content/roadmap/updates.ts), which the router reaches at boot for page
 * titles: rendering them in the browser loaded and ran marked on every visit,
 * on every page (a.2.tracking.md, change 20). Dev, build and tests alike.
 */
import { readFile } from "node:fs/promises";
import type { Plugin } from "vite";
import { renderUpdateMarkdown } from "../src/content/roadmap/updatesMarkdown";

export function markdownHtml(): Plugin {
  return {
    name: "markdown-html",
    enforce: "pre",
    async load(id) {
      const [file, query] = id.split("?", 2);
      if (!file.endsWith(".md") || query !== "html") return null;
      this.addWatchFile(file);
      const html = renderUpdateMarkdown(await readFile(file, "utf8"));
      return `export default ${JSON.stringify(html)};`;
    },
  };
}
