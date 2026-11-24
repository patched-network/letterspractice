import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkOverlay, extendCsp } from "./vite-plugin-deployment-csp";

const INDEX = readFileSync(join(__dirname, "..", "index.html"), "utf8");
const policy = (html: string) => /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)![1];
const directive = (html: string, name: string) => policy(html).split("; ").find((d) => d.startsWith(`${name} `));

describe("extendCsp", () => {
    it("leaves index.html alone with nothing to add", () => {
        expect(extendCsp(INDEX, {})).toBe(INDEX);
    });

    it("appends sources to index.html's existing directives", () => {
        const html = extendCsp(INDEX, {
            "media-src": ["https://media.example.com"],
            "frame-src": ["https://pay.example.com"],
        });
        expect(directive(html, "media-src")).toBe("media-src 'self' blob: https://media.example.com");
        expect(directive(html, "frame-src")).toMatch(/^frame-src 'self' .* https:\/\/pay\.example\.com$/);
        expect(directive(html, "script-src")).toBe(directive(INDEX, "script-src"));
    });

    it("throws on a directive the policy doesn't have", () => {
        expect(() => extendCsp(INDEX, { "worker-src": ["https://x.example.com"] })).toThrow(/worker-src/);
    });

    it("names no payment provider or media host in the open build", () => {
        expect(policy(INDEX)).not.toMatch(/stripe|klarna|media\./i);
    });
});

describe("checkOverlay", () => {
    const root = mkdtempSync(join(tmpdir(), "overlay-"));

    it("passes without the requirement, overlay or not", () => {
        expect(() => checkOverlay(root, {})).not.toThrow();
    });

    it("fails a required build with no overlay", () => {
        expect(() => checkOverlay(root, { VITE_REQUIRE_OVERLAY: "1" })).toThrow(/overlay/);
    });

    it("passes a required build with one", () => {
        mkdirSync(join(root, "src/deployment/overlay"), { recursive: true });
        writeFileSync(join(root, "src/deployment/overlay/index.ts"), "export default {};\n");
        expect(() => checkOverlay(root, { VITE_REQUIRE_OVERLAY: "1" })).not.toThrow();
    });
});
