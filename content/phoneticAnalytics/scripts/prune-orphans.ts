/**
 * Production Orphan Pruner (destructive — opt-in)
 * ===============================================
 *
 * Deletes documents that exist in CouchDB but are NOT produced by the current
 * local generation (`outputs-v2/generated-cards.json`): orphan cards (c-*),
 * their displayable data (dd-*), and orphan TAG-* docs.
 *
 * WHY THIS EXISTS:
 *   `deploy-content.ts` is a merge-upsert — it updates/inserts every card in
 *   the current generation and REPLACE-prunes stale IDs out of TAG taggedCards
 *   arrays, but it NEVER deletes the underlying c- / dd- docs. When a regen
 *   drops a card ID (e.g. a WordSelection card whose only foils got re-homed
 *   into new `-vs-*` cards), the old doc lingers in prod: tag-unreachable, but
 *   resident. This script removes those orphans. It is the destructive
 *   counterpart to the read-only `audit:prod`, and uses the identical orphan
 *   definition (prod IDs minus local generation IDs).
 *
 * SAFETY:
 *   - DRY-RUN BY DEFAULT. Pass --confirm to actually delete.
 *   - Requires credentials (deletion can't run public-read).
 *   - Aborts if the orphan set exceeds --max (default 100) unless --max is
 *     raised — guards against nuking prod from a stale/empty generation file.
 *   - Deletes via _bulk_docs with _deleted:true (fetches live _rev first).
 *
 * USAGE:
 *   yarn prune:orphans -u admin -p <pw>                  # DRY RUN (default)
 *   yarn prune:orphans -u admin -p <pw> --confirm        # actually delete
 *   yarn prune:orphans -u admin -p <pw> --confirm --skip-tags
 *   yarn prune:orphans --url http://localhost:5984 -u admin -p password --confirm
 *
 * FLAGS:
 *   -u, --username   CouchDB admin username (or COUCHDB_USERNAME env)
 *   -p, --password   CouchDB admin password (or COUCHDB_PASSWORD env)
 *   --url            CouchDB base URL (required; or set COUCHDB_URL)
 *   --confirm        Actually delete (without this flag, dry-run only)
 *   --skip-tags      Do not delete orphan TAG-* docs (cards + dd only)
 *   --max N          Abort if orphan doc count exceeds N (default: 100)
 *
 * @see scripts/audit-prod-content.ts — read-only orphan detection (same diff)
 * @see scripts/deploy-content.ts — merge-upsert deploy (non-destructive)
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUTS_V2 = resolve(__dirname, "..", "outputs-v2");

const COURSE_ID = "cb155bd265cd894d425dac227b00bd7d";
const DB_NAME = `coursedb-${COURSE_ID}`;

interface CLIOptions {
  username: string;
  password: string;
  url: string;
  confirm: boolean;
  skipTags: boolean;
  max: number;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const opts: CLIOptions = {
    username: process.env.COUCHDB_USERNAME || "",
    password: process.env.COUCHDB_PASSWORD || "",
    url: process.env.COUCHDB_URL || "",
    confirm: false,
    skipTags: false,
    max: 100,
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
      case "--confirm":
        opts.confirm = true;
        break;
      case "--skip-tags":
        opts.skipTags = true;
        break;
      case "--max":
        opts.max = parseInt(args[++i], 10);
        break;
      case "-h":
      case "--help":
        console.log(readFileSync(fileURLToPath(import.meta.url), "utf-8").slice(0, 1500));
        process.exit(0);
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!opts.username || !opts.password) {
    console.error(
      "Error: CouchDB credentials required for deletion.\n" +
        "Provide via -u/-p flags or COUCHDB_USERNAME/COUCHDB_PASSWORD env vars.",
    );
    process.exit(1);
  }
  if (!opts.url) {
    console.error("CouchDB base URL required: pass --url <url> or set COUCHDB_URL (e.g. https://example.com/couch)");
    process.exit(2);
  }
  return opts;
}

interface AllDocsRow {
  id: string;
  value: { rev: string; deleted?: boolean };
}
interface AllDocsResponse {
  total_rows: number;
  rows: AllDocsRow[];
}
interface BulkDocsResponse {
  id: string;
  ok?: boolean;
  rev?: string;
  error?: string;
  reason?: string;
}

class CouchClient {
  private dbUrl: string;
  private auth: string;
  constructor(serverUrl: string, dbName: string, user: string, pass: string) {
    this.dbUrl = `${serverUrl.replace(/\/+$/, "")}/${dbName}`;
    this.auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  }
  private headers(): Record<string, string> {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: this.auth,
    };
  }
  async info(): Promise<{ doc_count: number; db_name: string }> {
    const res = await fetch(this.dbUrl, { headers: this.headers() });
    if (!res.ok) throw new Error(`db info failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as { doc_count: number; db_name: string };
  }
  async allDocsInRange(startkey: string, endkey: string): Promise<AllDocsResponse> {
    const params = new URLSearchParams({
      startkey: JSON.stringify(startkey),
      endkey: JSON.stringify(endkey),
      include_docs: "false",
    });
    const res = await fetch(`${this.dbUrl}/_all_docs?${params}`, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`_all_docs (${startkey}..${endkey}) failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as AllDocsResponse;
  }
  async bulkDelete(docs: Array<{ _id: string; _rev: string }>): Promise<BulkDocsResponse[]> {
    const body = { docs: docs.map((d) => ({ ...d, _deleted: true })) };
    const res = await fetch(`${this.dbUrl}/_bulk_docs`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`_bulk_docs delete failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as BulkDocsResponse[];
  }
}

interface GeneratedCardsFile {
  cards: Array<{ _id: string }>;
}

/** Local generation IDs: card (c-*) ids + their derived dd-* twins. */
function loadLocalIds(): { cardIds: Set<string>; ddIds: Set<string>; count: number } {
  const path = resolve(OUTPUTS_V2, "generated-cards.json");
  const file = JSON.parse(readFileSync(path, "utf-8")) as GeneratedCardsFile;
  const cardIds = new Set<string>();
  const ddIds = new Set<string>();
  for (const card of file.cards) {
    cardIds.add(card._id);
    ddIds.add(card._id.replace(/^c-/, "dd-"));
  }
  return { cardIds, ddIds, count: file.cards.length };
}

