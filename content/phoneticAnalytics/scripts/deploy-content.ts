/**
 * CouchDB Upload Script (P4)
 * ============================
 *
 * Uploads generated card data and strategy configurations to CouchDB.
 * Creates DisplayableData (dd-*), Card (c-*), TAG, and NAVIGATION_STRATEGY documents.
 *
 * INPUTS:
 *   - outputs-v2/generated-cards.json          — card data from P3
 *   - outputs-v2/strategy-configs/hierarchy-gpc.json
 *   - outputs-v2/strategy-configs/hierarchy-concept.json
 *   - outputs-v2/strategy-configs/hierarchy-ui.json
 *   - outputs-v2/strategy-configs/interference.json
 *   - outputs-v2/strategy-configs/priority.json
 *   - outputs-v2/strategy-configs/tag-registry.json
 *
 * OUTPUTS (in CouchDB):
 *   - dd-*                     — DisplayableData documents (question content)
 *   - c-*                      — Card documents (links data to views, carries ELO)
 *   - TAG-*                    — Tag documents (card groupings for navigation)
 *   - NAVIGATION_STRATEGY-*    — Strategy documents (hierarchy, interference, etc.)
 *   - cards-upload-{ISO date}  — Upload metadoc (run metadata, stats, never deleted)
 *   - CourseConfig.contentVersion — "<git sha> <ISO date>" of the last deploy; the
 *     framework stamps it on every pipeline run, so learner records show content changes
 *
 * USAGE:
 *   yarn upload:cards -u admin -p password
 *   yarn upload:cards --dry-run
 *   COUCHDB_USERNAME=admin COUCHDB_PASSWORD=pass yarn upload:cards
 *
 * FLAGS:
 *   -u, --username       CouchDB admin username (or COUCHDB_USERNAME env)
 *   -p, --password       CouchDB admin password (or COUCHDB_PASSWORD env)
 *   --url                CouchDB server base URL (required; or set COUCHDB_URL)
 *   --dry-run            Show what would be uploaded without writing
 *   --skip-strategies    Skip strategy document upload
 *   --skip-cards         Skip card/tag document upload
 *   --skip-courseconfig   Skip CourseConfig update
 *   --batch-size         Bulk docs batch size (default: 100)
 *   --rebase-live-elo    Shift each existing card's live `elo` by its seed change
 *
 * SAFETY:
 *   - Idempotent: deterministic IDs mean re-run = upsert, not duplicate
 *   - Fetches existing _rev values before writing to handle updates
 *   - Card docs: `seedElo` is re-stamped from the pipeline every run, but the
 *     live `elo` of an existing card is carried over (never reset by a
 *     redeploy), its tag ranks re-keyed to the card's current tags. New
 *     cards start with `elo = seedElo`.
 *   - Seeds are deterministic per card id (`seedVersion` 2), so a seed only
 *     moves when the difficulty model or the card changes. With
 *     `--rebase-live-elo` that move is carried onto the live `elo`
 *     (live += new seed − previous seed; counts untouched, so drift is kept).
 *     Without it, moved seeds are only reported.
 *   - Dry-run mode for previewing changes
 *   - Upload metadocs use unique time-based IDs (cards-upload-{ISO date})
 *     so subsequent runs NEVER overwrite or delete previous metadocs
 *
 * METADOC:
 *   Each non-dry-run execution writes a `cards-upload-{ISO date}` document
 *   containing the full run stats, input file metadata, CLI options, and
 *   duration. These accumulate over time and are visible in the admin
 *   content explorer at /admin/content → Upload History tab.
 *
 * LOCAL DEV:
 *   For local development, use seed-local-db.ts instead — it bootstraps the
 *   database (design docs, lookup entry) then delegates to this script:
 *     yarn db:seed
 *
 * @see scripts/seed-local-db.ts — local CouchDB bootstrap (calls this script)
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  asGpcId,
  gpcIntroCardId,
  digraphGpcIntroCardId,
  splitDigraphIntroCardId,
  whoSaidThatCardId,
} from "../lib/content-labelling";
import {
  computeInitialElo,
  gpcSpellingOdds,
  NO_JITTER,
  seededRng,
  type SeedContext,
} from "../lib/card-elo";

// ============================================================
// Constants
// ============================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUTS_V2 = resolve(__dirname, "..", "outputs-v2");
const STRATEGY_DIR = resolve(OUTPUTS_V2, "strategy-configs");

const COURSE_ID = "cb155bd265cd894d425dac227b00bd7d";
const DB_NAME = `coursedb-${COURSE_ID}`;
const CODE_COURSE = "ExampleCourse";
const AUTHOR = "content-pipeline-v1";
const SOURCE_REF = "gen:content-pipeline-v1";

/**
 * CourseConfig.qaUsernamePattern. LP usernames are the signup email, and
 * QA / speedrun accounts are on patched.network: their responses move their
 * own ELO but never card ELO.
 */
const QA_USERNAME_PATTERN = "@patched\\.network$";

/**
 * Card docs' `seedVersion`. 2: seeds are deterministic per card id and carry
 * the SQ spelling-ambiguity term. Docs without it hold v1 seeds (Math.random
 * jitter, no ambiguity term).
 */
const SEED_VERSION = 2;

const SEED_CONTEXT: SeedContext = {
  spellingOdds: gpcSpellingOdds(
    JSON.parse(readFileSync(resolve(OUTPUTS_V2, "teaching-words.json"), "utf-8")).words,
  ),
};

// Document type constants (matching framework's DocType enum values)
const DocTypes = {
  CARD: "CARD",
  DISPLAYABLE_DATA: "DISPLAYABLE_DATA",
  TAG: "TAG",
  NAVIGATION_STRATEGY: "NAVIGATION_STRATEGY",
} as const;

// Navigator implementing class names (matching framework's Navigators enum)
const Navigators = {
  HIERARCHY: "hierarchyDefinition",
  INTERFERENCE: "interferenceMitigator",
  RELATIVE_PRIORITY: "relativePriority",
  LETTER_GATING: "letterGatingFilter",
  LESSON_GATE: "lessonGateFilter",
  INTRO_GATE: "introGateFilter",
  SKILL_STALENESS: "skillStalenessFilter",
  RECENT_WEAKNESS: "recentWeaknessFilter",
  PRESCRIBED: "prescribed",
  SKILL_PRESSURE: "skillPressure",
} as const;

// Question type → view name mapping
const QUESTION_VIEW_MAP: Record<
  string,
  { dataShape: string; questionType: string; viewName: string }
> = {
  SpellingQuestion: {
    dataShape: `${CODE_COURSE}.datashape.SpellingQuestion`,
    questionType: `${CODE_COURSE}.question.SpellingQuestion`,
    viewName: "SpellingQuestionView",
  },
  WhoSaidThat: {
    dataShape: `${CODE_COURSE}.datashape.WhoSaidThat`,
    questionType: `${CODE_COURSE}.question.WhoSaidThat`,
    viewName: "WhoSaidThatView",
  },
  WordSelection: {
    dataShape: `${CODE_COURSE}.datashape.WordSelection`,
    questionType: `${CODE_COURSE}.question.WordSelection`,
    viewName: "WordSelectionView",
  },
  MissingLetters: {
    dataShape: `${CODE_COURSE}.datashape.MissingLetters`,
    questionType: `${CODE_COURSE}.question.MissingLetters`,
    viewName: "MissingLettersView",
  },
  GpcIntro: {
    dataShape: `${CODE_COURSE}.datashape.GpcIntro`,
    questionType: `${CODE_COURSE}.question.GpcIntro`,
    viewName: "GpcIntroView",
  },
  DigraphGpcIntro: {
    dataShape: `${CODE_COURSE}.datashape.DigraphGpcIntro`,
    questionType: `${CODE_COURSE}.question.DigraphGpcIntro`,
    viewName: "DigraphGpcIntroView",
  },
  SplitDigraphIntro: {
    dataShape: `${CODE_COURSE}.datashape.SplitDigraphIntro`,
    questionType: `${CODE_COURSE}.question.SplitDigraphIntro`,
    viewName: "SplitDigraphIntroView",
  },
  SightWordIntro: {
    dataShape: `${CODE_COURSE}.datashape.SightWordIntro`,
    questionType: `${CODE_COURSE}.question.SightWordIntro`,
    viewName: "SightWordIntroView",
  },
};

