/**
 * CouchDB Seed Script
 * ====================
 *
 * Bootstraps a CouchDB instance for LettersPractice. Performs a clean-slate
 * setup: wipes and recreates the course database, inserts design documents,
 * seeds the course lookup, then delegates to deploy-content.ts for
 * card/strategy/tag content.
 *
 * Defaults target local dev; can be pointed at prod via --url. When targeted
 * at a non-localhost URL the script requires interactive confirmation
 * (type the course ID) or --yes for automation.
 *
 * When operating against an existing database the script preserves the
 * existing CourseConfig (admins/moderators/description/etc.) and the
 * coursedb-lookup entry — only the content/strategy/tag docs and design
 * docs are rewritten.
 *
 * PREREQUISITES (local dev):
 *   - CouchDB running locally (in a vue-skuilder checkout: yarn couchdb:start)
 *   - Generated card data in outputs-v2/ (run yarn gen:all if missing)
 *
 * USAGE:
 *   yarn db:seed                                      # local: localhost:5984, admin/password
 *   yarn db:seed --url http://host:5984               # custom CouchDB URL
 *   yarn db:seed --skip-upload                        # bootstrap DB only, skip card upload
 *   yarn db:seed --url https://example.com/couch \
 *     -u admin -p <pw>                                # PROD reseed (prompts for confirmation)
 *   yarn db:seed --url <prod> -u <u> -p <p> --yes     # skip confirmation (automation)
 *
 * DESIGN DOCS:
 *   The CouchDB design documents inserted here are canonical to
 *   @vue-skuilder/express/src/design-docs.ts (and its assets/ directory).
 *   If those change, this file should be updated to match.
 *
 * @see deploy-content.ts — content deploy script (invoked by this script)
 * @see @vue-skuilder/express/src/design-docs.ts — canonical design doc definitions
 */

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

// ============================================================
// Constants
// ============================================================

const __dirname = dirname(fileURLToPath(import.meta.url));

const COURSE_ID = "cb155bd265cd894d425dac227b00bd7d";
const COURSE_DB_NAME = `coursedb-${COURSE_ID}`;
const LOOKUP_DB_NAME = "coursedb-lookup";
const COURSE_DISPLAY_NAME = "LettersPractice";

