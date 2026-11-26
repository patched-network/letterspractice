/**
 * Fit a question's content block into the space the study layout gives it.
 *
 * In-app, StudySession's `.card-transition-container` is `flex: 1` under the
 * fixed-height study layout, `overflow: hidden`, and `justify-content: center`:
 * content taller than that box is *clipped* top and bottom, never scrolled. On
 * a phone (keyboard eating the lower third) that means the play button at the
 * top and the last row of options both disappear, and there is no scroll
 * affordance a toddler would use anyway. So questions must fit, not scroll.
 *
 * `useScaleToFit` scales one block of the question (the options/suspects) down
 * until the whole question fits that box. The rest of the question is "chrome"
 * and is left at full size.
 *
 * Expected DOM:
 *
 *   root (the whole question)
 *     …chrome (header, play button, …)
 *     viewport  ← display: flex; align-items: center; justify-content: center
 *       content ← flex-shrink: 0; the block that gets scaled
 *     …more chrome
 *
 * The viewport's height is set to the scaled height so the layout around it
 * closes up; the content keeps its natural layout box and is drawn scaled
 * about its center (default transform-origin), which the flex centering keeps
 * aligned with the viewport.
 */

import { onBeforeUnmount, type Ref } from "vue";

/**
 * Nearest ancestor that scrolls or clips — the thing that decides whether we
 * overflow. In-app that is StudySession's `.card-transition-container`; on the
 * landing page it's the phone frame.
 */
export function findFitBoundary(el: HTMLElement): HTMLElement | null {
    let node = el.parentElement;
    while (node) {
        const overflowY = getComputedStyle(node).overflowY;
        if (overflowY === "auto" || overflowY === "scroll" || overflowY === "hidden") {
            return node;
        }
        node = node.parentElement;
    }
    return null;
}

/**
 * Height of the box this question actually gets, in px. The viewport clamp is
 * there so a content-sized `overflow: hidden` ancestor can't hand back a bogus
 * number; it is deliberately NOT a distance-to-fold clamp, because on the
 * landing page a question can mount while its slide is still below the fold,
 * and a scroll-dependent bound would size it for a slide nobody can see.
 */
export function measureAvailableHeight(el: HTMLElement): number {
    const boundary = findFitBoundary(el);
    return boundary
        ? Math.min(boundary.clientHeight, window.innerHeight)
        : window.innerHeight - el.getBoundingClientRect().top;
}

export interface ScaleToFitOptions {
    /** The whole question. Its height minus the viewport's is the chrome. */
    root: Ref<HTMLElement | null>;
    /** Flex box the content is centered in; gets an explicit height when scaled. */
    viewport: Ref<HTMLElement | null>;
    /** The block that is scaled. */
    content: Ref<HTMLElement | null>;
    /**
     * Re-wrap the content while scaling. A wrapping row scaled as-is keeps its
     * row count and just shrinks, leaving the freed width empty. With reflow,
     * the content is laid out at `viewportWidth / scale` before scaling, so
     * rows lengthen as they shrink and fewer rows are needed: the content
     * ends up larger on screen at the same fit. Default false.
     */
    reflow?: boolean;
    /** Smallest scale tried with reflow. Default 0.4. */
    minScale?: number;
    /**
     * Largest scale tried, with reflow: above 1 the content also *grows* into
     * spare room (a laptop, a large display), laid out narrower so it re-wraps
     * into more rows if that lets it grow further. Default 1 (shrink only).
     */
    maxScale?: number;
    /** Slack kept below the fit, px. Default 4. */
    margin?: number;
}

/** Reflow search step. Coarse on purpose: each step is a synchronous layout. */
const REFLOW_STEP = 0.05;
/** Search step above 1 (maxScale): coarser, as growth matters less than a fit. */
const GROW_STEP = 0.1;
/**
 * Share of the available height a grown block may fill: the rest is room for
 * an option's hover/selection scale (1.2) near the boundary, which clips.
 */
const GROW_HEADROOM = 0.88;