// Field definitions per question type (for DisplayableData.data Field[] construction)
// Only non-attachment fields (matching prepareNote55 filtering)
const QUESTION_FIELDS: Record<string, string[]> = {
  SpellingQuestion: ["word"],
  WhoSaidThat: ["targetPhoneme", "correctLetter", "gpcId", "distractors"],
  WordSelection: ["target", "distractors", "instruction", "audioUrls"],
  MissingLetters: ["word", "blanks"],
  GpcIntro: ["gpcId", "letter", "phoneme", "onsetWords", "coreWords", "codaWords"],
  DigraphGpcIntro: ["gpcId", "grapheme", "phoneme", "onsetWords", "codaWords"],
  SplitDigraphIntro: ["gpcId", "vowel", "phoneme", "words"],
  SightWordIntro: ["gpcId", "word", "family", "followUp"],
};

// ============================================================
// Types
// ============================================================

interface GeneratedCard {
  _id: string;
  questionType: "SpellingQuestion" | "WhoSaidThat" | "WordSelection" | "MissingLetters" | "GpcIntro" | "DigraphGpcIntro" | "SplitDigraphIntro" | "SightWordIntro";
  data: Record<string, unknown>;
  tags: string[];
  meta: {
    sourceWord?: string;
    sourceGpcId?: string;
    /** Sight-word intros: 0 = first in the drip (the prescribed order) */
    dripRank?: number;
    generationReason: string;
    generatedAt: string;
  };
}

interface GeneratedCardsFile {
  meta: {
    generatedAt: string;
    generatedBy: string;
    stats: Record<string, number>;
    errors: number;
    warnings: number;
  };
  cards: GeneratedCard[];
}

interface Field {
  name: string;
  data: unknown;
}

interface CouchDoc {
  _id: string;
  _rev?: string;
  [key: string]: unknown;
}

/** Mirrors @vue-skuilder/common `CourseElo` (this package has no framework dep). */
interface EloRank {
  score: number;
  count: number;
}
interface CourseElo {
  global: EloRank;
  tags: Record<string, EloRank>;
  misc: Record<string, EloRank>;
}

/** Structural check matching @vue-skuilder/common isCourseElo (global + tags). */
function isCourseEloShaped(x: unknown): x is CourseElo {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  const g = e.global as Record<string, unknown> | undefined;
  return (
    !!g && typeof g === "object" && typeof g.score === "number" && typeof g.count === "number" &&
    !!e.tags && typeof e.tags === "object"
  );
}

/**
 * A redeployed card's live `elo` with its tag ranks re-keyed to the card's
 * current tags. The framework's plain ELO update grades exactly the keys of
 * `elo.tags`, so carrying them over unchanged would freeze a card's tags at
 * its first deploy.
 *
 * - tag still on the card: live rank kept
 * - tag added since the last deploy: new rank, count 0, at the live global
 *   score (as the framework initialises a missing card-side rank)
 * - tag in the previous `seedElo` but no longer on the card: dropped
 * - any other count-0 key: dropped. Only a deploy writes count-0 ranks (the
 *   validator makes learner-created ranks start at count 1), so it is an
 *   authored tag removed before cards carried `seedElo`
 * - any other key: kept, a rank a learner's per-tag response created
 */
function reconcileEloTags(
  live: CourseElo,
  tags: string[],
  prevSeedTags: string[],
): { elo: CourseElo; added: string[]; dropped: string[] } {
  const current = new Set(tags);
  const removed = new Set(prevSeedTags.filter((t) => !current.has(t)));
  const out: Record<string, EloRank> = {};
  const added: string[] = [];
  const dropped: string[] = [];

  for (const tag of tags) {
    if (live.tags[tag]) {
      out[tag] = live.tags[tag];
    } else {
      out[tag] = { score: live.global.score, count: 0 };
      added.push(tag);
    }
  }
  for (const [tag, rank] of Object.entries(live.tags)) {
    if (current.has(tag)) continue;
    if (removed.has(tag) || rank.count === 0) {
      dropped.push(tag);
    } else {
      out[tag] = rank;
    }
  }

  return { elo: { ...live, tags: out }, added, dropped };
}

/** How far a redeploy moves a card's seed: global, and per tag on the card. */
interface SeedShift {
  global: number;
  tags: Record<string, number>;
}

/**
 * The authored change between an existing card's seed and its new one.
 *
 * - v2 → v2: new seed − previous seed. Both are deterministic, so this is
 *   exactly the change in the difficulty model (0 for an unchanged card).
 * - v1 (no `seedVersion`) → v2: v1 jitter was Math.random, so the seeds'
 *   difference would carry noise. Instead compare the new model against the
 *   v1 model, both jitter-free: the v1 model is this one without the SQ
 *   ambiguity term, the only model change since. Remove this branch once
 *   every deployed card is v2.
 */
function seedShift(card: GeneratedCard, newSeed: CourseElo, existing: CouchDoc): SeedShift {
  const prevSeed = existing.seedElo;
  if (existing.seedVersion === undefined || !isCourseEloShaped(prevSeed)) {
    const d =
      computeInitialElo(card, NO_JITTER, SEED_CONTEXT) - computeInitialElo(card, NO_JITTER);
    return { global: d, tags: Object.fromEntries(card.tags.map((t) => [t, d])) };
  }
  const global = newSeed.global.score - prevSeed.global.score;
  const tags: Record<string, number> = {};
  for (const [tag, rank] of Object.entries(newSeed.tags)) {
    const prev = prevSeed.tags[tag];
    tags[tag] = prev ? rank.score - prev.score : global;
  }
  return { global, tags };
}

/** Live `elo` moved by a seed shift. Counts are untouched, so learned drift is kept. */
function applySeedShift(live: CourseElo, shift: SeedShift): CourseElo {
  const tags = { ...live.tags };
  for (const [tag, d] of Object.entries(shift.tags)) {
    if (tags[tag]) tags[tag] = { ...tags[tag], score: tags[tag].score + d };
  }
  return { ...live, global: { ...live.global, score: live.global.score + shift.global }, tags };
}

interface BulkDocsResponse {
  id: string;
  ok?: boolean;
  rev?: string;
  error?: string;
  reason?: string;
}

interface AllDocsResponse {
  total_rows: number;
  offset: number;
  rows: Array<{
    id: string;
    key: string;
    value: { rev: string; deleted?: boolean };
    doc?: CouchDoc;
  }>;
}

interface CLIOptions {
  username: string;
  password: string;
  url: string;
  dryRun: boolean;
  skipStrategies: boolean;
  skipCards: boolean;
  skipCourseConfig: boolean;
  batchSize: number;
  mergeTags: boolean;
  rebaseLiveElo: boolean;
}

interface UploadStats {
  strategiesCreated: number;
  strategiesUpdated: number;
  cardsCreated: number;
  cardsUpdated: number;
  dataDocsCreated: number;
  dataDocsUpdated: number;
  tagsCreated: number;
  tagsUpdated: number;
  errors: string[];
  courseConfigUpdated: boolean;
}

// ============================================================
// CLI Argument Parsing
// ============================================================

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    username: process.env.COUCHDB_USERNAME || "",
    password: process.env.COUCHDB_PASSWORD || "",
    url: process.env.COUCHDB_URL || "",
    dryRun: false,
    skipStrategies: false,
    skipCards: false,
    skipCourseConfig: false,
    batchSize: 100,
    mergeTags: false,
    rebaseLiveElo: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "-u":
      case "--username":
        options.username = args[++i];
        break;
      case "-p":
      case "--password":
        options.password = args[++i];
        break;
      case "--url":
        options.url = args[++i];
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--skip-strategies":
        options.skipStrategies = true;
        break;
      case "--skip-cards":
        options.skipCards = true;
        break;
      case "--skip-courseconfig":
        options.skipCourseConfig = true;
        break;
      case "--batch-size":
        options.batchSize = parseInt(args[++i], 10);
        break;
      case "--merge-tags":
        options.mergeTags = true;
        break;
      case "--rebase-live-elo":
        options.rebaseLiveElo = true;
        break;
      case "-h":
      case "--help":
        console.log(`
Usage: yarn upload:cards [options]

Options:
  -u, --username       CouchDB admin username (or COUCHDB_USERNAME env var)
  -p, --password       CouchDB admin password (or COUCHDB_PASSWORD env var)
  --url                CouchDB base URL (required; or set COUCHDB_URL)
  --dry-run            Preview changes without writing to DB
  --skip-strategies    Skip strategy document upload
  --skip-cards         Skip card and tag document upload
  --skip-courseconfig   Skip CourseConfig update
  --batch-size N       Bulk docs batch size (default: 100)
  --merge-tags         Union taggedCards with existing values instead of
                       replacing (legacy: preserves card IDs not produced
                       by the current generation, e.g. MCP-authored cards).
                       Default is replace, which prevents stale-ref drift.
  --rebase-live-elo    Shift each existing card's live elo by its seed change
                       (new seed − previous seed), keeping learned drift.
                       Without it, moved seeds are reported, not applied.
  -h, --help           Show this help message
`);
        process.exit(0);
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!options.username || !options.password) {
    console.error(
      "Error: CouchDB credentials required.\n" +
        "Provide via -u/-p flags or COUCHDB_USERNAME/COUCHDB_PASSWORD env vars.",
    );
    process.exit(1);
  }

  if (!options.url) {
    console.error("CouchDB base URL required: pass --url <url> or set COUCHDB_URL (e.g. https://example.com/couch)");
    process.exit(2);
  }
  return options;
}