// Canonical source for design doc assets is
//   vue-skuilder's packages/express/assets/. The validate_doc_update fn is
// inlined below — see VALIDATE_DOC_UPDATE_JS — so the seed can run from any
// repo layout without depending on relative paths to vue-skuilder.
//
// If you update courseValidateDocUpdate.js upstream, update the inlined copy.
const VALIDATE_DOC_UPDATE_JS = `function(newDoc, oldDoc, userCtx, secObj) {
  // Skip validation for deletions
  if (newDoc._deleted) return;
  
  // Always allow admins to do anything
  if (userCtx.roles.indexOf('_admin') !== -1) return;
  
  // For CourseConfig document - we need special handling
  if (newDoc._id === 'CourseConfig') {
    // Allow the creator or admins listed in the document to modify it
    if (oldDoc && oldDoc.creator === userCtx.name) return;
    if (oldDoc && oldDoc.admins && Array.isArray(oldDoc.admins) && oldDoc.admins.indexOf(userCtx.name) !== -1) return;
    
    // For updates, if user is not creator or admin, deny
    if (oldDoc) {
      throw({forbidden: "Only course creator or admins can modify course configuration"});
    }
    
    // For new course config, allow (initial creation is secured at API level)
    return;
  }
  
  // For all other documents
  var isAdmin = false;
  var isModerator = false;
  
  // Course admins and moderators can edit anything
  // (Since we can't check CourseConfig directly, we rely on document author for regular docs)
  
  // Document has author field that matches current user - allow
  if (oldDoc && oldDoc.author === userCtx.name) return;
  
  // Allow document creation by any authenticated user
  if (!oldDoc) {
    if (!userCtx.name) {
      throw({forbidden: "You must be logged in to create documents"});
    }
    
    // Ensure new documents have an author field that matches the current user
    if (!newDoc.author || newDoc.author !== userCtx.name) {
      throw({forbidden: "Document author must match your username"});
    }
    
    return;
  }

  // ---------------------------------------------------------------------------
  // Dynamic card ELO: any authenticated user may update an existing CARD doc
  // iff the ONLY thing that changed is 'elo', and the 'elo' change is a
  // single bounded ELO step (see isBoundedEloStep below). This is what lets
  // content difficulty settle from live study traffic without giving learners
  // write access to anything else on the card.
  //
  // ES5 only (CouchDB SpiderMonkey): no let/const/arrow/for-of/Object.entries.
  // ---------------------------------------------------------------------------
  var ELO_MAX_STEP = 64; // must match K_MAX in @vue-skuilder/common elo.ts

  function isPlainObject(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
  }

  // Structural deep equality. Key order is irrelevant (a client round-trip
  // does not preserve it), so never compare serialized JSON.
  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return false;
    if (typeof a !== 'object') {
      // NaN !== NaN; treat two NaNs as equal for robustness
      return a !== a && b !== b;
    }
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    var ka = Object.keys(a);
    var kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var j = 0; j < ka.length; j++) {
      var k = ka[j];
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }

  function isEloRank(r) {
    return isPlainObject(r) && typeof r.score === 'number' && typeof r.count === 'number';
  }

  function isCourseElo(e) {
    return isPlainObject(e) && isEloRank(e.global) && isPlainObject(e.tags);
  }

  // Compare an EloRank 'n' against its predecessor 'o'. Returns null if OK,
  // else a reason string. 'label' names the rank for the message.
  //   - unchanged (score & count equal, other fields equal)  -> OK
  //   - one step: count === old.count + 1, |score delta| <= ELO_MAX_STEP,
  //     every field other than score/count deep-equal            -> OK
  function checkRankStep(label, o, n) {
    if (!isEloRank(n)) return label + ' must have numeric score and count';
    if (!isEloRank(o)) return label + ' has no valid prior rank to step from';
    // Non-bounded fields must be identical
    var keys = Object.keys(n).concat(Object.keys(o));
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === 'score' || k === 'count') continue;
      if (!deepEqual(o[k], n[k])) return label + ': only score and count may change (field "' + k + '")';
    }
    if (n.count === o.count && n.score === o.score) return null; // untouched
    if (n.count !== o.count + 1) {
      return label + ': count must increment by exactly 1 (was ' + o.count + ', got ' + n.count + ')';
    }
    if (Math.abs(n.score - o.score) > ELO_MAX_STEP) {
      return label + ': score may move at most ' + ELO_MAX_STEP + ' per update (was ' + o.score + ', got ' + n.score + ')';
    }
    return null;
  }

  // Compare a tag entry that does not exist on the old doc. The framework
  // initialises a new card-side tag rank at the card's (old) global score
  // with count 0, then applies one step.
  function checkNewRank(label, baseScore, n) {
    if (!isEloRank(n)) return label + ' must have numeric score and count';
    var keys = Object.keys(n);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] !== 'score' && keys[i] !== 'count') {
        return label + ': a new tag rank may only carry score and count (field "' + keys[i] + '")';
      }
    }
    if (n.count !== 1) return label + ': a new tag rank must have count 1 (got ' + n.count + ')';
    if (Math.abs(n.score - baseScore) > ELO_MAX_STEP) {
      return label + ': a new tag rank must start within ' + ELO_MAX_STEP + ' of the card global score ' + baseScore + ' (got ' + n.score + ')';
    }
    return null;
  }

  function isBoundedEloStep(oldElo, newElo) {
    if (!isCourseElo(newElo)) return 'elo must have the CourseElo shape {global:{score,count}, tags:{...}}';
    if (!isCourseElo(oldElo)) return 'existing elo is not CourseElo-shaped; cannot apply a bounded step';

    // Top-level elo keys other than global/tags must be unchanged (e.g. misc)
    var topKeys = Object.keys(newElo).concat(Object.keys(oldElo));
    for (var t = 0; t < topKeys.length; t++) {
      var tk = topKeys[t];
      if (tk === 'global' || tk === 'tags') continue;
      if (!deepEqual(oldElo[tk], newElo[tk])) return 'elo.' + tk + ' may not change';
    }

    var reason = checkRankStep('elo.global', oldElo.global, newElo.global);
    if (reason) return reason;

    // No tag deletions
    var oldTags = Object.keys(oldElo.tags);
    for (var d = 0; d < oldTags.length; d++) {
      if (!Object.prototype.hasOwnProperty.call(newElo.tags, oldTags[d])) {
        return 'elo.tags["' + oldTags[d] + '"] may not be removed';
      }
    }

    var newTags = Object.keys(newElo.tags);
    for (var n = 0; n < newTags.length; n++) {
      var tag = newTags[n];
      var label = 'elo.tags["' + tag + '"]';
      if (Object.prototype.hasOwnProperty.call(oldElo.tags, tag)) {
        reason = checkRankStep(label, oldElo.tags[tag], newElo.tags[tag]);
      } else {
        reason = checkNewRank(label, oldElo.global.score, newElo.tags[tag]);
      }
      if (reason) return reason;
    }
    return null;
  }

  if (newDoc.docType === 'CARD' && oldDoc.docType === 'CARD') {
    if (!userCtx.name) {
      throw({forbidden: "You must be logged in to update card elo"});
    }
    if (newDoc._id !== oldDoc._id) {
      throw({forbidden: "Card elo update: _id may not change"});
    }
    // Every field except elo and revision metadata must be unchanged.
    // _attachments (stubs) IS compared. _rev/_revisions/_conflicts etc. are
    // couch bookkeeping the client may or may not echo back, so skip them.
    var allKeys = Object.keys(newDoc).concat(Object.keys(oldDoc));
    for (var f = 0; f < allKeys.length; f++) {
      var field = allKeys[f];
      if (field === 'elo') continue;
      if (field.charAt(0) === '_' && field !== '_id' && field !== '_attachments') continue;
      if (!deepEqual(oldDoc[field], newDoc[field])) {
        throw({forbidden: 'Card elo update: only the elo field may change (field "' + field + '" differs)'});
      }
    }
    var eloReason = isBoundedEloStep(oldDoc.elo, newDoc.elo);
    if (eloReason) {
      throw({forbidden: 'Card elo update rejected: ' + eloReason});
    }
    return;
  }
  
  // For updates to existing documents, deny if not the original author
  if (oldDoc && oldDoc.author && oldDoc.author !== userCtx.name) {
    throw({forbidden: "You can only modify your own documents"});
  }
  
  // Special case for design documents - only admins can modify (handled above)
  // Use indexOf instead of startsWith for CouchDB SpiderMonkey compatibility (ES5)
  if (newDoc._id.indexOf('_design/') === 0) {
    throw({forbidden: "Only admins can modify design documents"});
  }
}`;

