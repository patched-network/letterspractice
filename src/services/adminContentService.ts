/**
 * Admin Content Service
 * =====================
 *
 * Provides direct CouchDB access for the admin content explorer views.
 * Uses fetch against the configured CouchDB URL to query card, tag,
 * strategy, and upload-metadoc documents from the course database.
 *
 * This bypasses the PouchDB/data-layer abstraction because admin views
 * need raw _all_docs queries with key ranges and include_docs, which
 * the framework's CourseDBInterface doesn't expose.
 *
 * URL resolution:
 *   - Dev: Vite proxies /couch → localhost:5984
 *   - Prod: the couch URL from the build env (VITE_COUCH_BASE_URL, ENVIRONMENT_VARS.ts)
 */

import ENV from '../ENVIRONMENT_VARS';
import config from '../../skuilder.config.json';

// ============================================================
// Constants
// ============================================================

export const COURSE_ID = config.course || '';
const DB_NAME = `coursedb-${COURSE_ID}`;

/** Unicode high character used as upper bound for CouchDB key range queries */
const HIGH_KEY = '\ufff0';

// ============================================================
// Types
// ============================================================

/** A generic CouchDB document with common fields */
export interface CouchDoc {
  _id: string;
  _rev?: string;
  docType?: string;
  course?: string;
  author?: string;
  sourceRef?: string;
  [key: string]: unknown;
}

/** Shape of a Card document in the course DB */
export interface CardDoc extends CouchDoc {
  docType: 'CARD';
  id_displayable_data: string[];
  id_view: string;
  elo: {
    global: { score: number; count: number };
    tags: Record<string, { score: number; count: number }>;
    misc: Record<string, unknown>;
  };
}

/** Shape of a DisplayableData document */
export interface DataDoc extends CouchDoc {
  docType: 'DISPLAYABLE_DATA';
  id_datashape: string;
  data: Array<{ name: string; data: unknown }>;
}

/** Shape of a TAG document */
export interface TagDoc extends CouchDoc {
  docType: 'TAG';
  name: string;
  snippet: string;
  wiki: string;
  taggedCards: string[];
}

/** Shape of a NAVIGATION_STRATEGY document */
export interface StrategyDoc extends CouchDoc {
  docType: 'NAVIGATION_STRATEGY';
  name: string;
  description: string;
  implementingClass: string;
  serializedData: string;
}

/** Shape of a deploy metadoc written by deploy-content.ts */
export interface UploadMetadoc extends CouchDoc {
  docType: 'UPLOAD_META';
  uploadedAt: string;
  uploadedBy: string;
  dryRun: boolean;
  targetUrl: string;
  inputFile: {
    generatedAt: string;
    generatedBy: string;
    totalCards: number;
    stats: Record<string, number>;
    errors: number;
    warnings: number;
  };
  uploadStats: {
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
  };
  durationMs: number;
}

/** CouchDB _all_docs response shape */
interface AllDocsResponse {
  total_rows: number;
  offset: number;
  rows: Array<{
    id: string;
    key: string;
    value: { rev: string };
    doc?: CouchDoc;
  }>;
}

/** Summary stats for the admin dashboard */
export interface ContentSummary {
  cardCount: number;
  dataDocCount: number;
  tagCount: number;
  strategyCount: number;
  uploadMetaCount: number;
  cardsByType: Record<string, number>;
  tagNames: string[];
}

/** Enriched card for display: card + its displayable data merged */
export interface EnrichedCard {
  card: CardDoc;
  dataDoc: DataDoc | null;
  questionType: string;
  viewName: string;
  dataShape: string;
  tags: string[];
  eloScore: number;
  eloCount: number;
  dataFields: Record<string, unknown>;
}

// ============================================================
// URL Resolution
// ============================================================

function getCouchBaseUrl(): string {
  const protocol = ENV.COUCHDB_SERVER_PROTOCOL || 'http';
  const serverUrl = ENV.COUCHDB_SERVER_URL || 'localhost:5984/';

  // In dev mode, the Vite proxy handles /couch → localhost:5984
  // Check if we're in dev and the URL is localhost
  if (import.meta.env.DEV && serverUrl.includes('localhost')) {
    return `http://${serverUrl}`;
  }

  return `${protocol}://${serverUrl}`;
}

