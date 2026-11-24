/**
 * Drops the packed static course (public/static-courses/, ~22 MB) from a build
 * that uses CouchDB: nothing in it would read the files. The data-layer rule
 * is the app's own (src/config/dataLayer.ts), so build and app agree.
 */
import { readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { resolveDataLayerType, type DataLayerType } from "../src/config/dataLayer";

export function staticCourse(): Plugin {
  let outDir = "";
  let type: DataLayerType = "static";
  return {
    name: "lp-static-course",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      const fallback = JSON.parse(readFileSync(join(config.root, "skuilder.config.json"), "utf8")).dataLayerType;
      type = resolveDataLayerType(config.env, fallback);
    },
    closeBundle() {
      if (type !== "couch") return;
      rmSync(join(outDir, "static-courses"), { recursive: true, force: true });
      console.log("[static-course] CouchDB build: dropped static-courses/ from the output");
    },
  };
}