export function useScaleToFit(options: ScaleToFitOptions) {
    const { root, viewport, content } = options;
    const reflow = options.reflow ?? false;
    const minScale = options.minScale ?? 0.4;
    const maxScale = options.reflow ? Math.max(1, options.maxScale ?? 1) : 1;
    const margin = options.margin ?? 4;

    function reset(c: HTMLElement, v: HTMLElement): void {
        c.style.transform = "";
        c.style.width = "";
        v.style.height = "";
    }

    /**
     * The content's laid-out size: its own box, or its children's extent where
     * they overflow it (a word wider than the re-wrap width). From layout boxes
     * (offset*), not scrollWidth/Height: those count transformed descendants,
     * so an option mid-way through its hover/selection scale (1.2) measured
     * bigger, and a re-fit then (the submit button coming or going) chose a
     * different scale and re-wrapped the rows.
     */
    function naturalSize(c: HTMLElement): { width: number; height: number } {
        let left = 0;
        let top = 0;
        let right = c.offsetWidth;
        let bottom = c.offsetHeight;
        for (const child of Array.from(c.children)) {
            if (!(child instanceof HTMLElement) || child.offsetParent === null) continue;
            // Offsets are from the child's offsetParent: the content itself, if
            // it's positioned, or the ancestor the content measures from too.
            // A centered flex item wider than the line overflows both sides.
            const own = child.offsetParent === c;
            const x = child.offsetLeft - (own ? 0 : c.offsetLeft);
            const y = child.offsetTop - (own ? 0 : c.offsetTop);
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x + child.offsetWidth);
            bottom = Math.max(bottom, y + child.offsetHeight);
        }
        return { width: right - left, height: bottom - top };
    }

    /**
     * Measure and (re)apply the fit. Written imperatively, not via :style, so
     * the natural size can be re-measured with the fit cleared. Safe to call
     * repeatedly; call it whenever the content or the chrome changes size.
     */
    function applyFit(): void {
        const r = root.value;
        const v = viewport.value;
        const c = content.value;
        if (!r || !v || !c) return;

        reset(c, v);

        const natural = naturalSize(c);
        if (natural.height <= 0 || natural.width <= 0) return;

        const chrome = r.offsetHeight - v.offsetHeight;
        const available = measureAvailableHeight(r) - chrome - margin;
        const viewportWidth = v.clientWidth;
        if (!(available > 0) || !(viewportWidth > 0)) return;

        const fitsAt = (size: { width: number; height: number }, s: number) =>
            size.height * s <= available && size.width * s <= viewportWidth + 0.5;

        if (fitsAt(natural, 1)) {
            if (maxScale > 1) grow(c, v, viewportWidth, available * GROW_HEADROOM);
            return;
        }

        let scale: number;
        let height: number;

        if (reflow) {
            // Largest step whose re-wrapped layout fits. Falls through to the
            // floor (then the plain fit below it) if none does.
            scale = 0;
            height = natural.height;
            for (let s = 1 - REFLOW_STEP; s >= minScale - 1e-9; s -= REFLOW_STEP) {
                c.style.width = `${viewportWidth / s}px`;
                const size = naturalSize(c);
                if (fitsAt(size, s)) {
                    scale = s;
                    height = size.height;
                    break;
                }
            }
            if (scale === 0) {
                // Nothing on the ladder fit: lay out at the floor's width and
                // shrink to whatever that needs, even below the floor.
                c.style.width = `${viewportWidth / minScale}px`;
                const size = naturalSize(c);
                scale = Math.min(available / size.height, viewportWidth / size.width);
                height = size.height;
            }
        } else {
            scale = Math.min(1, available / natural.height, viewportWidth / natural.width);
            height = natural.height;
            if (!(scale > 0) || scale >= 0.995) return;
        }

        if (!(scale > 0)) {
            reset(c, v);
            return;
        }
        c.style.transform = `scale(${scale})`;
        v.style.height = `${Math.round(height * scale)}px`;
    }

    /**
     * Largest scale in (1, maxScale] whose re-wrapped layout fits `room`, if
     * any; applied as a fit is. Left at its natural size otherwise.
     */
    function grow(c: HTMLElement, v: HTMLElement, viewportWidth: number, room: number): void {
        for (let s = maxScale; s > 1 + 1e-9; s -= GROW_STEP) {
            c.style.width = `${viewportWidth / s}px`;
            const size = naturalSize(c);
            if (size.height * s <= room && size.width * s <= viewportWidth + 0.5) {
                c.style.transform = `scale(${s})`;
                v.style.height = `${Math.round(size.height * s)}px`;
                return;
            }
        }
        c.style.width = "";
    }

    let observer: ResizeObserver | null = null;
    let usingWindowResize = false;

    /**
     * Re-fit on viewport changes (rotation, browser chrome collapsing). Watches
     * the boundary element rather than our own content, whose size applyFit()
     * changes. Content/chrome changes are the caller's to report via applyFit().
     */
    function start(): void {
        stop();
        const boundary = root.value ? findFitBoundary(root.value) : null;
        if (!boundary || typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", applyFit);
            usingWindowResize = true;
            return;
        }
        observer = new ResizeObserver(() => applyFit());
        observer.observe(boundary);
    }

    function stop(): void {
        observer?.disconnect();
        observer = null;
        if (usingWindowResize) {
            window.removeEventListener("resize", applyFit);
            usingWindowResize = false;
        }
    }

    onBeforeUnmount(stop);

    return { applyFit, start, stop };
}