function getDbUrl(): string {
  const base = getCouchBaseUrl().replace(/\/+$/, '');
  return `${base}/${DB_NAME}`;
}

// ============================================================
// HTTP Helper
// ============================================================

async function couchFetch<T>(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const url = `${getDbUrl()}/${path}`;
  const init: RequestInit = {
    method: options?.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };

  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, init);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `CouchDB ${init.method} ${url} failed: ${response.status} ${response.statusText}\n${text}`,
    );
  }

  return response.json() as Promise<T>;
}

// ============================================================
// Key-Range Queries
// ============================================================

async function allDocsInRange(
  startkey: string,
  endkey: string,
  includeDocs: boolean = true,
): Promise<AllDocsResponse> {
  const params = new URLSearchParams({
    startkey: JSON.stringify(startkey),
    endkey: JSON.stringify(endkey),
    include_docs: String(includeDocs),
  });
  return couchFetch<AllDocsResponse>(`_all_docs?${params}`);
}

async function fetchDocsByKeys<T extends CouchDoc>(
  keys: string[],
): Promise<T[]> {
  if (keys.length === 0) return [];

  const result = await couchFetch<AllDocsResponse>(
    '_all_docs?include_docs=true',
    { method: 'POST', body: { keys } },
  );

  return result.rows
    .filter((row) => row.doc && row.doc._id)
    .map((row) => row.doc as T);
}

// ============================================================
// Public API: Fetching Content
// ============================================================

/**
 * Get a quick count summary of all content types in the database.
 */
export async function getContentSummary(): Promise<ContentSummary> {
  // Fire all range queries in parallel
  const [cardRes, ddRes, tagRes, stratRes, metaRes] = await Promise.all([
    allDocsInRange('c-', `c-${HIGH_KEY}`, true),
    allDocsInRange('dd-', `dd-${HIGH_KEY}`, false),
    allDocsInRange('TAG-', `TAG-${HIGH_KEY}`, true),
    allDocsInRange('NAVIGATION_STRATEGY-', `NAVIGATION_STRATEGY-${HIGH_KEY}`, false),
    allDocsInRange('cards-upload-', `content-deploy-${HIGH_KEY}`, false),
  ]);

  // Compute cards-by-type from the id_view field
  const cardsByType: Record<string, number> = {};
  for (const row of cardRes.rows) {
    if (row.doc) {
      const card = row.doc as CardDoc;
      const viewStr = card.id_view || 'unknown';
      // Extract question type from view string like "ExampleCourse.question.SpellingQuestion.SpellingQuestionView"
      const parts = viewStr.split('.');
      const qType = parts.length >= 3 ? parts[2] : viewStr;
      cardsByType[qType] = (cardsByType[qType] || 0) + 1;
    }
  }

  // Extract tag names
  const tagNames = tagRes.rows
    .filter((row) => row.doc)
    .map((row) => (row.doc as TagDoc).name || row.id)
    .sort();

  return {
    cardCount: cardRes.rows.length,
    dataDocCount: ddRes.rows.length,
    tagCount: tagRes.rows.length,
    strategyCount: stratRes.rows.length,
    uploadMetaCount: metaRes.rows.length,
    cardsByType,
    tagNames,
  };
}

/**
 * Fetch all Card documents with optional filtering.
 */
export async function getCards(filters?: {
  questionType?: string;
  tag?: string;
}): Promise<CardDoc[]> {
  const result = await allDocsInRange('c-', `c-${HIGH_KEY}`, true);
  let cards = result.rows
    .filter((row) => row.doc && row.doc.docType === 'CARD')
    .map((row) => row.doc as CardDoc);

  if (filters?.questionType) {
    cards = cards.filter((card) => {
      const viewStr = card.id_view || '';
      return viewStr.includes(`.${filters.questionType}.`);
    });
  }

  if (filters?.tag) {
    const tagFilter = filters.tag;
    cards = cards.filter((card) => {
      const tagEloKeys = card.elo?.tags ? Object.keys(card.elo.tags) : [];
      return tagEloKeys.some((t) => t === tagFilter || t.includes(tagFilter));
    });
  }

  return cards;
}