async function main() {
  const opts = parseArgs();

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  LettersPractice — Prod Orphan Pruner            ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nTarget: ${opts.url}/${DB_NAME}`);
  console.log(opts.confirm ? "Mode:   ⚠️  DELETE (--confirm set)" : "Mode:   DRY RUN (pass --confirm to delete)");

  const client = new CouchClient(opts.url, DB_NAME, opts.username, opts.password);

  console.log("\n🔌 Connecting...");
  const info = await client.info();
  console.log(`  ✅ ${info.db_name} (${info.doc_count} total docs)`);

  console.log("\n📂 Loading local generation output...");
  const local = loadLocalIds();
  console.log(`  ✅ ${local.count} cards in generated-cards.json`);
  // Sanity floor: an empty/truncated generation would make every prod card an
  // orphan. Refuse outright rather than rely solely on --max.
  if (local.count < 100) {
    console.error(
      `\n💥 Refusing to run: generated-cards.json has only ${local.count} cards ` +
        `(expected thousands). Regenerate (yarn gen:cards) before pruning.`,
    );
    process.exit(1);
  }

  console.log("\n📥 Fetching prod doc IDs...");
  const [prodCards, prodDDs, prodTags] = await Promise.all([
    client.allDocsInRange("c-", "c-\ufff0"),
    client.allDocsInRange("dd-", "dd-\ufff0"),
    client.allDocsInRange("TAG-", "TAG-\ufff0"),
  ]);
  console.log(`  cards: ${prodCards.rows.length}  dd: ${prodDDs.rows.length}  tags: ${prodTags.rows.length}`);

  // Orphan diff — identical definition to audit:prod.
  // Local TAG ids are TAG-<tagName> for every tag on every generated card; we
  // derive the set the same way deploy/audit do, then any prod TAG not in it is
  // an orphan tag.
  const localTagIds = new Set<string>();
  {
    // Re-read with tags to compute local tag id set (kept separate from the
    // lightweight id load above so the common path stays cheap).
    const path = resolve(OUTPUTS_V2, "generated-cards.json");
    const file = JSON.parse(readFileSync(path, "utf-8")) as { cards: Array<{ tags: string[] }> };
    for (const c of file.cards) for (const t of c.tags) localTagIds.add(`TAG-${t}`);
  }

  const orphanCards = prodCards.rows.filter((r) => !local.cardIds.has(r.id));
  const orphanDDs = prodDDs.rows.filter((r) => !local.ddIds.has(r.id));
  const orphanTags = opts.skipTags
    ? []
    : prodTags.rows.filter((r) => !localTagIds.has(r.id));

  const toDelete: Array<{ _id: string; _rev: string }> = [
    ...orphanCards.map((r) => ({ _id: r.id, _rev: r.value.rev })),
    ...orphanDDs.map((r) => ({ _id: r.id, _rev: r.value.rev })),
    ...orphanTags.map((r) => ({ _id: r.id, _rev: r.value.rev })),
  ];

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Orphans (in prod, not in current generation)");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Cards (c-*):     ${orphanCards.length}`);
  console.log(`  Data docs (dd-*): ${orphanDDs.length}`);
  console.log(`  Tags (TAG-*):    ${orphanTags.length}${opts.skipTags ? "  (skipped via --skip-tags)" : ""}`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Total to delete: ${toDelete.length}`);

  const sample = (rows: AllDocsRow[]) =>
    rows.slice(0, 20).map((r) => `    ${r.id}`).join("\n") +
    (rows.length > 20 ? `\n    ... and ${rows.length - 20} more` : "");
  if (orphanCards.length) console.log(`\n  Orphan cards:\n${sample(orphanCards)}`);
  if (orphanDDs.length) console.log(`\n  Orphan data docs:\n${sample(orphanDDs)}`);
  if (orphanTags.length) console.log(`\n  Orphan tags:\n${sample(orphanTags)}`);

  if (toDelete.length === 0) {
    console.log("\n✅ No orphans — nothing to do.\n");
    return;
  }

  if (toDelete.length > opts.max) {
    console.error(
      `\n💥 Refusing to delete ${toDelete.length} docs — exceeds --max (${opts.max}).\n` +
        `   If this is expected (e.g. a large re-tag), re-run with --max ${toDelete.length}.`,
    );
    process.exit(1);
  }

  if (!opts.confirm) {
    console.log("\n  ℹ️  DRY RUN — no changes made. Re-run with --confirm to delete.\n");
    return;
  }

  console.log(`\n🗑️  Deleting ${toDelete.length} docs...`);
  const results = await client.bulkDelete(toDelete);
  let ok = 0;
  const errors: string[] = [];
  for (const r of results) {
    if (r.ok || r.rev) ok++;
    else errors.push(`${r.id}: ${r.error} - ${r.reason}`);
  }
  console.log(`  ✅ ${ok} deleted` + (errors.length ? `, ❌ ${errors.length} failed` : ""));
  for (const e of errors.slice(0, 20)) console.log(`     - ${e}`);

  if (errors.length) {
    console.log(`\n  ⚠️  Completed with ${errors.length} error(s).\n`);
    process.exit(1);
  }
  console.log("\n  ✅ Prune complete.\n");
}

main().catch((err) => {
  console.error("\n💥 Prune failed:", err);
  process.exit(1);
});
