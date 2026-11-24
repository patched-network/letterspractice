/**
 * The app's light Markdown for copy, rendered to an HTML string for v-html.
 *
 * Every piece of authored prose goes through renderInline. It handles:
 *   - **bold**, *italic*, _underline_, and `code` chips
 *   - [*g* as in *word*, *word*] and [*g*]: tap-to-hear fact badges
 *     (see components/curriculum/inlineFacts.ts for the grammar)
 *   - [text](/path) in-app links, and [text](https://…) external links
 *
 * HTML is escaped before any tag is generated, so authored copy can't inject
 * markup; only the tags emitted here reach the DOM. Link targets are checked
 * against a scheme allowlist (in-app paths, http, https); anything else
 * renders as its label text.
 *
 * Clicks on the emitted badges and in-app links are handled by ONE delegated
 * listener, installed once at startup (installInlineMarkup). Vue event
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

/** Render copy markup to an HTML fragment (use with v-html). */
export function renderInline(text: string): string {
  return splitInlineFacts(text, currentResolver(text))
    .map((seg) => {
      if (seg.kind === "text") return emphasis(seg.text);
      if (seg.kind === "fact") return factHtml(seg);
      return linkHtml(seg);
    })
    .join("");
}

/**
 * Wire clicks on rendered copy: a fact badge plays its sound, an in-app link
 * navigates through the router. Call once, after the router is installed.
 */
export function installInlineMarkup(router: Router): void {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const el = e.target instanceof Element ? e.target : null;

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
}