// ============================================================
// CouchDB HTTP Client
// ============================================================

class CouchClient {
  private baseUrl: string;
  private dbUrl: string;
  private authHeader: string;

  constructor(
    serverUrl: string,
    dbName: string,
    username: string,
    password: string,
  ) {
    // Ensure no trailing slash on server URL
    this.baseUrl = serverUrl.replace(/\/+$/, "");
    this.dbUrl = `${this.baseUrl}/${dbName}`;
    this.authHeader =
      "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  }

  private async request(
    path: string,
    method: string = "GET",
    body?: unknown,
  ): Promise<unknown> {
    const url = path.startsWith("http") ? path : `${this.dbUrl}/${path}`;
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const options: RequestInit = { method, headers };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      // Throw on every non-2xx, including 409. Previously 409 was silently
      // allowed through so callers could inspect a conflict body, but no
      // caller actually did — strategy/CourseConfig/metadoc puts treated the
      // conflict response as success and silently dropped the write.
      // _bulk_docs returns 200 with per-doc errors inside the body, so this
      // does not affect bulk upload error handling.
      const text = await response.text();
      throw new Error(
        `CouchDB ${method} ${url} failed: ${response.status} ${response.statusText}\n${text}`,
      );
    }

    return response.json();
  }

  /** Verify connection and database access */
  async verifyConnection(): Promise<{ ok: boolean; docCount: number }> {
    try {
      const info = (await this.request("")) as {
        db_name: string;
        doc_count: number;
      };
      return { ok: true, docCount: info.doc_count };
    } catch (error) {
      throw new Error(
        `Failed to connect to CouchDB at ${this.dbUrl}: ${error}`,
      );
    }
  }

  /** Get a single document (returns null if not found) */
  async getDoc(docId: string): Promise<CouchDoc | null> {
    try {
      return (await this.request(encodeURIComponent(docId))) as CouchDoc;
    } catch (error) {
      if (String(error).includes("404")) return null;
      throw error;
    }
  }

  /** Fetch existing _rev values for a set of document IDs */
  async getRevMap(docIds: string[]): Promise<Map<string, string>> {
    const revMap = new Map<string, string>();
    if (docIds.length === 0) return revMap;

    // Use _all_docs with keys for efficient bulk lookup
    // Process in batches to avoid URL length limits
    const BATCH = 500;
    for (let i = 0; i < docIds.length; i += BATCH) {
      const batch = docIds.slice(i, i + BATCH);
      const result = (await this.request("_all_docs", "POST", {
        keys: batch,
      })) as AllDocsResponse;

      for (const row of result.rows) {
        // A deleted doc still lists its rev, and writing a live doc over it
        // with that rev conflicts (the pruned c-ml-was-* coming back): treat
        // it as new, so the write carries no _rev and recreates it
        if (row.value && row.value.rev && !row.value.deleted) {
          revMap.set(row.id, row.value.rev);
        }
      }
    }

    return revMap;
  }

  /** Fetch all documents in a key range (with docs) */
  async allDocsInRange(
    startkey: string,
    endkey: string,
    includeDocs: boolean = false,
  ): Promise<AllDocsResponse> {
    const params = new URLSearchParams({
      startkey: JSON.stringify(startkey),
      endkey: JSON.stringify(endkey),
      include_docs: String(includeDocs),
    });
    return (await this.request(`_all_docs?${params}`)) as AllDocsResponse;
  }

  /** Bulk upload documents (handles both create and update) */
  async bulkDocs(docs: CouchDoc[]): Promise<BulkDocsResponse[]> {
    return (await this.request("_bulk_docs", "POST", {
      docs,
    })) as BulkDocsResponse[];
  }

  /** Put a single document (for upserts where we need precise control) */
  async putDoc(doc: CouchDoc): Promise<BulkDocsResponse> {
    return (await this.request(
      encodeURIComponent(doc._id),
      "PUT",
      doc,
    )) as BulkDocsResponse;
  }

  /** Fetch full documents by a list of IDs (POST _all_docs with include_docs) */
  async fetchDocsByKeys(keys: string[]): Promise<CouchDoc[]> {
    const docs: CouchDoc[] = [];
    if (keys.length === 0) return docs;

    const BATCH = 500;
    for (let i = 0; i < keys.length; i += BATCH) {
      const batch = keys.slice(i, i + BATCH);
      const result = (await this.request(
        "_all_docs?include_docs=true",
        "POST",
        { keys: batch },
      )) as AllDocsResponse;

      for (const row of result.rows) {
        // When a key is not found, row has { key, error: "not_found" } and no doc
        if (row.doc && row.doc._id) {
          docs.push(row.doc);
        }
      }
    }

    return docs;
  }
}

// ============================================================
// Document Builders
// ============================================================

/**
 * Build a DisplayableData document from a generated card.
 *
 * DisplayableData stores the actual question content:
 * - `data` is Field[] where each field is { name: string, data: unknown }
 * - `id_datashape` is the namespaced datashape identifier
 * - `course` is the courseID hash (NOT the code course name)
 */
function buildDataDoc(card: GeneratedCard): CouchDoc {
  const ddId = card._id.replace(/^c-/, "dd-");
  const viewInfo = QUESTION_VIEW_MAP[card.questionType];
  const fieldNames = QUESTION_FIELDS[card.questionType];

  // Convert flat data object to Field[] format
  const data: Field[] = fieldNames
    .filter((name) => card.data[name] !== undefined && card.data[name] !== null)
    .map((name) => ({
      name,
      data: card.data[name],
    }));

  return {
    _id: ddId,
    course: COURSE_ID,
    docType: DocTypes.DISPLAYABLE_DATA,
    id_datashape: viewInfo.dataShape,
    author: AUTHOR,
    data,
  };
}

/**
 * Build a CardData document from a generated card.
 *
 * CardData links a data document to a view and carries ELO:
 * - `course` is the code course name (e.g., "ExampleCourse")
 * - `id_displayable_data` references the dd-* document
 * - `id_view` is the fully-qualified view identifier
 * - `seedElo` is the pipeline's authored difficulty estimate (global +
 *   per-tag entries for all card tags, all `count: 0`). Immutable in the
 *   live DB: the course validator only lets learners touch `elo`.
 * - `elo` is the LIVE rating. On CREATE it equals `seedElo`; on UPDATE of an
 *   existing card `uploadCards` carries the existing doc's `elo` over so a
 *   content redeploy never resets ratings that settled from study traffic,
 *   with its tag ranks re-keyed to the card's current tags.
 *   Drift = `elo - seedElo`.
 */
function buildCardDoc(card: GeneratedCard): CouchDoc {
  const ddId = card._id.replace(/^c-/, "dd-");
  const viewInfo = QUESTION_VIEW_MAP[card.questionType];
  const idView = `${CODE_COURSE}.question.${card.questionType}.${viewInfo.viewName}`;

  // Initialize ELO with difficulty-informed score + per-tag entries. Jitter
  // is keyed by card id (and tag), so redeploying an unchanged card
  // re-stamps an identical seed.
  const globalScore = computeInitialElo(card, seededRng(card._id), SEED_CONTEXT);
  const tagElo: Record<string, { score: number; count: number }> = {};
  for (const tag of card.tags) {
    const jitter = Math.round((seededRng(`${card._id}|${tag}`)() - 0.5) * 10);
    tagElo[tag] = { score: globalScore + jitter, count: 0 };
  }

  const seedElo: CourseElo = {
    global: { score: globalScore, count: 0 },
    tags: tagElo,
    misc: {},
  };

  return {
    _id: card._id,
    course: CODE_COURSE,
    docType: DocTypes.CARD,
    id_displayable_data: [ddId],
    id_view: idView,
    // Separate object, not an alias: `elo` may be replaced with the live
    // value in uploadCards while `seedElo` must stay the authored baseline.
    elo: structuredClone(seedElo),
    seedElo,
    seedVersion: SEED_VERSION,
    author: AUTHOR,
    sourceRef: SOURCE_REF,
  };
}

/**
 * Build TAG documents from the full card set.
 *
 * Each unique tag becomes a TAG document containing the list of
 * card IDs that carry that tag. The document ID is `TAG-{tagName}`.
 */