/**
 * Fetch enriched card data: card + associated displayable data.
 * This is the high-level query for the content explorer table.
 */
export async function getEnrichedCards(filters?: {
  questionType?: string;
  tag?: string;
}): Promise<EnrichedCard[]> {
  const cards = await getCards(filters);

  // Collect all dd- IDs we need to fetch
  const ddIds = new Set<string>();
  for (const card of cards) {
    if (card.id_displayable_data?.length > 0) {
      ddIds.add(card.id_displayable_data[0]);
    }
  }

  // Fetch all data docs in one batch
  const dataDocs = await fetchDocsByKeys<DataDoc>(Array.from(ddIds));
  const dataDocMap = new Map<string, DataDoc>();
  for (const dd of dataDocs) {
    dataDocMap.set(dd._id, dd);
  }

  // Enrich each card
  return cards.map((card) => {
    const ddId = card.id_displayable_data?.[0] || '';
    const dataDoc = dataDocMap.get(ddId) || null;

    // Extract question type and view name from id_view
    // Format: "ExampleCourse.question.SpellingQuestion.SpellingQuestionView"
    const viewParts = (card.id_view || '').split('.');
    const questionType = viewParts.length >= 3 ? viewParts[2] : 'unknown';
    const viewName = viewParts.length >= 4 ? viewParts[3] : 'unknown';
    const dataShape = dataDoc?.id_datashape || '';

    // Extract tags from elo.tags keys
    const tags = card.elo?.tags ? Object.keys(card.elo.tags) : [];

    // Extract data fields from the displayable data
    const dataFields: Record<string, unknown> = {};
    if (dataDoc?.data) {
      for (const field of dataDoc.data) {
        dataFields[field.name] = field.data;
      }
    }

    return {
      card,
      dataDoc,
      questionType,
      viewName,
      dataShape,
      tags,
      eloScore: card.elo?.global?.score ?? 0,
      eloCount: card.elo?.global?.count ?? 0,
      dataFields,
    };
  });
}

/**
 * Fetch all TAG documents.
 */
export async function getTags(): Promise<TagDoc[]> {
  const result = await allDocsInRange('TAG-', `TAG-${HIGH_KEY}`, true);
  return result.rows
    .filter((row) => row.doc && row.doc.docType === 'TAG')
    .map((row) => row.doc as TagDoc);
}

/**
 * Fetch all NAVIGATION_STRATEGY documents.
 */
export async function getStrategies(): Promise<StrategyDoc[]> {
  const result = await allDocsInRange(
    'NAVIGATION_STRATEGY-',
    `NAVIGATION_STRATEGY-${HIGH_KEY}`,
    true,
  );
  return result.rows
    .filter((row) => row.doc)
    .map((row) => row.doc as StrategyDoc);
}

/**
 * Fetch all deploy metadocs (content-deploy-* and legacy cards-upload-* documents).
 */
export async function getUploadMetadocs(): Promise<UploadMetadoc[]> {
  const result = await allDocsInRange(
    'cards-upload-',
    `content-deploy-${HIGH_KEY}`,
    true,
  );
  return result.rows
    .filter((row) => row.doc)
    .map((row) => row.doc as UploadMetadoc)
    .sort((a, b) => {
      // Sort most recent first
      const dateA = a.uploadedAt || a._id;
      const dateB = b.uploadedAt || b._id;
      return dateB.localeCompare(dateA);
    });
}

/**
 * Fetch the CourseConfig document.
 */
export async function getCourseConfig(): Promise<CouchDoc | null> {
  try {
    return await couchFetch<CouchDoc>(encodeURIComponent('CourseConfig'));
  } catch {
    return null;
  }
}

/**
 * Get a single document by ID.
 */
export async function getDoc(docId: string): Promise<CouchDoc | null> {
  try {
    return await couchFetch<CouchDoc>(encodeURIComponent(docId));
  } catch {
    return null;
  }
}

