/**
 * Why is a module in the entry chunk? A build of the app (into .perf/why-dist,
 * leaving dist/ alone) that prints, for each module matching PERF_WHY, the
 * shortest chain of static imports from the entry to it, from Rollup's own
 * module graph.
 *
 *   PERF_WHY="phonetics.generated,lessons/01." npx vite build --config scripts/perf/why.config.ts
 *
 * Patterns are substrings of module ids (absolute paths). Prints only
 * modules that ended up in the entry chunk.
 */
import { mergeConfig, type Plugin } from "vite";
import { resolve } from "node:path";
import base from "../../vite.config";

const ROOT = resolve(__dirname, "../..");
const patterns = (process.env.PERF_WHY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const short = (id: string) => id.replace(ROOT + "/", "").replace(/\?.*$/, "");

export function whyPlugin(): Plugin {
  return {
    name: "perf-why-in-entry",
    apply: "build",
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find((c) => c.type === "chunk" && c.isEntry);
      if (!entry || entry.type !== "chunk" || !entry.facadeModuleId) return;
      const root = entry.facadeModuleId;
      const inEntry = new Set(Object.keys(entry.modules));
      for (const p of patterns) {
        const hits = [...inEntry].filter((id) => id.includes(p));
        if (hits.length === 0) {
          console.log(`\n[why] ${p}: not in the entry chunk`);
          continue;
        }
        for (const hit of hits.slice(0, 3)) {
          // Breadth-first over static importers, from the module back to the entry.
          const prev = new Map<string, string | null>([[hit, null]]);
          const queue = [hit];
          while (queue.length && !prev.has(root)) {
            const id = queue.shift()!;
            for (const imp of this.getModuleInfo(id)?.importers ?? []) {
              if (!prev.has(imp)) {
                prev.set(imp, id);
                queue.push(imp);
              }
            }
          }
          if (!prev.has(root)) {
            console.log(`\n[why] ${short(hit)}: in the entry, but no static chain to ${short(root)}`);
            continue;
          }
          const chain: string[] = [];
          for (let n: string | null = root; n; n = prev.get(n) ?? null) chain.push(short(n));
          console.log(`\n[why] ${short(hit)}:\n    ${chain.join("\n  → ")}`);
        }
      }
    },
  };
}

export default mergeConfig(base, {
  plugins: [whyPlugin()],
  build: { outDir: resolve(ROOT, ".perf/why-dist"), emptyOutDir: true, sourcemap: false },
});
