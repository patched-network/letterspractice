/**
 * The app's light Markdown for copy, rendered to an HTML string for v-html.
 *
 * Every piece of authored prose goes through renderInline. It handles:
 *   - **bold**, *italic*, _underline_, and `code` chips
 *   - [*g* as in *word*, *word*] and [*g*]: tap-to-hear fact badges
 *     (see components/curriculum/inlineFacts.ts for the grammar)
 *   - [text](/path) in-app links, and [text](https://…) external links
 *   - {word|explanation}: an explainer. The word gets a dotted underline and
 *     opens a small popover holding the explanation: on hover or focus where
 *     the device can hover, on tap/click everywhere. The explanation is in the
 *     HTML either way (hidden until opened), so search and screen readers
 *     (via aria-describedby) get it without interaction.
 *
 * HTML is escaped before any tag is generated, so authored copy can't inject
 * markup; only the tags emitted here reach the DOM. Link targets are checked
 * against a scheme allowlist (in-app paths, http, https); anything else
 * renders as its label text.
 *
 * Clicks on the emitted badges, explainers and in-app links are handled by ONE
 * delegated listener, installed once at startup (installInlineMarkup). Vue event
 * handlers can't attach to v-html markup, so this is the wiring.
 */

import { shallowRef } from "vue";
import type { Router } from "vue-router";
import { splitInlineFacts, type CopySegment, type FactResolver } from "../curriculum/inlineFacts";
import { playFact } from "../curriculum/playFact";

// Resolving a fact span needs the phonetic index (~180 KB) and the
// curriculum (curriculum/inlineFactResolver.ts), so that loads on first need:
// the first copy rendered with a fact span in it. Until it arrives such a span
// renders as plain text; `resolver` is reactive, and renderInline reads it only
// for copy that might hold a fact span, so exactly the components showing one
// re-render with its badge. Copy without fact spans (the landing hero's) never
// loads it. While it loads, <html data-deferred-pending> tells the prerender
// to wait (scripts/prerender-public.ts).
const resolver = shallowRef<FactResolver | null>(null);
let loading: Promise<void> | null = null;