/**
 * A stale card: present in the DB but referenced by zero TAG documents.
 *
 * TAG docs are deployed in REPLACE mode, so when a card is dropped from
 * generation its id is pruned from every `taggedCards` array — leaving the
 * c-/dd- docs behind with no tag pointing at them. Such a card is unreachable
 * by every navigation strategy (they all walk tags), i.e. dead content. (The
 * card's own `elo.tags` keys still carry the stale tag names, so the orphan
 * signal must come from the TAG docs, not the card doc.)
 */
export interface OrphanCard {
  cardId: string;
  ddId: string;
}

/**
 * Find stale card docs: c-* docs whose id appears in no TAG doc's taggedCards.
 * Read-only. Pairs each with its derived dd-* id (deletion target).
 */
export async function getOrphanCards(): Promise<OrphanCard[]> {
  const [cardRes, tags] = await Promise.all([
    allDocsInRange('c-', `c-${HIGH_KEY}`, false),
    getTags(),
  ]);
  const referenced = new Set<string>();
  for (const tag of tags) {
    for (const cardId of tag.taggedCards || []) referenced.add(cardId);
  }
  return cardRes.rows
    .filter((row) => row.id.startsWith('c-') && !referenced.has(row.id))
    .map((row) => ({ cardId: row.id, ddId: row.id.replace(/^c-/, 'dd-') }))
    .sort((a, b) => a.cardId.localeCompare(b.cardId));
}

/**
 * Delete documents by id (bulk, via _bulk_docs with `_deleted: true`).
 *
 * Fetches each doc's current _rev first; ids that are already absent/deleted
 * are silently skipped. Requires write access to the course DB — in prod the
 * logged-in admin's CouchDB session cookie is sent on the same-origin request.
 */
export async function deleteDocsById(
  ids: string[],
): Promise<{ deleted: string[]; failed: Array<{ id: string; reason: string }> }> {
  if (ids.length === 0) return { deleted: [], failed: [] };

  const revRes = await couchFetch<AllDocsResponse>('_all_docs', {
    method: 'POST',
    body: { keys: ids },
  });
  const deletions: Array<{ _id: string; _rev: string; _deleted: true }> = [];
  for (const row of revRes.rows) {
    if (row.value?.rev && !(row.value as { deleted?: boolean }).deleted) {
      deletions.push({ _id: row.id, _rev: row.value.rev, _deleted: true });
    }
  }
  if (deletions.length === 0) return { deleted: [], failed: [] };

  const result = await couchFetch<
    Array<{ id: string; ok?: boolean; error?: string; reason?: string }>
  >('_bulk_docs', { method: 'POST', body: { docs: deletions } });

  const deleted: string[] = [];
  const failed: Array<{ id: string; reason: string }> = [];
  for (const r of result) {
    if (r.ok) deleted.push(r.id);
    else failed.push({ id: r.id, reason: `${r.error ?? 'error'}: ${r.reason ?? ''}` });
  }
  return { deleted, failed };
}

/**
 * Get all unique tag names referenced across all cards (via elo.tags keys).
 * This is faster than fetching full TAG documents if you only need names.
 */
export async function getAllTagNames(): Promise<string[]> {
  const tags = await getTags();
  return tags.map((t) => t.name).sort();
}

/**
 * Get the distinct question types present in the database.
 */
export async function getQuestionTypes(): Promise<string[]> {
  const summary = await getContentSummary();
  return Object.keys(summary.cardsByType).sort();
}

/**
 * Get tag categories (the prefix before the first colon).
 * e.g. "gpc:exercise:s-S" → "gpc", "ui:spelling" → "ui", "concept:vowel:short" → "concept"
 */
export function categorizeTag(tagName: string): { category: string; rest: string } {
  const colonIdx = tagName.indexOf(':');
  if (colonIdx === -1) return { category: 'other', rest: tagName };
  return {
    category: tagName.slice(0, colonIdx),
    rest: tagName.slice(colonIdx + 1),
  };
}

/**
 * Group tags by their category prefix.
 */
export function groupTagsByCategory(
  tagNames: string[],
): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const tag of tagNames) {
    const { category } = categorizeTag(tag);
    if (!groups[category]) groups[category] = [];
    groups[category].push(tag);
  }
  return groups;
}