function buildTagDocs(cards: GeneratedCard[]): Map<string, CouchDoc> {
  const tagToCards = new Map<string, string[]>();

  for (const card of cards) {
    for (const tag of card.tags) {
      if (!tagToCards.has(tag)) {
        tagToCards.set(tag, []);
      }
      tagToCards.get(tag)!.push(card._id);
    }
  }

  const tagDocs = new Map<string, CouchDoc>();
  for (const [tagName, cardIds] of tagToCards) {
    const tagId = `TAG-${tagName}`;
    tagDocs.set(tagId, {
      _id: tagId,
      course: COURSE_ID,
      docType: DocTypes.TAG,
      name: tagName,
      snippet: "",
      wiki: "",
      taggedCards: cardIds,
      author: AUTHOR,
    });
  }

  return tagDocs;
}

/**
 * Build NAVIGATION_STRATEGY documents from strategy config files.
 */
/** The generated sight-word intro cards in drip order (meta.dripRank: the lesson's seed, then most used). */
function sightWordIntroTargets(): string[] {
  const { cards } = JSON.parse(
    readFileSync(resolve(OUTPUTS_V2, "generated-cards.json"), "utf-8"),
  ) as GeneratedCardsFile;
  return cards
    .filter((c) => c.questionType === "SightWordIntro")
    .sort((a, b) => (a.meta.dripRank ?? Infinity) - (b.meta.dripRank ?? Infinity))
    .map((c) => c._id);
}

function buildStrategyDocs(): CouchDoc[] {
  const strategies: CouchDoc[] = [];

  // Hierarchy — 3 scoped filters so penalties compound independently.
  // A card failing one scope gets score *= 0.05; failing two gets *= 0.0025, etc.
  const hierarchyScopes = [
    {
      file: "hierarchy-gpc.json",
      id: "NAVIGATION_STRATEGY-hierarchy-gpc",
      name: "GPC Hierarchy",
      description:
        "Three-stage GPC gating chain (expose→intro→exercise) with digraph and GPC-specific prerequisites",
    },
    {
      file: "hierarchy-concept.json",
      id: "NAVIGATION_STRATEGY-hierarchy-concept",
      name: "Concept Hierarchy",
      description:
        "Concept-level stage gating (vowel types, match complexity, consonant categories)",
    },
    {
      file: "hierarchy-ui.json",
      id: "NAVIGATION_STRATEGY-hierarchy-ui",
      name: "UI Hierarchy",
      description:
        "UI type progression gating (word-selection → missing-letters → spelling)",
    },
  ];

  for (const scope of hierarchyScopes) {
    const data = readFileSync(resolve(STRATEGY_DIR, scope.file), "utf-8");
    strategies.push({
      _id: scope.id,
      docType: DocTypes.NAVIGATION_STRATEGY,
      name: scope.name,
      description: scope.description,
      implementingClass: Navigators.HIERARCHY,
      course: COURSE_ID,
      serializedData: data,
      sourceRef: SOURCE_REF,
    });
  }

  // Interference
  const interferenceData = readFileSync(
    resolve(STRATEGY_DIR, "interference.json"),
    "utf-8",
  );
  strategies.push({
    _id: "NAVIGATION_STRATEGY-interference-gpc",
    docType: DocTypes.NAVIGATION_STRATEGY,
    name: "GPC Interference Mitigation",
    description:
      "Visual and phonetic confusion pair separation (b/d, p/q, voicing pairs, etc.)",
    implementingClass: Navigators.INTERFERENCE,
    course: COURSE_ID,
    serializedData: interferenceData,
    sourceRef: SOURCE_REF,
  });

  // Priority
  const priorityData = readFileSync(
    resolve(STRATEGY_DIR, "priority.json"),
    "utf-8",
  );
  strategies.push({
    _id: "NAVIGATION_STRATEGY-priority-gpc",
    docType: DocTypes.NAVIGATION_STRATEGY,
    name: "GPC Priority Ordering",
    description:
      "Tag weights derived from teaching sequence order and letter frequency",
    implementingClass: Navigators.RELATIVE_PRIORITY,
    course: COURSE_ID,
    serializedData: priorityData,
    sourceRef: SOURCE_REF,
  });

  // Prescribed Cards — progressive intro surfacing with minimal support.
  // Prescribed remains one singleton strategy document, but the authored
  // config now distinguishes:
  //   - target intro cards that must eventually surface
  //   - support cards that can help satisfy expose prereqs for blocked intros
  //
  // The runtime prescribed strategy owns trajectory/backpressure behavior.
  // This config just declares the intro-focused target/support sets and a
  // small amount of policy for that singleton strategy.
  const prescribedCards = {
    groups: [
      {
        id: "intro-core",
        freshnessWindowSessions: 2,
        maxDirectTargetsPerRun: 4,
        maxSupportCardsPerRun: 4,
        hierarchyWalk: {
          enabled: true,
          maxDepth: 2,
        },
        targetCardIds: [
          // --- All intro-GPC cards (24) ---
          gpcIntroCardId(asGpcId("GPC-a-AE")),
          gpcIntroCardId(asGpcId("GPC-b-B")),
          gpcIntroCardId(asGpcId("GPC-c-K")),
          gpcIntroCardId(asGpcId("GPC-d-D")),
          gpcIntroCardId(asGpcId("GPC-e-EH")),
          gpcIntroCardId(asGpcId("GPC-f-F")),
          gpcIntroCardId(asGpcId("GPC-g-G")),
          gpcIntroCardId(asGpcId("GPC-h-HH")),
          gpcIntroCardId(asGpcId("GPC-i-IH")),
          gpcIntroCardId(asGpcId("GPC-j-JH")),
          gpcIntroCardId(asGpcId("GPC-k-K")),
          gpcIntroCardId(asGpcId("GPC-l-L")),
          gpcIntroCardId(asGpcId("GPC-m-M")),
          gpcIntroCardId(asGpcId("GPC-n-N")),
          gpcIntroCardId(asGpcId("GPC-o-AA")), // canonical short-o; o-AO is analysis-only (cot-caught merge)
          gpcIntroCardId(asGpcId("GPC-p-P")),
          // q has no standalone intro: 'q' only occurs in 'qu' (/kw/). The 'q'
          // keycap is unlocked by the qu digraph intro instead (see the digraph
          // section below + DigraphGpcIntroView's recordGpcIntroComplete('q')).
          gpcIntroCardId(asGpcId("GPC-r-R")),
          gpcIntroCardId(asGpcId("GPC-s-S")),
          gpcIntroCardId(asGpcId("GPC-t-T")),
          gpcIntroCardId(asGpcId("GPC-u-AH")),
          gpcIntroCardId(asGpcId("GPC-v-V")),
          gpcIntroCardId(asGpcId("GPC-w-W")),
          // x: compound /k s/. K_S.mp3 audio now exists; the intro card renders
          // via the compound-phoneme path (toPhonemeAudioKey). Required to unlock
          // the 'x' keycap (and therefore the all-26 spelling gate).
          gpcIntroCardId(asGpcId("GPC-x-K_S")),
          gpcIntroCardId(asGpcId("GPC-y-Y")),
          gpcIntroCardId(asGpcId("GPC-z-Z")), // z missing? why? no exemplar words? - added - see if found
          // --- Digraph intro-GPC cards (8) ---
          digraphGpcIntroCardId(asGpcId("GPC-th-DH")),
          digraphGpcIntroCardId(asGpcId("GPC-th-TH")),
          digraphGpcIntroCardId(asGpcId("GPC-sh-SH")),
          digraphGpcIntroCardId(asGpcId("GPC-ch-CH")),
          digraphGpcIntroCardId(asGpcId("GPC-ph-F")),
          digraphGpcIntroCardId(asGpcId("GPC-ng-NG")),
          // nk-NG_K omitted: composes naturally from n+k (/ŋ/+/k/), no intro card
          // generated (see DIGRAPH_INTRO_BLOCKLIST in generate-cards.ts). Listing it
          // here made the prescribed generator chase a phantom (non-existent) target.
          // ck-K and wh-W are not targets (2026-11-17). Both sit behind the deferred
          // doubled-consonants lesson, so the Lesson Gate blocks them for good and the
          // group could never complete; prescribed's support boost escalated on them
          // regardless (see fw generators/prescribed.ts header). ck goes on a mastery
          // ramp with no intro; wh belongs to the silent-letters lesson.
          // agent/lessons-audit/b.4.decision-recs.md E2, curriculum-log/concerns.md.
          digraphGpcIntroCardId(asGpcId("GPC-qu-K_W")),
          // --- Split digraph intro-GPC cards (5) ---
          splitDigraphIntroCardId(asGpcId("GPC-a_e-EY")),
          splitDigraphIntroCardId(asGpcId("GPC-e_e-IY")),
          splitDigraphIntroCardId(asGpcId("GPC-i_e-AY")),
          splitDigraphIntroCardId(asGpcId("GPC-o_e-OW")),
          splitDigraphIntroCardId(asGpcId("GPC-u_e-UW")),
        ],
        supportCardIds: [
          // --- Early support / exposure snowball ---
          // whoSaidThatCardId(asGpcId("GPC-s-S")),
          // "c-wst-fg-voicing-sz-s",
          "c-ws-sit-onset",   // exposes t-T, i-IH
          "c-ws-sent-onset",  // exposes t-T, n-N, e-EH
          "c-ws-sat-onset",   // exposes t-T, a-AE
          "c-ws-six-onset"    // exposes i-IH
          // NB: all supports must EXERCISE an introduced GPC (s-S here).
          // c-ws-tip-onset was removed: "tip" is t-onset, so the card carries
          // gpc:exercise:t-T and surfaced un-introduced t content pre-intro.
        ],
        supportTagPatterns: [
          "gpc:expose:*",
          "gpc:exercise:*",
        ],
        // Post-intro drilling: once a GPC's exercise skill is unlocked (intro
        // complete) but still under-practiced, emit its drill cards directly
        // into the pool. Closes the retrieval gap where global-ELO search never
        // fetches the low-ELO drill cards for a freshly-introduced grapheme.
        // Unlock status derives from the hierarchy with no extra wiring:
        // `gpc:exercise:X requires gpc:intro:X` where an intro card exists,
        // else the gated-concept leg (lesson-is-the-intro — see
        // generate-strategy-configs.ts + POST_LESSON_SEED_CARDS in
        // lib/curriculum.ts), which unlocks at lesson passage + first
        // released-concept completion. NB the runtime skips tags with NO
        // prereq entry (isUnlockedGatedSkill → false on zero prereq sets),
        // so a GPC must keep *some* satisfiable prereq to ever be drilled.
        practiceTagPatterns: [
          "gpc:exercise:*",
        ],
        practiceMinCount: 3,
        maxPracticeCardsPerRun: 4,
      },
      {
        // Sight-word intros in drip order: introduced before any exposure
        // (a sight word only appears in its own cards, which wait for its
        // intro), one per run (the view also allows one per session). Held
        // back until the sight-words lesson by the lesson gate. Then its
        // exposure cards are drilled until met a few times.
        id: "intro-sight-words",
        freshnessWindowSessions: 2,
        maxDirectTargetsPerRun: 1,
        maxSupportCardsPerRun: 0,
        introExposeMinCount: 0,
        hierarchyWalk: { enabled: false },
        targetCardIds: sightWordIntroTargets(),
        practiceTagPatterns: ["gpc:expose:WORD-*"],
        practiceMinCount: 3,
        maxPracticeCardsPerRun: 2,
      },
    ],
  };
  strategies.push({
    _id: "NAVIGATION_STRATEGY-prescribed-bootstrap",
    docType: DocTypes.NAVIGATION_STRATEGY,
    name: "Prescribed Intro Backpressure",
    description:
      "Progressive prescribed intro surfacing with minimal support cards for blocked expose-prerequisite chains",
    implementingClass: Navigators.PRESCRIBED,
    course: COURSE_ID,
    serializedData: JSON.stringify(prescribedCards),
    sourceRef: SOURCE_REF,
  });

  // Letter Gating (consumer-defined filter, no config file needed)
  strategies.push({
    _id: "NAVIGATION_STRATEGY-letter-gating",
    docType: DocTypes.NAVIGATION_STRATEGY,
    name: "Letter Gating Filter",
    description:
      "Spelling (SpellingQuestion) is categorically prohibited until all 26 keycaps are unlocked. MissingLetters is gated at the target-word level (all letters in the word must be unlocked). WordSelection is not gated.",
    implementingClass: Navigators.LETTER_GATING,
    course: COURSE_ID,
    serializedData: "{}",
    sourceRef: SOURCE_REF,
  });

  // Lesson Gate (consumer-defined filter, no config file needed)
  strategies.push({
    _id: "NAVIGATION_STRATEGY-lesson-gate",
    docType: DocTypes.NAVIGATION_STRATEGY,
    name: "Lesson Gate Filter",
    description:
      "Gates concept cards behind lesson completion/dismissal — prevents concept content from appearing before the lesson is handled",
    implementingClass: Navigators.LESSON_GATE,
    course: COURSE_ID,
    serializedData: "{}",
    sourceRef: SOURCE_REF,
  });

  // Intro Gate (consumer-defined filter, no config file needed)
  strategies.push({
    _id: "NAVIGATION_STRATEGY-intro-gate",
    docType: DocTypes.NAVIGATION_STRATEGY,
    name: "Intro Gate Filter",
    description:
      "Entitlement boundary: once an unpaid account can decode the free-tier word ceiling, intros for graphemes the child has not yet met are withheld. Cards for already-introduced graphemes are never touched — the wall stops new supply, it does not repossess.",
    implementingClass: Navigators.INTRO_GATE,
    course: COURSE_ID,
    serializedData: "{}",
    sourceRef: SOURCE_REF,
  });

  // Skill Staleness (consumer-defined filter, no config file needed)
  strategies.push({
    _id: "NAVIGATION_STRATEGY-skill-staleness",
    docType: DocTypes.NAVIGATION_STRATEGY,
    name: "Skill Staleness Boost",
    description:
      "Boosts cards for practiced skills that haven't had a first attempt lately: ×(1 + days/7) on the card's stalest gpc:exercise tag, uncapped. Practicing the skill resets it, so the boost closes itself.",
    implementingClass: Navigators.SKILL_STALENESS,
    course: COURSE_ID,
    serializedData: "{}",
    sourceRef: SOURCE_REF,
  });

  // Recent Weakness (consumer-defined filter, no config file needed)
  strategies.push({
    _id: "NAVIGATION_STRATEGY-recent-weakness",
    docType: DocTypes.NAVIGATION_STRATEGY,
    name: "Recent Weakness Boost",
    description:
      "Boosts cards for skills missed lately: up to ×2 on the card's weakest gpc:exercise tag, from misses in its last 12 presentations, relieved by later presentations and a 3-day half-life. Replaces the session failure boost (difficultyBooster).",
    implementingClass: Navigators.RECENT_WEAKNESS,
    course: COURSE_ID,
    serializedData: "{}",
    sourceRef: SOURCE_REF,
  });

  // Skill Pressure (framework filter, fw >= 0.3.4). Letter-sounds only: sight
  // words are learned whole and have their own practice. Framework defaults
  // otherwise (gain 0.5; shaky 0.8, unproven 0.5). With recent weakness (≤ ×2)
  // a card's combined boost stays ≤ ×3, under the ×3.3 at which a boost beats
  // the diversity re-rank floor. Deploy the app first: an app without the
  // class plans this doc as skipped.
  strategies.push({
    _id: "NAVIGATION_STRATEGY-skill-pressure",
    docType: DocTypes.NAVIGATION_STRATEGY,
    name: "Skill Pressure",
    description:
      "Leans selection toward weak letter-sounds: up to ×1.5 on a card's most pressured gpc:exercise tag. Pressure is the larger of need (rating below the median of the learner's skills) and insecurity (shaky 0.8, unproven 0.5).",
    implementingClass: Navigators.SKILL_PRESSURE,
    course: COURSE_ID,
    serializedData: JSON.stringify({
      include: ["gpc:exercise:"],
      exclude: ["gpc:exercise:WORD-"],
    }),
    sourceRef: SOURCE_REF,
  });

  return strategies;
}

