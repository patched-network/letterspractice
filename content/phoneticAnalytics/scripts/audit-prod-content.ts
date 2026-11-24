/**
 * Production Content Audit (read-only)
 * =====================================
 *
 * Compares the current local generation outputs against the live CouchDB
 * state to identify drift: orphan cards (c-*) and displayable data (dd-*),
 * stale taggedCards references inside TAG-* docs, missing/extra strategies,
 * and dd↔c pairing inconsistencies.
 *
 * READ-ONLY. Never writes to CouchDB.
 *
 * USAGE:
 *   yarn audit:prod -u admin -p <pw>
 *   yarn audit:prod --url http://localhost:5984 -u admin -p password   # audit local
 *   yarn audit:prod --json out/audit-report.json                       # dump machine-readable report
 *
 * FLAGS:
 *   -u, --username   CouchDB username (or COUCHDB_USERNAME env)
 *   -p, --password   CouchDB password (or COUCHDB_PASSWORD env)
 *   --url            CouchDB base URL (required; or set COUCHDB_URL)
 *   --json PATH      Write full orphan ID lists + per-tag drift to JSON
 *   --sample N       Print N sample IDs per orphan category (default: 10)
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  EXPECTED_STRATEGY_IDS,
  buildExpectedTopology,
  invertTagDocs,
  runCurriculumChecks,
  type CardRecord,
  type Finding,
} from "../lib/curriculum-checks";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUTS_V2 = resolve(__dirname, "..", "outputs-v2");

const COURSE_ID = "cb155bd265cd894d425dac227b00bd7d";
const DB_NAME = `coursedb-${COURSE_ID}`;

interface CLIOptions {
  username: string;
  password: string;
  url: string;
  jsonPath: string | null;
  sample: number;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const opts: CLIOptions = {
    username: process.env.COUCHDB_USERNAME || "",
    password: process.env.COUCHDB_PASSWORD || "",
    url: process.env.COUCHDB_URL || "",
    jsonPath: null,
    sample: 10,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "-u":
      case "--username":
        opts.username = args[++i];
        break;
      case "-p":
      case "--password":
        opts.password = args[++i];
        break;
      case "--url":
        opts.url = args[++i];
        break;
      case "--json":
        opts.jsonPath = args[++i];
        break;
      case "--sample":
        opts.sample = parseInt(args[++i], 10);
        break;
      case "-h":
      case "--help":
        console.log(readFileSync(fileURLToPath(import.meta.url), "utf-8").slice(0, 1100));
        process.exit(0);
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  // Credentials are optional: the prod course DB is public-read, so the audit
  // (read-only) runs credential-less — which is what CI uses for the P4.5
  // drift check. Warn so an accidental omission against a private target is
  // visible.
  if (!opts.username || !opts.password) {
    console.warn(
      "⚠️  No credentials supplied — running in public-read mode (no auth header)."
    );
  }
  if (!opts.url) {
    console.error("CouchDB base URL required: pass --url <url> or set COUCHDB_URL (e.g. https://example.com/couch)");
    process.exit(2);
  }
  return opts;
}

interface AllDocsRow {
  id: string;
  key: string;
  value: { rev: string; deleted?: boolean };
  doc?: { _id: string; _rev: string; taggedCards?: string[]; name?: string; [k: string]: unknown };
}
interface AllDocsResponse {
  total_rows: number;
  offset: number;
  rows: AllDocsRow[];
}

class CouchClient {
  private dbUrl: string;
  /** Basic-auth header, or null for public (credential-less) reads. */
  private auth: string | null;
  constructor(serverUrl: string, dbName: string, user: string, pass: string) {
    this.dbUrl = `${serverUrl.replace(/\/+$/, "")}/${dbName}`;
    this.auth =
      user && pass
        ? "Basic " + Buffer.from(`${user}:${pass}`).toString("base64")
        : null;
  }
  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/json" };
    if (this.auth) h.Authorization = this.auth;
    return h;
  }
  async allDocsInRange(startkey: string, endkey: string, includeDocs = false): Promise<AllDocsResponse> {
    const params = new URLSearchParams({
      startkey: JSON.stringify(startkey),
      endkey: JSON.stringify(endkey),
      include_docs: String(includeDocs),
    });
    const res = await fetch(`${this.dbUrl}/_all_docs?${params}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`_all_docs (${startkey}..${endkey}) failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as AllDocsResponse;
  }
  async info(): Promise<{ doc_count: number; db_name: string }> {
    const res = await fetch(this.dbUrl, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`db info failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as { doc_count: number; db_name: string };
  }
}

interface GeneratedCard {
  _id: string;
  questionType: string;
  tags: string[];
  data?: { target?: string; distractors?: string; [k: string]: unknown };
}
interface GeneratedCardsFile {
  cards: GeneratedCard[];
}

/** Local card structure, by id — enriches deployed cards for the trace check. */
interface LocalCardInfo {
  questionType: string;
  /** WordSelection target + distractor words (for distractor-gate trace). */
  words?: string[];
}

function loadLocalCards(): {
  cardIds: Set<string>;
  ddIds: Set<string>;
  tagIds: Set<string>;
  cardCount: number;
  infoById: Map<string, LocalCardInfo>;
} {
  const path = resolve(OUTPUTS_V2, "generated-cards.json");
  const file = JSON.parse(readFileSync(path, "utf-8")) as GeneratedCardsFile;
  const cardIds = new Set<string>();
  const ddIds = new Set<string>();
  const tagIds = new Set<string>();
  const infoById = new Map<string, LocalCardInfo>();
  for (const card of file.cards) {
    cardIds.add(card._id);
    ddIds.add(card._id.replace(/^c-/, "dd-"));
    for (const t of card.tags) tagIds.add(`TAG-${t}`);
    const info: LocalCardInfo = { questionType: card.questionType };
    if (card.questionType === "WordSelection" && card.data) {
      const words: string[] = [];
      if (card.data.target) words.push(card.data.target);
      if (card.data.distractors)
        words.push(...card.data.distractors.split(",").filter(Boolean));
      info.words = words;
    }
    infoById.set(card._id, info);
  }
  return { cardIds, ddIds, tagIds, cardCount: file.cards.length, infoById };
}

/** word → its GPC ids, from teaching-words.json (WordSelection trace). */
function loadWordToGpcs(): Map<string, string[]> {
  const path = resolve(OUTPUTS_V2, "teaching-words.json");
  const file = JSON.parse(readFileSync(path, "utf-8")) as {
    words: { word: string; gpcs: string[] }[];
  };
  const map = new Map<string, string[]>();
  for (const w of file.words) map.set(w.word, w.gpcs);
  return map;
}

function categorizeByPrefix(ids: string[]): Map<string, string[]> {
  // Categorize c-*/dd-* IDs by their second-segment prefix (after c- / dd-).
  // e.g. c-spelling-sit → "spelling", c-ml-cat-0 → "ml", c-intro-s-S → "intro"
  const buckets = new Map<string, string[]>();
  for (const id of ids) {
    const m = id.match(/^(?:c|dd)-([a-z0-9]+)/i);
    const key = m ? m[1] : "other";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(id);
  }
  return buckets;
}

interface AuditReport {
  generatedAt: string;
  target: string;
  totals: {
    prod: { cards: number; dataDocs: number; tags: number; strategies: number; uploadMetadocs: number; totalDocs: number };
    local: { cards: number; dataDocs: number; tags: number; strategies: number };
  };
  orphans: {
    cards: { count: number; byPrefix: Record<string, number>; sample: string[]; all: string[] };
    dataDocs: { count: number; byPrefix: Record<string, number>; sample: string[]; all: string[] };
    tags: { count: number; sample: string[]; all: string[] };
  };
  pairing: {
    cardsWithoutDataDoc: string[];
    dataDocsWithoutCard: string[];
  };
  strategies: {
    expected: string[];
    inProd: string[];
    missingFromProd: string[];
    extraInProd: string[];
  };
  tagDrift: {
    totalTagsAudited: number;
    tagsWithStaleRefs: number;
    totalStaleRefs: number;
    worstOffenders: Array<{ tag: string; staleCount: number; totalCount: number; pctStale: number }>;
  };
  curriculumFindings: Finding[];
}

async function main() {
  const opts = parseArgs();

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  LettersPractice — Prod Content Audit (R/O)     ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nTarget: ${opts.url}/${DB_NAME}`);

  const client = new CouchClient(opts.url, DB_NAME, opts.username, opts.password);

  console.log("\n🔌 Connecting...");
  const info = await client.info();
  console.log(`  ✅ ${info.db_name} (${info.doc_count} total docs)`);

  console.log("\n📂 Loading local generation output...");
  const local = loadLocalCards();
  console.log(`  ✅ ${local.cardCount} cards / ${local.ddIds.size} dd / ${local.tagIds.size} tags`);

  console.log("\n📥 Fetching prod doc IDs...");
  const [prodCards, prodDDs, prodTags, prodStrats, prodUploads] = await Promise.all([
    client.allDocsInRange("c-", "c-\ufff0"),
    client.allDocsInRange("dd-", "dd-\ufff0"),
    client.allDocsInRange("TAG-", "TAG-\ufff0", true), // need docs for taggedCards
    client.allDocsInRange("NAVIGATION_STRATEGY-", "NAVIGATION_STRATEGY-\ufff0"),
    client.allDocsInRange("cards-upload-", "cards-upload-\ufff0"),
  ]);
  console.log(`  cards:       ${prodCards.rows.length}`);
  console.log(`  data docs:   ${prodDDs.rows.length}`);
  console.log(`  tags:        ${prodTags.rows.length}`);
  console.log(`  strategies:  ${prodStrats.rows.length}`);
  console.log(`  upload runs: ${prodUploads.rows.length}`);

  // ---- Orphan diff ----
  const prodCardIds = new Set(prodCards.rows.map((r) => r.id));
  const prodDDIds = new Set(prodDDs.rows.map((r) => r.id));
  const prodTagIds = new Set(prodTags.rows.map((r) => r.id));
  const prodStratIds = new Set(prodStrats.rows.map((r) => r.id));

  const orphanCards = [...prodCardIds].filter((id) => !local.cardIds.has(id)).sort();
  const orphanDDs = [...prodDDIds].filter((id) => !local.ddIds.has(id)).sort();
  const orphanTags = [...prodTagIds].filter((id) => !local.tagIds.has(id)).sort();

  // dd ↔ c pairing (within prod, after deleting orphans wouldn't help if they're already mismatched)
  const expectedDDForProdCards = new Set([...prodCardIds].map((id) => id.replace(/^c-/, "dd-")));
  const cardsWithoutDD = [...prodCardIds].filter((id) => !prodDDIds.has(id.replace(/^c-/, "dd-"))).sort();
  const ddsWithoutCard = [...prodDDIds].filter((id) => !prodCardIds.has(id.replace(/^dd-/, "c-"))).sort();

  // Strategies
  const missingStrategies = EXPECTED_STRATEGY_IDS.filter((id) => !prodStratIds.has(id));
  const extraStrategies = [...prodStratIds].filter(
    (id) => !(EXPECTED_STRATEGY_IDS as readonly string[]).includes(id),
  );

  // Tag drift: for surviving (in-local) tags, how many of their taggedCards are orphans?
  const orphanCardSet = new Set(orphanCards);
  const driftRows: Array<{ tag: string; staleCount: number; totalCount: number; pctStale: number }> = [];
  let totalStaleRefs = 0;
  let tagsWithStaleRefs = 0;
  for (const row of prodTags.rows) {
    if (!row.doc) continue;
    if (!local.tagIds.has(row.id)) continue; // skip orphan tags themselves
    const tagged: string[] = (row.doc.taggedCards as string[]) || [];
    const stale = tagged.filter((cid) => orphanCardSet.has(cid)).length;
    if (stale > 0) {
      tagsWithStaleRefs++;
      totalStaleRefs += stale;
      driftRows.push({
        tag: row.id,
        staleCount: stale,
        totalCount: tagged.length,
        pctStale: tagged.length ? (stale / tagged.length) * 100 : 0,
      });
    }
  }
  driftRows.sort((a, b) => b.staleCount - a.staleCount);

  // ---- Categorize orphans ----
  const cardBuckets = categorizeByPrefix(orphanCards);
  const ddBuckets = categorizeByPrefix(orphanDDs);

  // ---- Print report ----
  const SAMPLE = opts.sample;
  const fmt = (n: number) => n.toLocaleString();

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Drift Summary");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Orphan cards (in prod, not in local):     ${fmt(orphanCards.length)}`);
  console.log(`  Orphan data docs:                          ${fmt(orphanDDs.length)}`);
  console.log(`  Orphan tags:                               ${fmt(orphanTags.length)}`);
  console.log(`  Cards missing matching dd (in prod):       ${fmt(cardsWithoutDD.length)}`);
  console.log(`  Data docs missing matching c (in prod):    ${fmt(ddsWithoutCard.length)}`);

  console.log("\n  Orphan cards by prefix:");
  for (const [prefix, ids] of [...cardBuckets].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`    c-${prefix}-*  → ${fmt(ids.length).padStart(5)}  e.g. ${ids.slice(0, 3).join(", ")}`);
  }
  console.log("\n  Orphan data docs by prefix:");
  for (const [prefix, ids] of [...ddBuckets].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`    dd-${prefix}-* → ${fmt(ids.length).padStart(5)}  e.g. ${ids.slice(0, 3).join(", ")}`);
  }

  if (orphanTags.length) {
    console.log("\n  Orphan tags:");
    for (const id of orphanTags.slice(0, SAMPLE)) console.log(`    ${id}`);
    if (orphanTags.length > SAMPLE) console.log(`    ... and ${orphanTags.length - SAMPLE} more`);
  }

  console.log("\n  Strategy alignment:");
  console.log(`    Expected: ${EXPECTED_STRATEGY_IDS.length}  In prod: ${prodStratIds.size}`);
  if (missingStrategies.length) {
    console.log(`    ❌ Missing from prod (${missingStrategies.length}):`);
    for (const id of missingStrategies) console.log(`       - ${id}`);
  } else {
    console.log(`    ✅ All expected strategies present`);
  }
  if (extraStrategies.length) {
    console.log(`    ⚠️  Extra in prod (${extraStrategies.length}):`);
    for (const id of extraStrategies) console.log(`       - ${id}`);
  }

  console.log("\n  Tag drift (surviving tags pointing at orphan cards):");
  console.log(`    Tags with stale refs: ${tagsWithStaleRefs} / ${local.tagIds.size} local tags`);
  console.log(`    Total stale refs:     ${totalStaleRefs}`);
  if (driftRows.length) {
    console.log(`    Worst offenders:`);
    for (const row of driftRows.slice(0, SAMPLE)) {
      console.log(
        `      ${row.tag}  → ${row.staleCount}/${row.totalCount} stale (${row.pctStale.toFixed(0)}%)`
      );
    }
  }

  if (cardsWithoutDD.length || ddsWithoutCard.length) {
    console.log("\n  Pairing anomalies (broken c↔dd links inside prod):");
    if (cardsWithoutDD.length) {
      console.log(`    Cards missing their dd doc (${cardsWithoutDD.length}):`);
      for (const id of cardsWithoutDD.slice(0, SAMPLE)) console.log(`      ${id}`);
      if (cardsWithoutDD.length > SAMPLE) console.log(`      ... and ${cardsWithoutDD.length - SAMPLE} more`);
    }
    if (ddsWithoutCard.length) {
      console.log(`    Data docs with no matching card (${ddsWithoutCard.length}):`);
      for (const id of ddsWithoutCard.slice(0, SAMPLE)) console.log(`      ${id}`);
      if (ddsWithoutCard.length > SAMPLE) console.log(`      ... and ${ddsWithoutCard.length - SAMPLE} more`);
    }
  }

  // ---- Curriculum consistency checks (P4.1) ----
  // Observed cards: deployed tag sets (inverted from prod TAG docs), enriched
  // with local card structure (questionType/words) for the WordSelection
  // distractor-gate trace. Cards present in prod but absent locally keep their
  // deployed tags and fall back to tag-only tracing.
  const deployedTags = invertTagDocs(
    prodTags.rows
      .filter((r) => r.doc)
      .map((r) => ({
        name: r.id.replace(/^TAG-/, ""),
        taggedCards: (r.doc!.taggedCards as string[]) || [],
      })),
  );
  const wordToGpcs = loadWordToGpcs();
  const observedCards: CardRecord[] = [];
  for (const [cardId, tags] of deployedTags) {
    if (!prodCardIds.has(cardId)) continue; // only real, present cards
    const localInfo = local.infoById.get(cardId);
    observedCards.push({
      id: cardId,
      tags,
      questionType: localInfo?.questionType,
      words: localInfo?.words,
    });
  }
  const conceptTagNames = prodTags.rows
    .map((r) => r.id.replace(/^TAG-/, ""))
    .filter((name) => name.startsWith("concept:"));

  const findings = runCurriculumChecks(buildExpectedTopology(), {
    cards: observedCards,
    conceptTagNames,
    strategies: [...prodStratIds].map((id) => ({ id })),
    wordToGpcs,
  });

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Curriculum Consistency (P4.1)");
  console.log("═══════════════════════════════════════════════════");
  const sev = { error: "❌", warn: "⚠️ ", info: "✅" } as const;
  for (const f of findings) {
    console.log(`  ${sev[f.severity]} [${f.check}] ${f.message}`);
    if (f.items && f.items.length) {
      for (const item of f.items.slice(0, SAMPLE)) console.log(`       • ${item}`);
      if (f.items.length > SAMPLE)
        console.log(`       ... and ${f.items.length - SAMPLE} more`);
    }
  }
  const errCount = findings.filter((f) => f.severity === "error").length;
  const warnCount = findings.filter((f) => f.severity === "warn").length;
  console.log(`\n  → ${errCount} error(s), ${warnCount} warning(s)`);

  // ---- JSON dump ----
  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    target: `${opts.url}/${DB_NAME}`,
    totals: {
      prod: {
        cards: prodCards.rows.length,
        dataDocs: prodDDs.rows.length,
        tags: prodTags.rows.length,
        strategies: prodStrats.rows.length,
        uploadMetadocs: prodUploads.rows.length,
        totalDocs: info.doc_count,
      },
      local: {
        cards: local.cardIds.size,
        dataDocs: local.ddIds.size,
        tags: local.tagIds.size,
        strategies: EXPECTED_STRATEGY_IDS.length,
      },
    },
    orphans: {
      cards: {
        count: orphanCards.length,
        byPrefix: Object.fromEntries([...cardBuckets].map(([k, v]) => [k, v.length])),
        sample: orphanCards.slice(0, SAMPLE),
        all: orphanCards,
      },
      dataDocs: {
        count: orphanDDs.length,
        byPrefix: Object.fromEntries([...ddBuckets].map(([k, v]) => [k, v.length])),
        sample: orphanDDs.slice(0, SAMPLE),
        all: orphanDDs,
      },
      tags: {
        count: orphanTags.length,
        sample: orphanTags.slice(0, SAMPLE),
        all: orphanTags,
      },
    },
    pairing: {
      cardsWithoutDataDoc: cardsWithoutDD,
      dataDocsWithoutCard: ddsWithoutCard,
    },
    strategies: {
      expected: [...EXPECTED_STRATEGY_IDS],
      inProd: [...prodStratIds].sort(),
      missingFromProd: missingStrategies,
      extraInProd: extraStrategies,
    },
    tagDrift: {
      totalTagsAudited: local.tagIds.size,
      tagsWithStaleRefs,
      totalStaleRefs,
      worstOffenders: driftRows.slice(0, 50),
    },
    curriculumFindings: findings,
  };

  if (opts.jsonPath) {
    const outPath = resolve(opts.jsonPath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`\n📝 Wrote full report to ${outPath}`);
  } else {
    console.log(`\n💡 Pass --json <path> to dump the full orphan ID lists for downstream tooling.`);
  }

  console.log("\n✅ Audit complete (read-only, no writes performed).\n");
}

main().catch((err) => {
  console.error("\n💥 Audit failed:", err);
  process.exit(1);
});
