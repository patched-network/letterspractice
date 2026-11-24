#!/usr/bin/env tsx
/**
 * Verify all phoneme audio files are reachable on the server.
 * Checks 39 ARPAbet phonemes + 2 compound pseudo-phonemes (K_W, K_S).
 * Uses HEAD requests — no file content is downloaded.
 *
 * Usage:
 *   tsx scripts/check-phonemes-prod.ts <base-url>
 *
 * The base URL (the deployment to check, e.g. https://example.com) is required.
 */

import { VOWELS, CONSONANTS } from '../src/services/phonetics/arpabet.js';
import { COMPOUND_PHONEMES } from '../src/services/phonetics/phonemeCache.js';

if (!process.argv[2]) {
  console.error('Usage: tsx scripts/check-phonemes-prod.ts <base-url>   (e.g. https://example.com)');
  process.exit(2);
}
const BASE = process.argv[2].replace(/\/$/, '');
const CONCURRENCY = 20;

const ALL_PHONEMES = [...VOWELS, ...CONSONANTS, ...COMPOUND_PHONEMES];

async function checkPhoneme(phoneme: string): Promise<string | null> {
  const url = `${BASE}/audio/arpa/${phoneme}.mp3`;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return `${phoneme}: HTTP ${res.status}`;
    // Caddy's SPA fallback (`try_files {path} ... /index.html`) returns 200 + text/html
    // for missing files. Status alone is unreliable — verify the response is actually audio.
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('audio/')) {
      return `${phoneme}: served as ${contentType || 'unknown'} (SPA fallback — file missing)`;
    }
    return null;
  } catch (e) {
    return `${phoneme}: ${(e as Error).message}`;
  }
}

async function main() {
  console.log(`Checking ${ALL_PHONEMES.length} phoneme audio files against ${BASE}...`);
  const missing: string[] = [];

  for (let i = 0; i < ALL_PHONEMES.length; i += CONCURRENCY) {
    const batch = ALL_PHONEMES.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(checkPhoneme));
    missing.push(...(results.filter(Boolean) as string[]));
    process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, ALL_PHONEMES.length)}/${ALL_PHONEMES.length}`);
  }

  console.log('');

  if (missing.length) {
    console.error(`\n${missing.length} missing or unreachable:\n${missing.join('\n')}`);
    process.exit(1);
  } else {
    console.log(`All ${ALL_PHONEMES.length} phoneme audio files present.`);
  }
}

main();