// ============================================================
// CourseConfig Update
// ============================================================

/**
 * Check and optionally update the CourseConfig to include custom datashapes
 * and question types, and the QA username pattern. Without the former, the
 * framework won't know how to route cards created with custom question types.
 */
async function updateCourseConfig(
  client: CouchClient,
  dryRun: boolean,
): Promise<{ updated: boolean; message: string }> {
  const config = (await client.getDoc("CourseConfig")) as CouchDoc & {
    qaUsernamePattern?: string;
    dataShapes: Array<{
      name: string;
      questionTypes: string[];
      serializedZodSchema?: string;
    }>;
    questionTypes: Array<{
      name: string;
      viewList: string[];
      dataShapeList: string[];
    }>;
  };

  if (!config) {
    return {
      updated: false,
      message: "⚠️  CourseConfig not found in database!",
    };
  }

  const existingDataShapes = new Set(config.dataShapes.map((ds) => ds.name));
  const existingQuestionTypes = new Set(
    config.questionTypes.map((qt) => qt.name),
  );

  const newDataShapes: typeof config.dataShapes = [];
  const newQuestionTypes: typeof config.questionTypes = [];

  for (const [qType, info] of Object.entries(QUESTION_VIEW_MAP)) {
    if (!existingDataShapes.has(info.dataShape)) {
      newDataShapes.push({
        name: info.dataShape,
        questionTypes: [info.questionType],
      });
    }
    if (!existingQuestionTypes.has(info.questionType)) {
      newQuestionTypes.push({
        name: info.questionType,
        viewList: [info.viewName],
        dataShapeList: [info.dataShape],
      });
    }
  }

  const setQaPattern = config.qaUsernamePattern !== QA_USERNAME_PATTERN;

  if (newDataShapes.length === 0 && newQuestionTypes.length === 0 && !setQaPattern) {
    return {
      updated: false,
      message:
        "CourseConfig already has all custom datashapes and question types, and the QA username pattern",
    };
  }

  const changes = [
    `${newDataShapes.length} datashapes and ${newQuestionTypes.length} question types`,
    ...(setQaPattern ? [`qaUsernamePattern ${QA_USERNAME_PATTERN}`] : []),
  ].join(" + ");

  if (dryRun) {
    return {
      updated: false,
      message: `[DRY RUN] Would add ${changes} to CourseConfig`,
    };
  }

  config.dataShapes.push(...newDataShapes);
  config.questionTypes.push(...newQuestionTypes);
  config.qaUsernamePattern = QA_USERNAME_PATTERN;

  try {
    await client.putDoc(config as CouchDoc);
    return {
      updated: true,
      message: `Added ${changes} to CourseConfig`,
    };
  } catch (error) {
    return {
      updated: false,
      message: `Failed to update CourseConfig: ${error}`,
    };
  }
}

