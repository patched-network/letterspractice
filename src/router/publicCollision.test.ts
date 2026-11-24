/**
 * Guard: no top-level folder in public/ may share a name with a route.
 *
 * Vite copies public/ into the build as-is, and prod's Caddy serves the SPA
 * with `try_files {path} {path}/ /index.html`. A request for /curriculum
 * matched the built curriculum/ directory at `{path}/`, ahead of the
 * index.html fallback, and with no index file in it, a direct load was a 404
 * (2026-10-08; the stills moved to public/curriculum-stills/). In-app
 * navigation never hits the server, so only direct loads and refreshes broke,
 * and the dev server doesn't reproduce it.
 *
 * The deeper fix is dropping `{path}/` from try_files; until then, this.
 * Routes are read from the router source as text (path: and alias: values),
 * so the test needs no Vue or router runtime.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const ROUTER_FILES = ['src/router/index.ts', 'src/router/debug.ts'];

/** First path segment of every `path:` / `alias:` value (string or array). */
function routeSegments(): Set<string> {
  const segments = new Set<string>();
  const field = /\b(?:path|alias)\s*:\s*(\[[^\]]*\]|"[^"]*"|'[^']*')/g;
  const quoted = /["']([^"']*)["']/g;
  for (const file of ROUTER_FILES) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    for (const [, value] of src.matchAll(field)) {
      for (const [, path] of value.matchAll(quoted)) {
        const first = path.replace(/^\//, '').split('/')[0];
        // Params and catch-alls aren't fixed names.
        if (first && !first.startsWith(':') && !first.includes('*') && !first.includes('(')) {
          segments.add(first);
        }
      }
    }
  }
  return segments;
}

function publicFolders(): string[] {
  return readdirSync(join(ROOT, 'public'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

describe('public/ vs routes', () => {
  it('reads routes from the router source', () => {
    // A parser that silently finds nothing would pass the real check.
    const routes = routeSegments();
    expect(routes.has('curriculum')).toBe(true);
    expect(routes.has('how-it-works')).toBe(true); // an alias
  });

  it('has no top-level public folder named like a route', () => {
    const routes = routeSegments();
    const collisions = publicFolders().filter((name) => routes.has(name));
    expect(
      collisions,
      `public/ folder(s) shadow a route on direct load (Caddy try_files {path}/): ${collisions.join(', ')}. Rename the folder.`,
    ).toEqual([]);
  });
});
