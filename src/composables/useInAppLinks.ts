import { useRouter } from "vue-router";

/**
 * A click handler for a container of rendered markdown (v-html). Markdown
 * links render as plain <a>; this sends in-app paths through the router so
 * they don't full-reload. Anything the router doesn't match (static files
 * such as /print/*.pdf, external URLs) and modified clicks fall through to
 * the browser.
 *
 *     const onLinkClick = useInAppLinks();
 *     <div v-html="html" @click="onLinkClick" />
 */
export function useInAppLinks(): (e: MouseEvent) => void {
    const router = useRouter();
    return (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
            return;
        }
        const a = (e.target as Element | null)?.closest("a");
        const href = a?.getAttribute("href");
        if (!a || !href || a.target || a.hasAttribute("download")) return;
        if (!href.startsWith("/") || href.startsWith("//")) return;
        if (!router.resolve(href).matched.length) return;
        e.preventDefault();
        void router.push(href);
    };
}