// Default _security doc for a fresh course DB. Allows any authenticated user
// to access; the validate_doc_update function above enforces per-doc write
// authorization. Required on CouchDB 3.x where new DBs default to admin-only.
const DEFAULT_SECURITY = {
  admins: { names: [], roles: ["_admin"] },
  members: { names: [], roles: [] },
};

// Default local CouchDB credentials (matches vue-skuilder/test-couch docker setup)
const DEFAULT_URL = "http://localhost:5984";
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "password";

// ============================================================
// CLI Argument Parsing
// ============================================================

interface SeedOptions {
  url: string;
  username: string;
  password: string;
  skipUpload: boolean;
  yes: boolean;
}

function parseArgs(): SeedOptions {
  const args = process.argv.slice(2);
  const options: SeedOptions = {
    url: process.env.COUCHDB_URL || DEFAULT_URL,
    username: process.env.COUCHDB_USERNAME || DEFAULT_USERNAME,
    password: process.env.COUCHDB_PASSWORD || DEFAULT_PASSWORD,
    skipUpload: false,
    yes: false,
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
      case "--skip-upload":
        options.skipUpload = true;
        break;
      case "-y":
      case "--yes":
        options.yes = true;
        break;
      case "-h":
      case "--help":
        console.log(`
Usage: yarn db:seed [options]

Options:
  -u, --username       CouchDB admin username (default: admin)
  -p, --password       CouchDB admin password (default: password)
  --url                CouchDB server URL (default: http://localhost:5984)
  --skip-upload        Only bootstrap DB structure, skip card upload
  -y, --yes            Skip the confirmation prompt for non-localhost URLs
  -h, --help           Show this help message
`);
        process.exit(0);
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  return options;
}

function isEmptySecurity(sec: Record<string, any> | null): boolean {
  // CouchDB returns {} for a DB with no security explicitly set. Also treat
  // a doc with empty admins+members blocks as "no meaningful security set".
  if (!sec) return true;
  const keys = Object.keys(sec);
  if (keys.length === 0) return true;
  const adminsEmpty =
    !sec.admins ||
    ((sec.admins.names?.length ?? 0) === 0 && (sec.admins.roles?.length ?? 0) === 0);
  const membersEmpty =
    !sec.members ||
    ((sec.members.names?.length ?? 0) === 0 && (sec.members.roles?.length ?? 0) === 0);
  return adminsEmpty && membersEmpty;
}

function isLocalhost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => {
    rl.question(question, (answer) => {
      rl.close();
      res(answer.trim());
    });
  });
}

