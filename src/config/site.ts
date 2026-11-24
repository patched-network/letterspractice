/**
 * Who this deployment is: the values that differ between our hosted copy and
 * anyone else's. All come from the build env (see .env.example); none has a
 * default, so a self-hosted build without them names nobody's site but its
 * own.
 */

/** The site's origin, e.g. https://example.com (no trailing slash). Empty: unknown. */
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? "").replace(/\/+$/, "");

/** Address for support requests, shown on auth error screens. Empty: no contact line. */
export const SUPPORT_EMAIL: string = import.meta.env.VITE_SUPPORT_EMAIL ?? "";

/**
 * Origin of the media host that serves the landing page's demo video (its
 * /v/ route answers Range requests), e.g. https://media.example.com. Empty:
 * no demo video section. scripts/vite-plugin-deployment-csp.ts adds it to the
 * CSP's media-src.
 */
export const MEDIA_BASE = (import.meta.env.VITE_MEDIA_BASE ?? "").replace(/\/+$/, "");

/** The site's address for sharing: SITE_URL, else wherever the app is running. */
export function shareUrl(): string {
    return SITE_URL || window.location.origin;
}
