import { beforeAll, describe, expect, it } from 'vitest';
import { loadInlineFacts, renderInline } from './inlineMarkup';
import { splitInlineFacts } from '../curriculum/inlineFacts';

describe('splitInlineFacts without a resolver (before it has loaded)', () => {
  it('renders a starred fact span as its plain label, a bare one as literal text', () => {
    expect(splitInlineFacts('Say [*sh* as in *ship*] and [j] and [sic]', null)).toEqual([
      { kind: 'text', text: 'Say ' },
      { kind: 'text', text: '*sh* as in *ship*' },
      { kind: 'text', text: ' and [j] and [sic]' },
    ]);
  });

  it('still makes links', () => {
    expect(splitInlineFacts('see [the engine](/learning-engine)', null)).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', label: 'the engine', to: '/learning-engine' },
    ]);
  });
});

describe('renderInline', () => {
  // Fact badges need the resolver, which renderInline loads on first need.
  beforeAll(() => loadInlineFacts());

  it('renders emphasis and code chips', () => {
    expect(renderInline('a **bold** and *ital* and `d`')).toBe(
      'a <strong>bold</strong> and <em>ital</em> and <code>d</code>',
    );
  });

  it('escapes authored HTML', () => {
    const out = renderInline('<script>x</script> & "q"');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('&amp;');
  });

  it('renders a fact span as a tap-to-hear badge', () => {
    const out = renderInline('Say [*sh* as in *ship*] now');
    expect(out).toContain('<button type="button" class="inline-fact"');
    expect(out).toContain('data-fact="');
    expect(out).toContain('<em>sh</em> as in <em>ship</em>');
    expect(out.startsWith('Say ')).toBe(true);
    expect(out.endsWith(' now')).toBe(true);
  });

  it('keeps the fact payload escaped inside the attribute', () => {
    const out = renderInline('[*sh* as in *ship*]');
    const attr = /data-fact="([^"]*)"/.exec(out)?.[1] ?? '';
    expect(attr).not.toContain('"');
    const fact = JSON.parse(attr.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    expect(fact.grapheme).toBe('sh');
  });

  it('leaves an unresolvable fact span as its plain label', () => {
    expect(renderInline('[*zq* as in *zzqqxx*]')).not.toContain('inline-fact');
  });

  it('renders in-app links for the router', () => {
    expect(renderInline('[Learning Engine](/learning-engine)')).toBe(
      '<a href="/learning-engine" class="inline-link" data-router>Learning Engine</a>',
    );
  });

  it('renders external https links in a new tab', () => {
    expect(renderInline('[site](https://example.com)')).toContain('target="_blank"');
  });

  it('drops unsafe link schemes to their label', () => {
    const out = renderInline('[click](javascript:void0)');
    expect(out).toBe('click');
    expect(out).not.toContain('href');
  });
});
