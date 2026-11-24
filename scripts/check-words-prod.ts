#!/usr/bin/env tsx
/**
 * Verify all words in WORD_LIST have a corresponding audio file on the server.
 * Uses HEAD requests — no file content is downloaded.
 *
 * Usage:
 *   tsx scripts/check-words-prod.ts <base-url>
 *
 * The base URL (the deployment to check, e.g. https://example.com) is required.
 */

import { WORD_LIST } from '../src/audio/word-list.js';

if (!process.argv[2]) {
  console.error('Usage: tsx scripts/check-words-prod.ts <base-url>   (e.g. https://example.com)');
  process.exit(2);
}
const BASE = process.argv[2].replace(/\/$/, '');
const CONCURRENCY = 20;

async function checkWord(word: string): Promise<string | null> {
  const url = `${BASE}/audio/words/${word}.mp3`;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return `${word}: HTTP ${res.status}`;
    // Caddy's SPA fallback (`try_files {path} ... /index.html`) returns 200 + text/html
    // for missing files. Status alone is unreliable — verify the response is actually audio.
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('audio/')) {
      return `${word}: served as ${contentType || 'unknown'} (SPA fallback — file missing)`;
    }
    return null;
  } catch (e) {
    return `${word}: ${(e as Error).message}`;
  }
}

async function main() {
  console.log(`Checking ${WORD_LIST.length} word audio files against ${BASE}...`);
  const missing: string[] = [];

  for (let i = 0; i < WORD_LIST.length; i += CONCURRENCY) {
    const batch = Array.from(WORD_LIST).slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(checkWord));
    missing.push(...(results.filter(Boolean) as string[]));
    process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, WORD_LIST.length)}/${WORD_LIST.length}`);
  }

  console.log('');

  if (missing.length) {
    console.error(`\n${missing.length} missing or unreachable:\n${missing.join('\n')}`);
    process.exit(1);
  } else {
    console.log(`All ${WORD_LIST.length} word audio files present.`);
  }
}

main();
