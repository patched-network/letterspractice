#!/usr/bin/env tsx
/**
 * Remove stale GPC exercise tags from live ELO maps: card docs' `elo.tags` in
 * the course DB, and named learners' `elo.tags` in their CourseRegistrations.
 *
 * Stale = `gpc:exercise:<id>` (not a sight word, `WORD-`) that GPC_CATALOGUE
 * no longer defines. These came from WhoSaidThat grading a split-digraph card
 * as the bare vowel (`a-EY` for `a_e-EY`), fixed 2026-11-18 by the cards' `gpcId`
 * field. Nothing re-adds them once that app + content are live: the generator
 * never emits them, and deploy-content only adds a card's current tags.
 * The lesson gate already ignores them (lessons.ts `CATALOGUE_EXERCISE_TAGS`);
 * this cleans the data so other readers (admin view, skill pressure, ELO
 * distance) agree. Card history and session ELO events are left alone.
 *
 * Run it after both deploys, while no learner is mid-session: a device that
 * writes its registration from an older revision can bring the tags back.
 *
 * Usage:
 *   tsx scripts/scrub-stale-gpc-tags.ts --base <couch url> [--users Alice,nocheez] [--apply]
 *
 * Dry run unless --apply. With --apply, every doc is backed up first to
 * dbg/scrub-stale-gpc-tags-<stamp>.json (gitignored).
 *
 * Options:
 *   --base <url>          CouchDB base URL (required; the deployment supplies it)
 *   --users <a,b>         Learners whose registrations to scrub (default: none, cards only)
 *   --course-id <id>      Course (default: skuilder.config.json `course`)
 *   --admin-user <name>   CouchDB admin username (default: admin)
 *   --pw-file <path>      Admin password file (default ~/.lp-admin-pw; or $LP_COUCH_ADMIN_PW)
 *   --apply               Write the changes
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GPC_CATALOGUE } from '../content/phoneticAnalytics/lib/catalogue';
import { gpcExerciseTag } from '../content/phoneticAnalytics/lib/content-labelling';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOGUE = new Set<string>(GPC_CATALOGUE.map((e) => gpcExerciseTag(e.id)));

function isStale(tag: string): boolean {
  return (
    tag.startsWith('gpc:exercise:') && !tag.startsWith('gpc:exercise:WORD-') && !CATALOGUE.has(tag)
  );
}

type Doc = Record<string, unknown> & { _id: string; _rev?: string };
type EloTags = Record<string, { score: number; count: number; recent?: unknown[] }>;

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Unexpected argument: ${a}`);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      opts[a.slice(2)] = next;
      i++;
    } else {
      opts[a.slice(2)] = true;
    }
  }
  return opts;
}

function adminPassword(pwFile: string | undefined): string {
  if (process.env.LP_COUCH_ADMIN_PW) return process.env.LP_COUCH_ADMIN_PW;
  const file = pwFile ?? resolve(homedir(), '.lp-admin-pw');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  throw new Error('No admin password: set $LP_COUCH_ADMIN_PW or --pw-file');
}

function usernameToDbName(username: string): string {
  return 'userdb-' + Buffer.from(username, 'utf8').toString('hex');
}

async function couch(url: string, auth: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: 'Basic ' + Buffer.from(auth).toString('base64'),
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

/** Drop stale keys from an `elo.tags` map in place; returns what was dropped. */
function scrub(tags: EloTags | undefined): string[] {
  if (!tags) return [];
  const dropped = Object.keys(tags).filter(isStale);
  for (const t of dropped) delete tags[t];
  return dropped;
}

