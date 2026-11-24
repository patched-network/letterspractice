/**
 * Minimal, email-safe Markdown → HTML renderer
 * ============================================
 *
 * Deliberately NOT a general Markdown library. Email HTML is a hostile target
 * (no external CSS, inconsistent client support), and broadcast bodies are
 * admin-authored, so we want a *small, predictable* subset that emits
 * inline-styled, mail-client-friendly markup rather than piping a full parser's
 * output through a sanitizer.
 *
 * Supported: `#`/`##`/`###` headings, `**bold**`, `*italic*` / `_italic_`,
 * `` `code` ``, `[text](url)` links (http/https/mailto only), `-`/`*` bullet
 * lists, `1.` ordered lists, `>` blockquotes, `---` horizontal rules, and
 * blank-line-separated paragraphs (single newlines become `<br>`).
 *
 * All text is HTML-escaped before inline formatting is applied, so raw `<`,
 * `>`, `&` in the source can't inject markup into the preview pane or the sent
 * email. Link targets are validated against a scheme allowlist (no
 * `javascript:` / `data:`).
 */

const BRAND_ORANGE = '#F57C00';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url.trim());
}

/** Inline formatting. Escapes first, so markers survive but raw HTML can't. */
function inline(raw: string): string {
  let t = escapeHtml(raw);

  // Links: [text](url) — validated scheme, else rendered literally.
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, url: string) =>
    isSafeUrl(url)
      ? `<a href="${url}" style="color:${BRAND_ORANGE}">${label}</a>`
      : m,
  );

  // Inline code (before emphasis so * / _ inside code are left alone).
  t = t.replace(
    /`([^`]+)`/g,
    '<code style="background:#f2f2f2;padding:1px 4px;border-radius:3px;font-size:0.9em">$1</code>',
  );

  // Bold, then italic (bold consumes ** pairs first, leaving lone * for italic).
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  t = t.replace(/_([^_]+)_/g, '<em>$1</em>');

  return t;
}

type Mode = 'none' | 'p' | 'ul' | 'ol' | 'quote';

/** Render the supported Markdown subset to a self-contained HTML fragment. */
export function renderMarkdownToEmailHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];

  let mode: Mode = 'none';
  let buf: string[] = [];

  const flush = (): void => {
    if (buf.length === 0) {
      mode = 'none';
      return;
    }
    if (mode === 'p') {
      out.push(`<p style="margin:0 0 16px">${buf.map(inline).join('<br>')}</p>`);
    } else if (mode === 'ul' || mode === 'ol') {
      const tag = mode === 'ul' ? 'ul' : 'ol';
      const items = buf.map((i) => `<li style="margin:0 0 6px">${inline(i)}</li>`).join('');
      out.push(`<${tag} style="margin:0 0 16px;padding-left:24px">${items}</${tag}>`);
    } else if (mode === 'quote') {
      out.push(
        `<blockquote style="margin:0 0 16px;padding:4px 0 4px 16px;` +
          `border-left:3px solid #e0e0e0;color:#555">` +
          `${buf.map(inline).join('<br>')}</blockquote>`,
      );
    }
    buf = [];
    mode = 'none';
  };

  const start = (m: Mode): void => {
    if (mode !== m) flush();
    mode = m;
  };

  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const hr = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
    const ulItem = /^\s*[-*]\s+(.*)$/.exec(line);
    const olItem = /^\s*\d+\.\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);

    if (line.trim() === '') {
      flush();
    } else if (heading) {
      flush();
      const level = heading[1].length;
      const size = level === 1 ? '24px' : level === 2 ? '20px' : '17px';
      out.push(
        `<h${level} style="margin:24px 0 12px;font-size:${size};line-height:1.3;color:#222">` +
          `${inline(heading[2])}</h${level}>`,
      );
    } else if (hr) {
      flush();
      out.push('<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0"/>');
    } else if (ulItem) {
      start('ul');
      buf.push(ulItem[1]);
    } else if (olItem) {
      start('ol');
      buf.push(olItem[1]);
    } else if (quote) {
      start('quote');
      buf.push(quote[1]);
    } else {
      start('p');
      buf.push(line);
    }
  }
  flush();

  return out.join('');
}

/** A readable text/plain alternative: strip the markdown markers we render. */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,3}\s+/gm, '') // heading markers
    .replace(/^\s*>\s?/gm, '') // blockquote markers
    .replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/gm, '----') // hr
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)') // links → "text (url)"
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1') // italic *
    .replace(/_([^_]+)_/g, '$1') // italic _
    .trim();
}