/**
 * The content's git commit, "-dirty" if the content pipeline has uncommitted
 * tracked changes.
 */
function contentGitVersion(): string {
  const contentDir = resolve(__dirname, "..");
  try {
    const sha = execSync("git rev-parse --short HEAD", { cwd: contentDir }).toString().trim();
    const dirty = execSync("git status --porcelain --untracked-files=no -- .", {
      cwd: contentDir,
    })
      .toString()
      .trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return "unknown";
  }
}

/**
 * Record this deploy as the course's content version (CourseConfig
 * `contentVersion`), which the framework stamps on every pipeline run.
 */
async function stampContentVersion(
  client: CouchClient,
  contentVersion: string,
): Promise<string> {
  const config = (await client.getDoc("CourseConfig")) as
    | (CouchDoc & { contentVersion?: string })
    | null;
  if (!config) return "⚠️  CourseConfig not found; content version not stamped";
  config.contentVersion = contentVersion;
  try {
    await client.putDoc(config as CouchDoc);
    return `✅ ${contentVersion}`;
  } catch (error) {
    return `❌ Failed to stamp content version: ${error}`;
  }
}

// ============================================================
// Upload Functions
// ============================================================

/**
 * Upload strategy documents to CouchDB.
 * Uses upsert pattern: fetches existing _rev, merges, and writes.
 */
async function uploadStrategies(
  client: CouchClient,
  dryRun: boolean,
  stats: UploadStats,
): Promise<void> {
  console.log("\n📋 Uploading strategy documents...");

  const strategies = buildStrategyDocs();
  const strategyIds = strategies.map((s) => s._id);
  const revMap = await client.getRevMap(strategyIds);

  for (const strategy of strategies) {
    const existingRev = revMap.get(strategy._id);
    if (existingRev) {
      strategy._rev = existingRev;
    }

    const action = existingRev ? "UPDATE" : "CREATE";

    if (dryRun) {
      console.log(`  [DRY RUN] ${action}: ${strategy._id} (${strategy.name})`);
    } else {
      try {
        await client.putDoc(strategy);
        console.log(`  ✅ ${action}: ${strategy._id} (${strategy.name})`);
      } catch (error) {
        const msg = `Failed to ${action.toLowerCase()} ${strategy._id}: ${error}`;
        console.error(`  ❌ ${msg}`);
        stats.errors.push(msg);
      }
    }

    if (existingRev) {
      stats.strategiesUpdated++;
    } else {
      stats.strategiesCreated++;
    }
  }
}

/**
 * Upload card documents (dd-* and c-*) in batches using _bulk_docs.
 */
async function uploadCards(
  client: CouchClient,
  cards: GeneratedCard[],
  dryRun: boolean,
  batchSize: number,
  stats: UploadStats,
  rebaseLiveElo: boolean,
): Promise<void> {
  console.log(`\n📦 Uploading ${cards.length} cards (dd + c docs)...`);
  const cardsById = new Map(cards.map((c) => [c._id, c]));

  // Build all documents
  const dataDocs: CouchDoc[] = [];
  const cardDocs: CouchDoc[] = [];

  for (const card of cards) {
    dataDocs.push(buildDataDoc(card));
    cardDocs.push(buildCardDoc(card));
  }

  // Fetch existing revs for data docs (rebuilt wholesale from the pipeline)
  const ddIds = dataDocs.map((d) => d._id);
  console.log(`  Fetching existing revisions for ${ddIds.length} data documents...`);
  const ddRevMap = await client.getRevMap(ddIds);
  for (const doc of dataDocs) {
    const existingRev = ddRevMap.get(doc._id);
    if (existingRev) {
      doc._rev = existingRev;
    }
  }

  // Fetch FULL existing card docs: besides _rev we need the live `elo`.
  // Cards drift from their seed as learners answer them (the course
  // validator permits bounded elo-only writes); a redeploy must not reset
  // that, but its tag ranks follow the card's current tags (see
  // reconcileEloTags). `seedElo` is always re-stamped from the pipeline.
  const cIds = cardDocs.map((d) => d._id);
  console.log(`  Fetching existing card documents for ${cIds.length} cards...`);
  const existingCards = new Map<string, CouchDoc>();
  for (const existing of await client.fetchDocsByKeys(cIds)) {
    existingCards.set(existing._id, existing);
  }
  let eloCarried = 0;
  let eloFallback = 0;
  const retagged: string[] = [];
  const moved: { id: string; shift: number; live: number }[] = [];
  for (const doc of cardDocs) {
    const existing = existingCards.get(doc._id);
    if (!existing) continue;
    doc._rev = existing._rev;
    if (isCourseEloShaped(existing.elo)) {
      const newSeed = doc.seedElo as CourseElo;
      const shift = seedShift(cardsById.get(doc._id)!, newSeed, existing);
      let live = existing.elo;
      if (shift.global !== 0 || Object.values(shift.tags).some((d) => d !== 0)) {
        moved.push({ id: doc._id, shift: shift.global, live: live.global.score });
        if (rebaseLiveElo) live = applySeedShift(live, shift);
      }
      const tags = Object.keys(newSeed.tags);
      const prevSeedTags = isCourseEloShaped(existing.seedElo)
        ? Object.keys(existing.seedElo.tags)
        : [];
      const { elo, added, dropped } = reconcileEloTags(live, tags, prevSeedTags);
      doc.elo = elo;
      eloCarried++;
      if (added.length || dropped.length) {
        retagged.push(
          `${doc._id}: ` +
            [...added.map((t) => `+${t}`), ...dropped.map((t) => `-${t}`)].join(" "),
        );
      }
    } else {
      // Should not happen (every deployed card carries elo); keep seed.
      eloFallback++;
    }
  }
  console.log(
    `  Found ${ddRevMap.size} existing data docs, ${existingCards.size} existing cards ` +
      `(live elo carried over: ${eloCarried}${eloFallback ? `, seed fallback: ${eloFallback}` : ""})`,
  );
  if (retagged.length > 0) {
    console.log(`  Live elo tag ranks re-keyed to current tags on ${retagged.length} card(s):`);
    for (const line of retagged.slice(0, 20)) console.log(`    ${line}`);
    if (retagged.length > 20) console.log(`    ... and ${retagged.length - 20} more`);
  }
  if (moved.length > 0) {
    moved.sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift));
    const verb = rebaseLiveElo ? "live elo rebased" : "live elo NOT rebased (--rebase-live-elo)";
    console.log(`  Seeds moved on ${moved.length} existing card(s); ${verb}. Largest:`);
    for (const m of moved.slice(0, 15)) {
      const after = rebaseLiveElo ? ` → ${m.live + m.shift}` : "";
      console.log(`    ${m.id}: seed ${m.shift > 0 ? "+" : ""}${m.shift}, live ${m.live}${after}`);
    }
    if (moved.length > 15) console.log(`    ... and ${moved.length - 15} more`);
  }

  // Count creates vs updates
  const ddCreates = dataDocs.filter((d) => !d._rev).length;
  const ddUpdates = dataDocs.filter((d) => d._rev).length;
  const cCreates = cardDocs.filter((d) => !d._rev).length;
  const cUpdates = cardDocs.filter((d) => d._rev).length;

  console.log(`  Data docs: ${ddCreates} new, ${ddUpdates} existing`);
  console.log(`  Card docs: ${cCreates} new, ${cUpdates} existing`);

  if (dryRun) {
    console.log(
      `  [DRY RUN] Would upload ${dataDocs.length} data docs + ${cardDocs.length} card docs`,
    );
    stats.dataDocsCreated = ddCreates;
    stats.dataDocsUpdated = ddUpdates;
    stats.cardsCreated = cCreates;
    stats.cardsUpdated = cUpdates;
    return;
  }

  // Upload data docs in batches first (cards reference them)
  console.log(`\n  Uploading data documents (dd-*)...`);
  await uploadBatch(client, dataDocs, batchSize, "dd", stats);

  // Upload card docs in batches
  console.log(`\n  Uploading card documents (c-*)...`);
  await uploadBatch(client, cardDocs, batchSize, "c", stats);
}