function describe(tags: EloTags, dropped: string[]): string {
  return dropped
    .map((t) => `${t.replace('gpc:exercise:', '')}(n=${tags[t].count}, recent=${tags[t].recent?.length ?? 0})`)
    .join(' ');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const base = typeof opts.base === 'string' ? opts.base.replace(/\/$/, '') : undefined;
  if (!base) throw new Error('--base <couch url> is required');
  const apply = opts.apply === true;
  const users = typeof opts.users === 'string' ? opts.users.split(',').map((u) => u.trim()).filter(Boolean) : [];
  const courseId =
    typeof opts['course-id'] === 'string'
      ? opts['course-id']
      : JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'skuilder.config.json'), 'utf8')).course;
  const auth = `${typeof opts['admin-user'] === 'string' ? opts['admin-user'] : 'admin'}:${adminPassword(
    typeof opts['pw-file'] === 'string' ? opts['pw-file'] : undefined,
  )}`;

  console.log(`[scrub] ${apply ? 'APPLY' : 'dry run'} · course ${courseId} · users: ${users.join(', ') || '(none)'}`);

  const backups: Array<{ db: string; doc: Doc }> = [];
  const writes: Array<{ db: string; doc: Doc; label: string }> = [];

  // Cards
  const courseDb = `${base}/coursedb-${courseId}`;
  const found = await couch(`${courseDb}/_find`, auth, {
    method: 'POST',
    body: JSON.stringify({ selector: { docType: 'CARD' }, limit: 100000 }),
  });
  if (found.status !== 200) throw new Error(`_find CARD on ${courseDb} -> ${found.status}`);
  const cards = found.body.docs as Doc[];
  console.log(`[scrub] ${cards.length} card docs scanned`);
  for (const card of cards) {
    const elo = card.elo as { tags?: EloTags } | undefined;
    if (!elo?.tags || !Object.keys(elo.tags).some(isStale)) continue;
    backups.push({ db: courseDb, doc: structuredClone(card) });
    const before = structuredClone(elo.tags);
    const dropped = scrub(elo.tags);
    console.log(`  card ${card._id}: -${describe(before, dropped)}`);
    writes.push({ db: courseDb, doc: card, label: `card ${card._id}` });
  }

  // Learners
  for (const user of users) {
    const db = `${base}/${usernameToDbName(user)}`;
    const r = await couch(`${db}/CourseRegistrations`, auth);
    if (r.status !== 200) throw new Error(`CourseRegistrations for ${user} -> ${r.status}`);
    const doc = r.body as Doc & { courses: Array<{ courseID: string; elo?: { tags?: EloTags } }> };
    const reg = doc.courses.find((c) => c.courseID === courseId);
    const tags = reg?.elo && typeof reg.elo === 'object' ? reg.elo.tags : undefined;
    if (!tags || !Object.keys(tags).some(isStale)) {
      console.log(`  user ${user}: nothing stale`);
      continue;
    }
    backups.push({ db, doc: structuredClone(doc) });
    const before = structuredClone(tags);
    const dropped = scrub(tags);
    console.log(`  user ${user} (rev ${doc._rev}): -${describe(before, dropped)}`);
    writes.push({ db, doc, label: `user ${user}` });
  }

  if (!writes.length) {
    console.log('[scrub] nothing to change');
    return;
  }
  if (!apply) {
    console.log(`[scrub] dry run: ${writes.length} doc(s) would change. Re-run with --apply.`);
    return;
  }

  const outDir = resolve(PROJECT_ROOT, 'dbg');
  mkdirSync(outDir, { recursive: true });
  const backupPath = resolve(outDir, `scrub-stale-gpc-tags-${new Date().toISOString().replace(/[:.]/g, '')}.json`);
  writeFileSync(backupPath, JSON.stringify(backups, null, 1));
  console.log(`[scrub] backup: ${backupPath}`);

  let failed = 0;
  for (const w of writes) {
    const r = await couch(`${w.db}/${encodeURIComponent(w.doc._id)}`, auth, {
      method: 'PUT',
      body: JSON.stringify(w.doc),
    });
    if (r.status === 201 || r.status === 202) {
      console.log(`  ✓ ${w.label} → ${r.body.rev}`);
    } else {
      failed++;
      console.log(`  ✗ ${w.label}: ${r.status} ${JSON.stringify(r.body)} (409 = written meanwhile; re-run)`);
    }
  }
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(`[scrub] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
