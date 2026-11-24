/**
 * The deployment's additions to index.html's Content-Security-Policy, in dev
 * and build alike:
 *   - the demo video's media host (VITE_MEDIA_BASE, src/config/site.ts) in
 *     media-src. Without it the browser blocks the video with a misleading
 *     "no supported format" error (SessionVideoSection.vue);
 *   - src/deployment/overlay/csp.json, if the deployment has one: extra
 *     sources per directive, e.g. a payment provider's script and frame hosts:
 *     { "script-src": ["https://js.example.com"], "frame-src": [...] }.
 * The open build adds neither.
 *
 * Also the overlay guard: with VITE_REQUIRE_OVERLAY set (a deployment's env),
 * the build fails if src/deployment/overlay/ is missing, instead of quietly
 * building the open app (everything free, no checkout).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

export type CspSources = Record<string, string[]>;

/** index.html with `extra` appended to its CSP meta tag's directives. Throws on a directive the policy doesn't have. */
export function extendCsp(html: string, extra: CspSources): string {
    let found = false;
    const out = html.replace(
        /(http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/,
        (_m, open: string, policy: string, close: string) => {
            found = true;
            const directives = policy.split(";").map((d) => d.trim()).filter(Boolean);
            for (const [name, sources] of Object.entries(extra)) {
                if (!sources.length) continue;
                const i = directives.findIndex((d) => d === name || d.startsWith(`${name} `));
                if (i === -1) throw new Error(`deployment-csp: index.html's CSP has no ${name} directive to extend`);
                directives[i] = `${directives[i]} ${sources.join(" ")}`;
            }
            return `${open}${directives.join("; ")}${close}`;
        },
    );
    if (!found && Object.values(extra).some((s) => s.length)) throw new Error("deployment-csp: no CSP meta tag in index.html");
    return out;
}

const OVERLAY = "src/deployment/overlay";

/** Throws when the env requires an overlay and there is none (see the header). */
export function checkOverlay(root: string, env: Record<string, string>): void {
    if (env.VITE_REQUIRE_OVERLAY && !existsSync(join(root, OVERLAY, "index.ts"))) {
        throw new Error(`deployment: VITE_REQUIRE_OVERLAY is set but ${OVERLAY}/index.ts is missing; refusing to build the open app`);
    }
}

/** The sources this deployment adds: its csp.json, plus the media host. */
export function deploymentSources(root: string, env: Record<string, string>): CspSources {
    const file = join(root, OVERLAY, "csp.json");
    const extra: CspSources = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    if (env.VITE_MEDIA_BASE) extra["media-src"] = [...(extra["media-src"] ?? []), new URL(env.VITE_MEDIA_BASE).origin];
    return extra;
}

export function deploymentCsp(): Plugin {
    let extra: CspSources = {};
    return {
        name: "deployment-csp",
        configResolved(config) {
            checkOverlay(config.root, config.env);
            extra = deploymentSources(config.root, config.env);
        },
        transformIndexHtml(html) {
            return extendCsp(html, extra);
        },
    };
}