/**
 * Upload a batch of documents using _bulk_docs.
 */
async function uploadBatch(
  client: CouchClient,
  docs: CouchDoc[],
  batchSize: number,
  docTypeLabel: string,
  stats: UploadStats,
): Promise<void> {
  // Track which doc IDs are updates (had _rev) vs creates
  const updateIds = new Set(docs.filter((d) => d._rev).map((d) => d._id));
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(docs.length / batchSize);

    try {
      const results = await client.bulkDocs(batch);

      let batchOk = 0;
      let batchErrors = 0;

      for (const result of results) {
        if (result.ok || result.rev) {
          batchOk++;
          if (updateIds.has(result.id)) {
            totalUpdated++;
          } else {
            totalCreated++;
          }
        } else {
          batchErrors++;
          const msg = `${docTypeLabel} ${result.id}: ${result.error} - ${result.reason}`;
          stats.errors.push(msg);
        }
      }

      totalErrors += batchErrors;

      const totalOk = totalCreated + totalUpdated;
      process.stdout.write(
        `\r    Batch ${batchNum}/${totalBatches}: ${batchOk} ok, ${batchErrors} errors (total: ${totalOk}/${docs.length})`,
      );
    } catch (error) {
      totalErrors += batch.length;
      const msg = `Batch ${batchNum} failed entirely: ${error}`;
      console.error(`\n    ❌ ${msg}`);
      stats.errors.push(msg);
    }
  }

  console.log(""); // newline after progress
  console.log(`    ${totalCreated} created, ${totalUpdated} updated`);

  if (docTypeLabel === "dd") {
    stats.dataDocsCreated += totalCreated;
    stats.dataDocsUpdated += totalUpdated;
  } else if (docTypeLabel === "c") {
    stats.cardsCreated += totalCreated;
    stats.cardsUpdated += totalUpdated;
  }

  if (totalErrors > 0) {
    console.log(`    ⚠️  ${totalErrors} ${docTypeLabel} document errors`);
  }
}

/**
 * Upload TAG documents.
 *
 * Default behavior (REPLACE): the freshly-generated taggedCards array fully
 * replaces whatever was on the existing TAG doc. This prevents stale card IDs
 * from accumulating across deploys — every navigation strategy that walks a
 * tag is guaranteed to only see cards that exist in the current generation.
 *
 * Opt-in MERGE behavior (--merge-tags): unions the freshly-generated card IDs
 * into the existing taggedCards array. Use this if you have cards authored
 * outside the generation pipeline (e.g. MCP-created cards) whose tag
 * associations must survive a regen.
 */
async function uploadTags(
  client: CouchClient,
  cards: GeneratedCard[],
  dryRun: boolean,
  batchSize: number,
  mergeTags: boolean,
  stats: UploadStats,
): Promise<void> {
  console.log("\n🏷️  Building TAG documents...");

  const newTagDocs = buildTagDocs(cards);
  console.log(`  ${newTagDocs.size} unique tags across ${cards.length} cards`);

  // Fetch existing TAG documents — we need full docs to either merge taggedCards
  // (when --merge-tags is set) or just to carry over the existing _rev for a clean
  // replace (the default).
  const tagIds = Array.from(newTagDocs.keys());
  const existingTagIds = tagIds.filter((id) => id.startsWith("TAG-"));

  const existingTags = new Map<string, CouchDoc>();

  if (existingTagIds.length > 0) {
    console.log(`  Checking for existing TAG documents...`);
    const fetched = await client.fetchDocsByKeys(existingTagIds);
    for (const doc of fetched) {
      existingTags.set(doc._id, doc);
    }
    if (existingTags.size > 0) {
      console.log(
        `  ${existingTags.size} tags already exist — will ${mergeTags ? "MERGE" : "REPLACE"} taggedCards`,
      );
    }
  }

  // Build final TAG docs: for existing tags, carry over _rev; either union or
  // replace taggedCards depending on the mergeTags flag.
  const finalTagDocs: CouchDoc[] = [];
  let pruned = 0;

  for (const [tagId, newTag] of newTagDocs) {
    const existing = existingTags.get(tagId);
    if (existing) {
      const newCards = newTag.taggedCards as string[];
      if (mergeTags) {
        // Legacy: union existing + new, deduplicated
        const existingCards = new Set((existing.taggedCards as string[]) || []);
        for (const cardId of newCards) existingCards.add(cardId);
        existing.taggedCards = Array.from(existingCards);
      } else {
        // Default: replace with the freshly-generated set
        const before = ((existing.taggedCards as string[]) || []).length;
        existing.taggedCards = newCards;
        const dropped = Math.max(0, before - newCards.length);
        pruned += dropped;
      }
      finalTagDocs.push(existing); // existing doc carries its _rev
      stats.tagsUpdated++;
    } else {
      finalTagDocs.push(newTag);
      stats.tagsCreated++;
    }
  }

  console.log(
    `  ${stats.tagsCreated} new tags, ${stats.tagsUpdated} existing tags to ${mergeTags ? "merge" : "replace"}` +
      (!mergeTags && pruned > 0
        ? ` (net ${pruned} stale ref(s) pruned from existing taggedCards arrays)`
        : ""),
  );

  if (dryRun) {
    console.log(
      `  [DRY RUN] Would upload ${finalTagDocs.length} TAG documents`,
    );
    return;
  }

  // Upload in batches
  console.log(`  Uploading TAG documents...`);
  let totalOk = 0;
  let totalErrors = 0;

  for (let i = 0; i < finalTagDocs.length; i += batchSize) {
    const batch = finalTagDocs.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(finalTagDocs.length / batchSize);

    try {
      const results = await client.bulkDocs(batch);

      let batchOk = 0;
      for (const result of results) {
        if (result.ok || result.rev) {
          batchOk++;
        } else {
          totalErrors++;
          stats.errors.push(
            `TAG ${result.id}: ${result.error} - ${result.reason}`,
          );
        }
      }
      totalOk += batchOk;

      process.stdout.write(
        `\r    Batch ${batchNum}/${totalBatches}: ${batchOk} ok (total: ${totalOk}/${finalTagDocs.length})`,
      );
    } catch (error) {
      totalErrors += batch.length;
      stats.errors.push(`TAG batch failed: ${error}`);
    }
  }

  console.log(""); // newline
  if (totalErrors > 0) {
    console.log(`    ⚠️  ${totalErrors} TAG document errors`);
  }
}

// ============================================================
// Post-Upload Verification
// ============================================================

