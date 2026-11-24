// remote-dev-nudge.mjs — make mutagen notice edits immediately.
//
// On Linux, mutagen only watches recently-changed files closely; the first edit
// to any other file waits for its periodic rescan (up to 10 s). This watches the
// source dirs and asks mutagen to sync now, debounced. Started by
// `remote-dev.sh up`.
//
//   node remote-dev-nudge.mjs <dir>...

import { watch, existsSync } from "node:fs";
import { execFile } from "node:child_process";

const DEBOUNCE_MS = 50;
let timer = null;

function nudge() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    execFile("mutagen", ["sync", "flush", "--skip-wait", "lp-app", "lp-fw"], () => {});
  }, DEBOUNCE_MS);
}

for (const dir of process.argv.slice(2).filter(existsSync)) {
  watch(dir, { recursive: true }, (_event, file) => {
    if (file && !file.includes("node_modules") && !file.includes("/dist/")) nudge();
  });
}
