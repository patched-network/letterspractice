/**
 * Blast-radius enumeration: prod gating state vs local generated content.
 *
 * Compares the live course DB's card tags (inverted from TAG-* docs) against
 * outputs-v2/generated-cards.json, under the OLD lesson filter (gates active
 * lessons only) and the NEW default-deny filter (gates every registry
 * lesson's concepts, active + deferred, plus concept:unassigned).
 *
 * Read-only against prod; no credentials required (course DB is publicly
 * readable). Produced the numbers in
 * agent/curriculum-sot/a.aside.p3.3-blast-radius.md (removed; git history pre-eef52f9) — re-run after any prod
 * deploy or re-tag to refresh that doc.
 *
 * USAGE:
 *   yarn audit:blast-radius
 *   yarn audit:blast-radius --url http://localhost:5984   # against local couch
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { LESSON_REGISTRY, CONCEPT_UNASSIGNED } from "../lib/curriculum";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUTS_V2 = resolve(__dirname, "..", "outputs-v2");

const COURSE_ID = "cb155bd265cd894d425dac227b00bd7d";

// Historical baseline: the pre-default-deny filter gated only the active
// lessons' concepts (hello-world bootstrapped). Keep in sync with nothing —
// this is a frozen reference point for before/after comparison.
const OLD_APP_GATED = ["concept:match:digraph", "concept:match:split_digraph"];

const BOOTSTRAPPED_LESSON = "hello-world";

async function main() {
  const urlFlag = process.argv.indexOf("--url");
  const baseUrl = urlFlag > -1 ? process.argv[urlFlag + 1] : process.env.COUCHDB_URL;
  if (!baseUrl) {
    console.error("CouchDB base URL required: pass --url <url> or set COUCHDB_URL (e.g. https://example.com/couch)");
    process.exit(2);
  }
  const db = `${baseUrl}/coursedb-${COURSE_ID}`;

  // ---- Gating model from the curriculum registry ----
  const conceptToLesson = new Map<string, { id: string; status: string }>();
  for (const lesson of LESSON_REGISTRY) {
    for (const tag of lesson.gatesConcepts) {
      conceptToLesson.set(tag, { id: lesson.id, status: lesson.status });
    }
  }
  const deferredConcepts = new Set<string>([CONCEPT_UNASSIGNED]);
  const activeConcepts = new Set<string>();
  for (const [tag, l] of conceptToLesson) {
    if (l.id === BOOTSTRAPPED_LESSON) continue; // always open
    (l.status === "active" ? activeConcepts : deferredConcepts).add(tag);
  }

  // ---- Fetch prod state ----
  console.log(`Fetching TAG + card docs from ${db} ...`);
  const tagRes = (await (
    await fetch(`${db}/_all_docs?startkey="TAG-"&endkey="TAG-￰"&include_docs=true`)
  ).json()) as { rows: Array<{ id: string; doc: { taggedCards?: string[] } }> };
  const cardRes = (await (
    await fetch(`${db}/_all_docs?startkey="c-"&endkey="c-￰"`)
  ).json()) as { rows: Array<{ id: string }> };

  const prodCardIds = new Set(cardRes.rows.map((r) => r.id));
  const prodTags = new Map<string, Set<string>>();
  for (const r of tagRes.rows) {
    const tag = r.id.slice("TAG-".length);
    for (const c of r.doc.taggedCards ?? []) {
      if (!prodTags.has(c)) prodTags.set(c, new Set());
      prodTags.get(c)!.add(tag);
    }
  }

  // ---- Local generated content ----
  const gen = JSON.parse(
    readFileSync(resolve(OUTPUTS_V2, "generated-cards.json"), "utf-8"),
  ) as { cards: Array<{ _id: string; tags: string[] }> };
  const newTags = new Map(gen.cards.map((c) => [c._id, new Set(c.tags)]));
  const genIds = new Set(newTags.keys());

  // ---- Inventory drift ----
  const prodOnly = [...prodCardIds].filter((i) => !genIds.has(i));
  const genOnly = [...genIds].filter((i) => !prodCardIds.has(i));
  console.log(`\n## Inventory`);
  console.log(`prod cards: ${prodCardIds.size} | local gen: ${genIds.size}`);
  console.log(`prod-only (stale after deploy): ${prodOnly.length}`, prodOnly.slice(0, 10));
  console.log(`gen-only (new on deploy): ${genOnly.length}`, genOnly.slice(0, 10));

  const gated = (tags: Set<string>, gateSet: ReadonlySet<string>) =>
    [...tags].filter((t) => gateSet.has(t));

  // ---- Phase A: new app, prod tags — deferred concepts newly suppressed ----
  console.log(`\n## Phase A — app default-deny ships (content unchanged)`);
  const oldGateSet = new Set(OLD_APP_GATED);
  const byConcept = new Map<string, { total: number; also: number; ex: string[] }>();
  for (const [card, tags] of prodTags) {
    if (!prodCardIds.has(card)) continue;
    const def = gated(tags, deferredConcepts);
    if (def.length === 0) continue;
    const alreadyGated = gated(tags, oldGateSet).length > 0;
    for (const t of def) {
      if (!byConcept.has(t)) byConcept.set(t, { total: 0, also: 0, ex: [] });
      const b = byConcept.get(t)!;
      b.total++;
      if (alreadyGated) b.also++;
      if (b.ex.length < 6) b.ex.push(card);
    }
  }
  for (const [t, b] of [...byConcept.entries()].sort((a, c) => c[1].total - a[1].total)) {
    const lesson = conceptToLesson.get(t);
    console.log(
      `${t} -> ${lesson ? `${lesson.id} (${lesson.status})` : "(no lesson)"}: ` +
        `${b.total} newly suppressed (${b.also} already active-lesson-gated)`,
    );
    console.log(`   e.g. ${b.ex.join(", ")}`);
  }

  // ---- Phase B: re-tag deploy under the new app, per user bucket ----
  console.log(`\n## Phase B — content re-tag deploys (new app live)`);
  const allGated = new Set([...activeConcepts, ...deferredConcepts]);
  const buckets: Array<[string, Set<string>]> = [
    ["no lessons passed", allGated],
    ["digraphs passed", new Set([...allGated].filter((t) => t !== "concept:match:digraph"))],
    [
      "digraphs + split-digraphs passed",
      new Set(
        [...allGated].filter(
          (t) => t !== "concept:match:digraph" && t !== "concept:match:split_digraph",
        ),
      ),
    ],
  ];
  for (const [bucket, gset] of buckets) {
    const suppressed = new Map<string, string[]>();
    const released = new Map<string, string[]>();
    for (const card of prodCardIds) {
      if (!genIds.has(card)) continue;
      const ot = prodTags.get(card) ?? new Set<string>();
      const nt = newTags.get(card)!;
      const wasGated = gated(ot, gset).length > 0;
      const isGated = gated(nt, gset).length > 0;
      if (wasGated === isGated) continue;
      const key = (isGated ? gated(nt, gset) : gated(ot, gset)).sort().join(",");
      const m = isGated ? suppressed : released;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(card);
    }
    console.log(`\n### user: ${bucket}`);
    if (suppressed.size === 0 && released.size === 0) console.log("  (no transitions)");
    for (const [k, cards] of [...suppressed.entries()].sort((a, b) => b[1].length - a[1].length))
      console.log(`  SUPPRESSED via [${k}]: ${cards.length} — e.g. ${cards.slice(0, 8).join(", ")}`);
    for (const [k, cards] of [...released.entries()].sort((a, b) => b[1].length - a[1].length))
      console.log(`  RELEASED (was [${k}]): ${cards.length} — e.g. ${cards.slice(0, 8).join(", ")}`);
  }

  // ---- Net suppression totals per bucket (after both phases) ----
  console.log(`\n## Net lesson-suppression totals (new app + new content)`);
  for (const [bucket, gset] of buckets) {
    let oldSup = 0;
    let newSup = 0;
    const oldGate =
      bucket === "no lessons passed"
        ? oldGateSet
        : bucket === "digraphs passed"
          ? new Set(["concept:match:split_digraph"])
          : new Set<string>();
    for (const [c, nt] of newTags) {
      const ot = prodTags.get(c) ?? new Set<string>();
      if (gated(ot, oldGate).length > 0) oldSup++;
      if (gated(nt, gset).length > 0) newSup++;
    }
    console.log(`${bucket}: ${oldSup} today → ${newSup} after, of ${newTags.size}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