async function verifyUpload(
  client: CouchClient,
  expectedCards: number,
  stats: UploadStats,
): Promise<void> {
  console.log("\n🔍 Post-upload verification...");

  // Count cards in DB
  const cardResult = await client.allDocsInRange("c-", "c-\ufff0");
  console.log(
    `  Cards in DB: ${cardResult.rows.length} (expected: ≥${expectedCards})`,
  );

  // Count data docs
  const ddResult = await client.allDocsInRange("dd-", "dd-\ufff0");
  console.log(`  Data docs in DB: ${ddResult.rows.length}`);

  // Count tags
  const tagResult = await client.allDocsInRange("TAG-", "TAG-\ufff0");
  console.log(`  Tags in DB: ${tagResult.rows.length}`);

  // Count strategies
  const stratResult = await client.allDocsInRange(
    "NAVIGATION_STRATEGY-",
    "NAVIGATION_STRATEGY-\ufff0",
  );
  console.log(`  Strategy docs in DB: ${stratResult.rows.length}`);

  // Spot-check: fetch a few specific cards and verify
  const spotCheckIds = [
    "c-spelling-sit",
    whoSaidThatCardId(asGpcId("GPC-s-S")),
    "c-ml-sit-0",
    gpcIntroCardId(asGpcId("GPC-s-S")),
  ];

  console.log("\n  Spot-checking cards:");
  for (const cardId of spotCheckIds) {
    const card = await client.getDoc(cardId);
    if (card) {
      const ddId = (card.id_displayable_data as string[])?.[0];
      const dd = ddId ? await client.getDoc(ddId) : null;

      console.log(`    ✅ ${cardId}:`);
      console.log(`       view: ${card.id_view}`);
      console.log(`       data doc: ${ddId} (${dd ? "found" : "MISSING"})`);

      if (dd) {
        const dataFields = (dd.data as Field[]) || [];
        const fieldSummary = dataFields
          .map((f) => `${f.name}=${JSON.stringify(f.data)}`)
          .join(", ");
        console.log(`       fields: ${fieldSummary}`);
      }
    } else {
      console.log(`    ⚠️  ${cardId}: NOT FOUND`);
    }
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  const startTime = Date.now();

  console.log("╔═══════════════════════════════════════════════════╗");
  console.log("║  Content Pipeline — P4: CouchDB Upload Script    ║");
  console.log("╚═══════════════════════════════════════════════════╝");

  const options = parseArgs();

  if (options.dryRun) {
    console.log(
      "\n⚠️  DRY RUN MODE — no changes will be written to the database\n",
    );
  }

  // Initialize stats
  const stats: UploadStats = {
    strategiesCreated: 0,
    strategiesUpdated: 0,
    cardsCreated: 0,
    cardsUpdated: 0,
    dataDocsCreated: 0,
    dataDocsUpdated: 0,
    tagsCreated: 0,
    tagsUpdated: 0,
    errors: [],
    courseConfigUpdated: false,
  };

  // Initialize CouchDB client
  const client = new CouchClient(
    options.url,
    DB_NAME,
    options.username,
    options.password,
  );

  // Verify connection
  console.log(`\n🔌 Connecting to ${options.url}/${DB_NAME}...`);
  try {
    const { docCount } = await client.verifyConnection();
    console.log(`  ✅ Connected (${docCount} existing documents)`);
  } catch (error) {
    console.error(`  ❌ ${error}`);
    process.exit(1);
  }

  // ---- Load input data ----
  console.log("\n📂 Loading input files...");

  // Load generated cards (1.2MB — fine for Node's JSON.parse, but we stream-read)
  const cardsPath = resolve(OUTPUTS_V2, "generated-cards.json");
  let cardsFile: GeneratedCardsFile;
  try {
    const raw = readFileSync(cardsPath, "utf-8");
    cardsFile = JSON.parse(raw) as GeneratedCardsFile;
    console.log(
      `  ✅ generated-cards.json: ${cardsFile.cards.length} cards ` +
        `(${cardsFile.meta.stats.spelling} spelling, ` +
        `${cardsFile.meta.stats.whoSaidThat} WhoSaidThat, ` +
        `${cardsFile.meta.stats.wordSelection} WordSelection)`,
    );

    if (cardsFile.meta.errors > 0) {
      console.warn(
        `  ⚠️  Input file has ${cardsFile.meta.errors} errors — proceed with caution`,
      );
    }
  } catch (error) {
    console.error(`  ❌ Failed to load ${cardsPath}: ${error}`);
    process.exit(1);
  }

  // Verify strategy config files exist
  const strategyFiles = [
    "hierarchy-gpc.json",
    "hierarchy-concept.json",
    "hierarchy-ui.json",
    "interference.json",
    "priority.json",
    "tag-registry.json",
  ];
  for (const file of strategyFiles) {
    const filePath = resolve(STRATEGY_DIR, file);
    try {
      readFileSync(filePath, "utf-8"); // just verify it exists
      console.log(`  ✅ strategy-configs/${file}`);
    } catch {
      console.error(`  ❌ Missing: ${filePath}`);
      process.exit(1);
    }
  }

  // ---- CourseConfig update ----
  if (!options.skipCourseConfig) {
    console.log("\n⚙️  Checking CourseConfig...");
    const configResult = await updateCourseConfig(client, options.dryRun);
    console.log(`  ${configResult.message}`);
    stats.courseConfigUpdated = configResult.updated;
  }

  // ---- Upload strategies ----
  if (!options.skipStrategies) {
    await uploadStrategies(client, options.dryRun, stats);
  } else {
    console.log("\n⏭️  Skipping strategy upload (--skip-strategies)");
  }

  // ---- Upload cards and tags ----
  if (!options.skipCards) {
    await uploadCards(
      client,
      cardsFile.cards,
      options.dryRun,
      options.batchSize,
      stats,
      options.rebaseLiveElo,
    );
    await uploadTags(
      client,
      cardsFile.cards,
      options.dryRun,
      options.batchSize,
      options.mergeTags,
      stats,
    );
  } else {
    console.log("\n⏭️  Skipping card/tag upload (--skip-cards)");
  }

  // ---- Verification ----
  if (!options.dryRun && !options.skipCards) {
    await verifyUpload(client, cardsFile.cards.length, stats);
  }

  // ---- Summary ----
  console.log("\n═══════════════════════════════════════════════");
  console.log("  Upload Summary");
  console.log("═══════════════════════════════════════════════");
  console.log(
    `  Strategies:  ${stats.strategiesCreated} created, ${stats.strategiesUpdated} updated`,
  );
  console.log(
    `  Data docs:   ${stats.dataDocsCreated} created, ${stats.dataDocsUpdated} updated`,
  );
  console.log(
    `  Cards:       ${stats.cardsCreated} created, ${stats.cardsUpdated} updated`,
  );
  console.log(
    `  Tags:        ${stats.tagsCreated} created, ${stats.tagsUpdated} updated`,
  );
  console.log(
    `  CourseConfig: ${stats.courseConfigUpdated ? "updated" : "no change"}`,
  );

  if (stats.errors.length > 0) {
    console.log(`\n  ❌ ${stats.errors.length} error(s):`);
    for (const error of stats.errors.slice(0, 20)) {
      console.log(`     - ${error}`);
    }
    if (stats.errors.length > 20) {
      console.log(`     ... and ${stats.errors.length - 20} more`);
    }
  }

  // ---- Content version ----
  // Stamped after the uploads, so it never names a deploy that didn't land.
  const deployedAt = new Date().toISOString();
  const gitVersion = contentGitVersion();
  if (!options.dryRun) {
    console.log("\n🏷️  Stamping content version...");
    console.log(`  ${await stampContentVersion(client, `${gitVersion} ${deployedAt}`)}`);
  }

  // ---- Upload Metadoc ----
  // Write a `cards-upload-{ISO date}` document that records this run's metadata.
  // These use unique time-based IDs so they accumulate and are never overwritten
  // or deleted by subsequent runs. Visible at /admin/content → Upload History.
  if (!options.dryRun) {
    const durationMs = Date.now() - startTime;
    const now = new Date(deployedAt);
    // ID format: cards-upload-2025-01-15T12:34:56.789Z
    // ISO string is already lexicographically sortable
    const metadocId = `cards-upload-${now.toISOString()}`;

    const metadoc: CouchDoc = {
      _id: metadocId,
      docType: "UPLOAD_META",
      course: COURSE_ID,
      uploadedAt: now.toISOString(),
      uploadedBy: AUTHOR,
      dryRun: false,
      targetUrl: options.url,
      inputFile: {
        generatedAt: cardsFile.meta.generatedAt,
        generatedBy: cardsFile.meta.generatedBy,
        totalCards: cardsFile.cards.length,
        stats: cardsFile.meta.stats,
        errors: cardsFile.meta.errors,
        warnings: cardsFile.meta.warnings,
      },
      uploadStats: {
        strategiesCreated: stats.strategiesCreated,
        strategiesUpdated: stats.strategiesUpdated,
        cardsCreated: stats.cardsCreated,
        cardsUpdated: stats.cardsUpdated,
        dataDocsCreated: stats.dataDocsCreated,
        dataDocsUpdated: stats.dataDocsUpdated,
        tagsCreated: stats.tagsCreated,
        tagsUpdated: stats.tagsUpdated,
        errors: stats.errors,
        courseConfigUpdated: stats.courseConfigUpdated,
      },
      durationMs,
      sourceRef: SOURCE_REF,
      gitCommit: gitVersion,
    };

    console.log("\n📝 Writing upload metadoc...");
    try {
      await client.putDoc(metadoc);
      console.log(`  ✅ ${metadocId} (${(durationMs / 1000).toFixed(1)}s run)`);
    } catch (error) {
      console.error(`  ❌ Failed to write metadoc: ${error}`);
      // Non-fatal: don't exit over a metadoc failure
    }
  }

  if (options.dryRun) {
    console.log("\n  ℹ️  Dry run complete. No changes were made.");
    console.log("  Run without --dry-run to execute the upload.\n");
  } else if (stats.errors.length === 0) {
    console.log("\n  ✅ Upload complete!\n");
  } else {
    console.log(
      `\n  ⚠️  Upload completed with ${stats.errors.length} error(s).\n`,
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n💥 Unhandled error:", error);
  process.exit(1);
});