/** A bracket span that isn't a link: maybe a fact span. */
const MAYBE_FACT = /\[[^\]]+\](?!\()/;

/** Load the fact resolver now (renderInline does it on first need). */
export function loadInlineFacts(): Promise<void> {
  if (loading) return loading;
  const root = typeof document !== "undefined" ? document.documentElement : null;
  root?.setAttribute("data-deferred-pending", "");
  loading = import("../curriculum/inlineFactResolver")
    .then((m) => {
      resolver.value = m.factResolver;
    })
    .catch((err) => {
      console.warn("[inlineMarkup] fact resolver failed to load; fact spans stay plain text", err);
      loading = null; // the next render that needs it tries again
    })
    .finally(() => root?.removeAttribute("data-deferred-pending"));
  return loading;
}

function currentResolver(text: string): FactResolver | null {
  if (!MAYBE_FACT.test(text)) return null;
  const r = resolver.value; // read during render: the component re-renders when it loads
  if (!r) void loadInlineFacts();
  return r;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Emphasis and code chips, on text that has already been split from facts/links. */
function emphasis(raw: string): string {
  return escapeHtml(raw)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<u>$1</u>");
}

function factHtml(seg: Extract<CopySegment, { kind: "fact" }>): string {
  const { fact, label, color } = seg;
  const aria = fact.examples.length
    ? `${fact.grapheme}, as in ${fact.examples.join(", ")} — play the sound`
    : `${fact.grapheme} — play the sound`;
  return (
    `<button type="button" class="inline-fact" style="--fact-color:${escapeHtml(color)}"` +
    ` data-fact="${escapeHtml(JSON.stringify(fact))}" aria-label="${escapeHtml(aria)}">` +
    `${emphasis(label)}<i class="mdi mdi-volume-high inline-fact__icon" aria-hidden="true"></i>` +
    `</button>`
  );
}

function linkHtml(seg: Extract<CopySegment, { kind: "link" }>): string {
  const { label, to } = seg;
  if (/^\/(?!\/)/.test(to)) {
    return `<a href="${escapeHtml(to)}" class="inline-link" data-router>${emphasis(label)}</a>`;
  }
  if (/^https?:\/\//i.test(to)) {
    return `<a href="${escapeHtml(to)}" class="inline-link" target="_blank" rel="noopener">${emphasis(label)}</a>`;
  }
  return emphasis(label);
}

/** `{word|explanation}`. Neither part may hold braces; the word no `|`. */
const TIP = /\{([^{}|]+)\|([^{}]+)\}/g;

/** Stable id from the content: the same copy renders the same markup every time. */
function tipId(label: string, tip: string): string {
  let h = 0;
  for (const c of label + "|" + tip) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return `tip-${(h >>> 0).toString(36)}`;
}

function tipHtml(label: string, tip: string): string {
  const id = tipId(label, tip);
  return (
    `<span class="inline-tip">` +
    `<button type="button" class="inline-tip__word" aria-expanded="false" aria-describedby="${id}">` +
    `${emphasis(label)}</button>` +
    `<span class="inline-tip__pop" id="${id}" role="tooltip">${emphasis(tip)}</span>` +
    `</span>`
  );
}

/** Facts, links and emphasis: everything but explainers. */
function renderSpans(text: string): string {
  return splitInlineFacts(text, currentResolver(text))
    .map((seg) => {
      if (seg.kind === "text") return emphasis(seg.text);
      if (seg.kind === "fact") return factHtml(seg);
      return linkHtml(seg);
    })
    .join("");
}

/** Render copy markup to an HTML fragment (use with v-html). */
export function renderInline(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(TIP)) {
    out += renderSpans(text.slice(last, m.index)) + tipHtml(m[1].trim(), m[2].trim());
    last = m.index! + m[0].length;
  }
  return out + renderSpans(text.slice(last));
}

// --- explainer popovers -------------------------------------------------------

/** Keep an open popover inside the viewport (it's centred on its word by CSS). */
function fitTip(tip: HTMLElement): void {
  const pop = tip.querySelector<HTMLElement>(".inline-tip__pop");
  if (!pop) return;
  pop.style.setProperty("--tip-shift", "0px");
  const r = pop.getBoundingClientRect();
  const margin = 12;
  const vw = document.documentElement.clientWidth;
  let shift = 0;
  if (r.left < margin) shift = margin - r.left;
  else if (r.right > vw - margin) shift = vw - margin - r.right;
  pop.style.setProperty("--tip-shift", `${Math.round(shift)}px`);
}

function setTipOpen(tip: HTMLElement, open: boolean): void {
  tip.toggleAttribute("data-open", open);
  tip.querySelector(".inline-tip__word")?.setAttribute("aria-expanded", String(open));
  if (open) fitTip(tip);
}

function closeTips(except?: Element | null): void {
  document.querySelectorAll<HTMLElement>(".inline-tip[data-open]").forEach((t) => {
    if (t !== except) setTipOpen(t, false);
  });
}

/** Hover/focus open the popover by CSS; this only places it before it shows. */
function fitOnApproach(e: Event): void {
  const el = e.target instanceof Element ? e.target : null;
  const tip = el?.closest<HTMLElement>(".inline-tip");
  if (tip) fitTip(tip);
}

/**
 * Wire clicks on rendered copy: a fact badge plays its sound, an in-app link
 * navigates through the router. Call once, after the router is installed.
 */
export function installInlineMarkup(router: Router): void {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const el = e.target instanceof Element ? e.target : null;

    // Explainers: tap/click toggles; a click anywhere else closes them.
    const tip = el?.closest<HTMLElement>(".inline-tip");
    closeTips(tip);
    if (tip && el?.closest(".inline-tip__word")) {
      e.preventDefault();
      setTipOpen(tip, !tip.hasAttribute("data-open"));
      return;
    }

    const badge = el?.closest<HTMLElement>("button.inline-fact");
    if (badge?.dataset.fact) {
      e.preventDefault();
      void playFact(JSON.parse(badge.dataset.fact));
      return;
    }

    const link = el?.closest<HTMLAnchorElement>("a[data-router]");
    if (link) {
      e.preventDefault();
      void router.push(link.getAttribute("href") ?? "/");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTips();
  });
  document.addEventListener("mouseover", fitOnApproach);
  document.addEventListener("focusin", fitOnApproach);
}
