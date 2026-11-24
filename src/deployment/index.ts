/**
 * The deployment overlay: what one deployment of this app adds to the open
 * build (its paid-access provider, its own routes and admin views, its pitch
 * and CSP sources). This is the only module that reaches into it.
 *
 * The overlay is a folder copied to ./overlay/ (gitignored) before building.
 * Ours lives in the commercial repo (deploy/letterspractice/overlay/), and its
 * deploy copies it in. Without one, the app builds fully open. What it may
 * hold:
 *
 *   overlay/index.ts   default export: Deployment (./types.ts). Browser only.
 *   overlay/pitch.ts   default export: Pitch (./pitch.ts). Plain data; the
 *                      prerender loads it under Node too.
 *   overlay/pages.ts   default export: PublicPage[] (content/pages.ts), the
 *                      deployment's own public pages (their routes go in
 *                      index.ts). Plain data, loaded under Node too.
 *   overlay/csp.json   extra CSP sources (scripts/vite-plugin-deployment-csp.ts).
 *
 * Overlay files import the app relatively, as if they lived here (e.g.
 * "../../services/curriculum"). Local dev with an overlay: copy it in; a
 * symlink doesn't work (Vite resolves it to its real path, which breaks those
 * imports). A deploy sets VITE_REQUIRE_OVERLAY=1 so a missing overlay fails
 * the build rather than shipping an open one.
 */
import type { PublicPage } from "../content/pages";
import type { Pitch } from "./pitch";
import type { Deployment } from "./types";

export type { Deployment } from "./types";
export type { Pitch } from "./pitch";

const found = import.meta.glob<{ default: Deployment }>("./overlay/index.ts", { eager: true });

export const deployment: Deployment = Object.values(found)[0]?.default ?? {};

const foundPitch = import.meta.glob<{ default: Pitch }>("./overlay/pitch.ts", { eager: true });

/** The deployment's own words for its offer (./pitch.ts); null in the open build. */
export const pitch: Pitch | null = Object.values(foundPitch)[0]?.default ?? null;

const foundPages = import.meta.glob<{ default: PublicPage[] }>("./overlay/pages.ts", { eager: true });

/** The deployment's own public pages (titles, descriptions, footer links); none in the open build. */
export const deploymentPages: readonly PublicPage[] = Object.values(foundPages)[0]?.default ?? [];
