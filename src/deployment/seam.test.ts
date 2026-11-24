/**
 * The deployment seam's one structural rule: the app reaches the overlay only
 * through src/deployment/index.ts's globs (and the build scripts, by path).
 * Anything else importing from ./overlay/ would break the open build, which
 * has no overlay.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { openProvider } from "../entitlement/open";

const SRC = join(__dirname, "..");
const OVERLAY = join(__dirname, "overlay");

function* files(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) yield* files(p);
        else if (/\.(ts|vue|js|mjs)$/.test(name)) yield p;
    }
}

describe("deployment seam", () => {
    it("nothing outside src/deployment/overlay/ imports from it", () => {
        const offenders: string[] = [];
        for (const f of files(SRC)) {
            if (f.startsWith(OVERLAY) || f === __filename) continue;
            if (f === join(__dirname, "index.ts")) continue; // the glob
            // import statements and dynamic imports, not prose mentioning the folder
            if (/(from|import\()\s*['"][^'"]*\/overlay(\/|['"])/.test(readFileSync(f, "utf8"))) {
                offenders.push(relative(SRC, f));
            }
        }
        expect(offenders).toEqual([]);
    });

    it("the open provider has no ceiling and sells nothing", async () => {
        expect(openProvider.wordLimit).toBeNull();
        expect(openProvider.offer).toBeNull();
        await expect(openProvider.hasPaidAccess()).resolves.toBe(true);
    });
});