// ============================================================
// HTTP Client (lightweight, no deps)
// ============================================================

class CouchAdmin {
  private baseUrl: string;
  private authHeader: string;

  constructor(url: string, username: string, password: string) {
    this.baseUrl = url.replace(/\/+$/, "");
    this.authHeader =
      "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  }

  private async request(
    path: string,
    method: string = "GET",
    body?: unknown,
  ): Promise<{ status: number; data: any }> {
    const url = `${this.baseUrl}${path}`;
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
    let data: any;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    return { status: response.status, data };
  }

  /** Can we reach CouchDB, and do our credentials work? */
  async checkConnectivity(): Promise<"ok" | "auth" | "unreachable"> {
    try {
      const { status } = await this.request("/");
      if (status === 200) return "ok";
      return status === 401 || status === 403 ? "auth" : "unreachable";
    } catch {
      return "unreachable";
    }
  }

  /** Fetch the _security doc for a DB. Returns null if DB does not exist. */
  async getSecurity(dbName: string): Promise<Record<string, any> | null> {
    const { status, data } = await this.request(`/${dbName}/_security`);
    if (status === 200) return data;
    if (status === 404) return null;
    throw new Error(`GET ${dbName}/_security failed: HTTP ${status}`);
  }

  /** PUT the _security doc for a DB. */
  async putSecurity(dbName: string, security: Record<string, any>): Promise<void> {
    const { status, data } = await this.request(
      `/${dbName}/_security`,
      "PUT",
      security,
    );
    if (status !== 200) {
      throw new Error(
        `PUT ${dbName}/_security failed: HTTP ${status} — ${JSON.stringify(data)}`,
      );
    }
  }

  /** Fetch a doc, or null if it doesn't exist (or DB doesn't exist). */
  async getDoc(dbName: string, docId: string): Promise<Record<string, any> | null> {
    const { status, data } = await this.request(
      `/${dbName}/${encodeURIComponent(docId)}`,
    );
    if (status === 200) return data;
    if (status === 404) return null;
    throw new Error(`GET ${dbName}/${docId} failed: HTTP ${status}`);
  }

  /** Delete a database (ignore 404) */
  async deleteDB(dbName: string): Promise<void> {
    const { status } = await this.request(`/${dbName}`, "DELETE");
    if (status !== 200 && status !== 404) {
      throw new Error(`Failed to delete ${dbName}: HTTP ${status}`);
    }
  }

  /** Create a database (ignore 412 = already exists) */
  async createDB(dbName: string): Promise<void> {
    const { status } = await this.request(`/${dbName}`, "PUT");
    if (status !== 201 && status !== 412) {
      throw new Error(`Failed to create ${dbName}: HTTP ${status}`);
    }
  }

  /** Put a document (upsert: fetches _rev if exists) */
  async putDoc(dbName: string, doc: Record<string, any>): Promise<void> {
    const docId = doc._id;
    if (!docId) throw new Error("Document must have _id");

    // Try to get existing _rev for upsert
    const { status: getStatus, data: existing } = await this.request(
      `/${dbName}/${encodeURIComponent(docId)}`,
    );
    if (getStatus === 200 && existing && existing._rev) {
      doc = { ...doc, _rev: existing._rev };
    }

    const { status, data } = await this.request(
      `/${dbName}/${encodeURIComponent(docId)}`,
      "PUT",
      doc,
    );
    if (status !== 201 && status !== 409) {
      throw new Error(
        `Failed to put ${docId} in ${dbName}: HTTP ${status} — ${JSON.stringify(data)}`,
      );
    }
  }
}

// ============================================================
// Design Document Definitions
// ============================================================
//
// Canonical source: @vue-skuilder/express/src/design-docs.ts
// and: @vue-skuilder/express/assets/
//
// These are replicated here to avoid transitive dependency issues
// (express depends on @vue-skuilder/db, @vue-skuilder/common, nano, etc.)
//
// The getTags JSON and courseValidateDocUpdate JS are read from the
// express package's assets directory directly — single source of truth.

function buildDesignDocs(): Record<string, any>[] {
  const docs: Record<string, any>[] = [];

  // _design/elo — ELO-based card query view
  // Source: @vue-skuilder/express/src/design-docs.ts → elodoc
  docs.push({
    _id: "_design/elo",
    views: {
      elo: {
        map: `function (doc) {
                if (doc.docType && doc.docType === 'CARD') {
                    if (doc.elo && typeof(doc.elo) === 'number') {
                        emit(doc.elo, doc._id);
                    } else if (doc.elo && doc.elo.global) {
                        emit(doc.elo.global.score, doc._id);
                    } else if (doc.elo) {
                        emit(doc.elo.score, doc._id);
                    } else {
                        var randElo = 995 + Math.round(10 * Math.random());
                        emit(randElo, doc._id);
                    }
                }
            }`,
      },
    },
    language: "javascript",
  });

  // _design/getTags — tag query view
  // NOTE: The express asset file (get-tagsDesignDoc.json) uses view name "get-tags"
  // but the app (PouchDB) queries "getTags" (camelCase). The inline definition here
  // matches what the app actually queries. Source: @vue-skuilder/express/src/design-docs.ts → tagsDoc
  docs.push({
    _id: "_design/getTags",
    views: {
      getTags: {
        map: `function (doc) {
                if (doc.docType && doc.docType === "TAG") {
                    for (var cardIndex in doc.taggedCards) {
                        emit(doc.taggedCards[cardIndex], {
                            docType: doc.docType,
                            name: doc.name,
                            snippit: doc.snippit,
                            wiki: '',
                            taggedCards: []
                        });
                    }
                }
            }`,
      },
    },
    language: "javascript",
  });

  // _design/cardsByInexperience — sorts cards by how few times they've been seen
  // Source: @vue-skuilder/express/src/design-docs.ts → cardsByInexperienceDoc
  docs.push({
    _id: "_design/cardsByInexperience",
    views: {
      cardsByInexperience: {
        map: `function (doc) {
                if (doc.docType && doc.docType === 'CARD') {
                    if (doc.elo && doc.elo.global && typeof doc.elo.global.count == 'number') {
                        emit(doc.elo.global.count, doc.elo);
                    } else if (doc.elo && typeof doc.elo == 'number') {
                        emit(0, doc.elo);
                    } else {
                        emit(0, 995 + Math.floor(10 * Math.random()));
                    }
                }
            }`,
      },
    },
    language: "javascript",
  });

  // _design/_auth — per-doc write authorization (validate_doc_update fn)
  // Inlined from @vue-skuilder/express/assets/courseValidateDocUpdate.js
  // (see VALIDATE_DOC_UPDATE_JS at top of file).
  //
  // This is REQUIRED in any environment with real users — without it, any
  // authenticated user can overwrite any document including cards. Local dev
  // running CouchDB 2.3.1 in admin-party mode tolerates its absence; prod
  // does not.
  docs.push({
    _id: "_design/_auth",
    validate_doc_update: VALIDATE_DOC_UPDATE_JS,
  });
  console.log("  📄 _design/_auth (inlined validate_doc_update)");

  return docs;
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("╔═══════════════════════════════════════════════════╗");
  console.log("║  CouchDB Seed Script                             ║");
  console.log("╚═══════════════════════════════════════════════════╝");

  const options = parseArgs();
  const remote = !isLocalhost(options.url);

  // ---- Step 1: Connectivity check ----
  console.log(`\n🔌 Checking CouchDB at ${options.url}...`);
  const client = new CouchAdmin(
    options.url,
    options.username,
    options.password,
  );

  const reachable = await client.checkConnectivity();
  if (reachable === "auth") {
    console.error(`\n  ❌ CouchDB at ${options.url} rejected the credentials for "${options.username}"`);
    const fromEnv = ["COUCHDB_USERNAME", "COUCHDB_PASSWORD"].filter((v) => process.env[v]);
    if (fromEnv.length) {
      console.error(`  They came from ${fromEnv.join(" and ")} in your environment.`);
      if (!remote) console.error(`  The local docker CouchDB uses ${DEFAULT_USERNAME}/${DEFAULT_PASSWORD}: unset ${fromEnv.join(" ")} and retry.`);
    } else {
      console.error(`  Pass --username / --password, or set COUCHDB_USERNAME / COUCHDB_PASSWORD.`);
    }
    console.error("");
    process.exit(1);
  }
  if (reachable === "unreachable") {
    console.error(`\n  ❌ Cannot reach CouchDB at ${options.url}`);
    if (!remote) {
      console.error(`\n  Make sure CouchDB is running:`);
      console.error(`    in a vue-skuilder checkout (github.com/patched-network/vue-skuilder): yarn couchdb:start`);
      console.error(`\n  Then wait a few seconds and try again.\n`);
    } else {
      console.error(`\n  Check the URL and credentials.\n`);
    }
    process.exit(1);
  }
  console.log("  ✅ CouchDB is reachable");

  // ---- Step 1.5: Preserve existing CourseConfig, lookup entry, _security ----
  // For remote (typically prod) reseeds, we want to keep authored fields like
  // admins/moderators/description that the "minimal" CourseConfig would clobber,
  // and we MUST preserve _security or every registered user gets 403'd until
  // someone re-applies access control.
  console.log(`\n🔎 Inspecting existing state of ${COURSE_DB_NAME}...`);
  const existingCourseConfig = await client.getDoc(COURSE_DB_NAME, "CourseConfig");
  const existingLookupEntry = await client.getDoc(LOOKUP_DB_NAME, COURSE_ID);
  const existingSecurity = await client.getSecurity(COURSE_DB_NAME);
  if (existingCourseConfig) {
    console.log(
      `  ✅ Found existing CourseConfig — will preserve fields ` +
        `(admins=${(existingCourseConfig.admins as unknown[] | undefined)?.length ?? 0}, ` +
        `moderators=${(existingCourseConfig.moderators as unknown[] | undefined)?.length ?? 0})`,
    );
  } else {
    console.log(`  ℹ️  No existing CourseConfig — will insert minimal default`);
  }
  if (existingLookupEntry) {
    console.log(`  ✅ Found existing lookup entry — will preserve`);
  } else {
    console.log(`  ℹ️  No existing lookup entry — will insert default`);
  }
  if (existingSecurity && !isEmptySecurity(existingSecurity)) {
    console.log(`  ✅ Found existing _security — will preserve verbatim`);
  } else {
    console.log(
      `  ℹ️  No meaningful existing _security — will apply default ` +
        `(any-authenticated-user; per-doc writes gated by _design/_auth)`,
    );
  }

  // ---- Step 1.75: Confirmation gate for non-localhost targets ----
  if (remote && !options.yes) {
    console.log(
      `\n⚠️  TARGET IS NOT LOCALHOST.\n` +
        `   URL:  ${options.url}\n` +
        `   DB:   ${COURSE_DB_NAME}\n` +
        `\n   This will DELETE the course database and re-upload all\n` +
        `   cards/strategies/tags from outputs-v2/.\n` +
        `\n   PRESERVED across the wipe:\n` +
        `     • CourseConfig (admins/moderators/description/...)\n` +
        `     • coursedb-lookup entry\n` +
        `     • _security doc (or sane default applied if none existed)\n` +
        `     • _design/_auth validate_doc_update (inlined, always installed)\n` +
        `\n   NOT touched: per-user state databases.\n` +
        `   All connected PouchDB clients will be forced to re-sync on next visit.\n`,
    );
    const answer = await prompt(
      `   To proceed, type the full course ID (${COURSE_ID}): `,
    );
    if (answer !== COURSE_ID) {
      console.log("\n  ❌ Confirmation did not match — aborting.\n");
      process.exit(1);
    }
    console.log("  ✅ Confirmed.");
  }

  // ---- Step 2: Wipe and recreate course database ----
  console.log(`\n🗑️  Wiping ${COURSE_DB_NAME}...`);
  await client.deleteDB(COURSE_DB_NAME);
  console.log("  ✅ Deleted (or did not exist)");

  console.log(`\n📦 Creating ${COURSE_DB_NAME}...`);
  await client.createDB(COURSE_DB_NAME);
  console.log("  ✅ Created");

  // ---- Step 2.5: Apply _security BEFORE any other writes ----
  // Without this, CouchDB 3.x rejects all non-admin reads/writes on the new DB.
  // Preserve the prior policy if there was one; otherwise apply the
  // any-authenticated-user default (per-doc writes still gated by _design/_auth).
  console.log(`\n🔐 Applying _security to ${COURSE_DB_NAME}...`);
  const securityToApply =
    existingSecurity && !isEmptySecurity(existingSecurity)
      ? existingSecurity
      : DEFAULT_SECURITY;
  await client.putSecurity(COURSE_DB_NAME, securityToApply);
  const adminRoles = (securityToApply.admins?.roles ?? []).join(",") || "—";
  const memberRoles = (securityToApply.members?.roles ?? []).join(",") || "any-authenticated";
  console.log(`  ✅ admins.roles=[${adminRoles}]  members.roles=[${memberRoles}]`);

  // ---- Step 3: Insert design documents + epoch marker ----
  console.log("\n📐 Inserting design documents...");
  const designDocs = buildDesignDocs();
  for (const doc of designDocs) {
    await client.putDoc(COURSE_DB_NAME, doc);
    console.log(`  ✅ ${doc._id}`);
  }

  // Epoch marker: lets PouchDB clients detect that the DB was recreated.
  // CourseSyncService checks this on each ensureSynced() call — if the
  // remote epoch differs from the local copy, it destroys the stale
  // local replica and re-syncs from scratch.
  const epoch = Date.now();
  await client.putDoc(COURSE_DB_NAME, {
    _id: "db-epoch",
    epoch,
  });
  console.log(`  ✅ db-epoch (${epoch})`);

  // ---- Step 4: Ensure coursedb-lookup exists with LP entry ----
  console.log(`\n📚 Ensuring ${LOOKUP_DB_NAME} exists...`);
  await client.createDB(LOOKUP_DB_NAME);
  console.log("  ✅ Exists");

  console.log(`\n📝 Upserting course entry in ${LOOKUP_DB_NAME}...`);
  if (existingLookupEntry) {
    const { _rev: _omit, ...preserved } = existingLookupEntry;
    await client.putDoc(LOOKUP_DB_NAME, preserved);
    console.log(`  ✅ Preserved existing lookup entry for ${COURSE_ID}`);
  } else {
    await client.putDoc(LOOKUP_DB_NAME, {
      _id: COURSE_ID,
      name: COURSE_DISPLAY_NAME,
    });
    console.log(`  ✅ ${COURSE_ID} → "${COURSE_DISPLAY_NAME}"`);
  }

  // ---- Step 5: Insert CourseConfig ----
  // deploy-content.ts expects CourseConfig to already exist (it updates, not creates).
  // Prefer the previous CourseConfig (minus _rev) so authored fields survive a reseed;
  // dataShapes/questionTypes are reset since the deploy script repopulates them and
  // stale entries pointing at removed types would only mislead the framework.
  if (existingCourseConfig) {
    const { _rev: _omit, ...preserved } = existingCourseConfig;
    console.log("\n⚙️  Restoring preserved CourseConfig (dataShapes/questionTypes reset)...");
    await client.putDoc(COURSE_DB_NAME, {
      ...preserved,
      dataShapes: [],
      questionTypes: [],
    });
    console.log("  ✅ CourseConfig restored");
  } else {
    console.log("\n⚙️  Inserting minimal CourseConfig...");
    await client.putDoc(COURSE_DB_NAME, {
      _id: "CourseConfig",
      docType: "COURSE_CONFIG",
      name: COURSE_DISPLAY_NAME,
      description: "LettersPractice course",
      courseId: COURSE_ID,
      admins: [],
      moderators: [],
      public: true,
      deleted: false,
      creator: "seed-local-db",
      dataShapes: [],
      questionTypes: [],
    });
    console.log("  ✅ CourseConfig created");
  }

  // ---- Step 6: Delegate to deploy-content for content ----
  if (options.skipUpload) {
    console.log("\n⏭️  Skipping card upload (--skip-upload)");
  } else {
    console.log("\n📤 Running deploy-content...\n");
    console.log("─".repeat(60));

    const uploadCmd = [
      "yarn deploy:content",
      `--url ${options.url}`,
      `-u ${options.username}`,
      `-p ${options.password}`,
    ].join(" ");

    try {
      execSync(uploadCmd, {
        cwd: resolve(__dirname, ".."),
        stdio: "inherit",
        env: { ...process.env },
      });
    } catch (error) {
      console.error("\n  ❌ deploy-content failed. See output above.");
      process.exit(1);
    }

    console.log("─".repeat(60));
  }

  // ---- Done ----
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  ✅ CouchDB seed complete!");
  console.log("═══════════════════════════════════════════════════");
  console.log(`\n  Course DB:   ${options.url}/${COURSE_DB_NAME}`);
  console.log(`  Lookup DB:   ${options.url}/${LOOKUP_DB_NAME}`);
  if (remote) {
    console.log(`\n  Recommended next step:`);
    console.log(`    yarn audit:prod   # confirm zero drift\n`);
  } else {
    console.log(`\n  Next steps (app repo root, with VITE_COUCH_BASE_URL set in .env.development):`);
    console.log(`    yarn dev`);
    console.log(`\n  Sign-up needs the skuilder express server; see README.\n`);
  }
}

main().catch((error) => {
  console.error("\n💥 Seed script failed:", error);
  process.exit(1);
});
