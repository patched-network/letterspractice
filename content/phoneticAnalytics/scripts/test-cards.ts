/**
 * Card Generation Regression Tests
 * ==================================
 *
 * Property-based invariant checks on generated-cards.json.
 * Run after gen:cards to catch regressions before upload.
 *
 * USAGE:
 *   yarn test:cards
 *
 * ADDING AN INVARIANT:
 *   Append an object to the `invariants` array below. Each invariant is:
 *     { name, description, check(cards, ctx) → Violation[] }
 *   That's it — no imports, no wiring.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { GPC_CATALOGUE, getComprehensiveCatalogue, isOddSightWordChunk, type GPCEntry } from "../lib/catalogue";
import { gpcShortId } from "../lib/content-labelling";
import { alignmentToChunks } from "../lib/chunk-builder";
import { lookupWord } from "../lib/dictionary";
import type { ArpabetPhoneme } from "../lib/types";
import {
  effectiveConceptTags,
  LESSON_REGISTRY,
  GPC_OVERRIDES,
  CATEGORY_DEFAULT_LESSON,
  CONCEPT_POLICIES,
  POST_LESSON_SEED_CARDS,
  UNASSIGNED,
  assignmentFor,
  lessonGatedConceptTags,
  isLessonGatingExempt,
  cardGateTags,
  introGatedBy,
  type LessonId,
  type MasteryThreshold,
  exerciseTagsForLesson,
} from "../lib/curriculum";

// ---------------------------------------------------------------------------
// Path setup
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUTS_V2 = resolve(__dirname, "..", "outputs-v2");
const SRC_ROOT = resolve(__dirname, "..", "..", "..", "src");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeneratedCard {
  _id: string;
  questionType: "SpellingQuestion" | "WhoSaidThat" | "WordSelection" | "MissingLetters" | "GpcIntro" | "DigraphGpcIntro" | "SplitDigraphIntro" | "SightWordIntro";
  data: Record<string, unknown>;
  tags: string[];
  meta: {
    sourceWord?: string;
    sourceGpcId?: string;
    dripRank?: number;
    generationReason: string;
    generatedAt: string;
  };
}

interface GeneratedCardsFile {
  meta: { stats: Record<string, number & { missingLetters?: number }> };
  cards: GeneratedCard[];
}

interface TeachingWord {
  word: string;
  phonemes: string[];
  gpcs: string[];
}

interface SequenceData {
  sequence: Array<{ step: number; gpcId: string }>;
  initialKnown: string[];
}

interface Violation {
  cardId: string;
  detail: string;
}

/** Shared context loaded once, available to all invariants */
interface Ctx {
  wordToPhonemes: Map<string, string[]>;
  wordToGpcs: Map<string, string[]>;
  audioWords: Set<string>;
  sequenceGpcIds: Set<string>;
}

interface Invariant {
  name: string;
  description: string;
  check: (cards: GeneratedCard[], ctx: Ctx) => Violation[];
}

// ---------------------------------------------------------------------------
// Data loaders (mirror generate-cards.ts)
// ---------------------------------------------------------------------------

function loadCtx(): Ctx {
  // Teaching words → phoneme + GPC maps
  const twRaw = readFileSync(
    resolve(OUTPUTS_V2, "teaching-words.json"),
    "utf-8",
  );
  const twData = JSON.parse(twRaw) as { words: TeachingWord[] };
  const wordToPhonemes = new Map<string, string[]>();
  const wordToGpcs = new Map<string, string[]>();
  for (const tw of twData.words) {
    wordToPhonemes.set(tw.word, tw.phonemes);
    wordToGpcs.set(tw.word, tw.gpcs);
  }

  // Audio word list (parsed from source TS file, same regex as gen script)
  const audioContent = readFileSync(
    resolve(SRC_ROOT, "audio", "word-list.ts"),
    "utf-8",
  );
  const audioWords = new Set<string>();
  const re = /^\s+'([a-z]+)'/gm;
  let match;
  while ((match = re.exec(audioContent)) !== null) {
    audioWords.add(match[1]);
  }

  // GPC teaching sequence
  const seqRaw = readFileSync(
    resolve(OUTPUTS_V2, "gpc-sequence.json"),
    "utf-8",
  );
  const seqData = JSON.parse(seqRaw) as SequenceData;
  const sequenceGpcIds = new Set<string>([
    ...seqData.initialKnown,
    ...seqData.sequence.filter((s) => s.step > 0).map((s) => s.gpcId),
    // Synthetic silent-e marker — not a teaching target itself; the generator
    // adds it to its decodability set the same way (see generate-cards.ts).
    "GPC-e-silent-split",
  ]);

  return { wordToPhonemes, wordToGpcs, audioWords, sequenceGpcIds };
}

// ---------------------------------------------------------------------------
// Invariant registry — append new checks here
// ---------------------------------------------------------------------------

const invariants: Invariant[] = [
  // #1 — discovered: see/sea as WS pair (indistinguishable by ear)
  {
    name: "no-homophone-distractors",
    description:
      "WS cards must not pair a target with distractors that have an identical phoneme sequence",
    check(cards, ctx) {
      const violations: Violation[] = [];
      for (const card of cards) {
        if (card.questionType !== "WordSelection") continue;
        const target = card.data.target as string;
        const distractors = (card.data.distractors as string).split(",");

        const targetPhonemes = ctx.wordToPhonemes.get(target);
        if (!targetPhonemes) continue;
        const targetKey = targetPhonemes.join(" ");

        for (const dist of distractors) {
          const distPhonemes = ctx.wordToPhonemes.get(dist);
          if (!distPhonemes) continue;
          if (distPhonemes.join(" ") === targetKey) {
            violations.push({
              cardId: card._id,
              detail: `"${target}" and "${dist}" are homophones (${targetKey})`,
            });
          }
        }
      }
      return violations;
    },
  },

  // #2
  {
    name: "no-self-distraction",
    description: "WS target must not appear in its own distractor list",
    check(cards) {
      const violations: Violation[] = [];
      for (const card of cards) {
        if (card.questionType !== "WordSelection") continue;
        const target = card.data.target as string;
        const distractors = (card.data.distractors as string).split(",");
        if (distractors.includes(target)) {
          violations.push({
            cardId: card._id,
            detail: `target "${target}" is also a distractor`,
          });
        }
      }
      return violations;
    },
  },

  // #3
  {
    name: "minimum-distractors",
    description: "WS cards must have at least 1 distractor",
    check(cards) {
      const violations: Violation[] = [];
      for (const card of cards) {
        if (card.questionType !== "WordSelection") continue;
        const distractors = (card.data.distractors as string).split(",").filter(Boolean);
        if (distractors.length < 1) {
          violations.push({
            cardId: card._id,
            detail: `no distractors`,
          });
        }
      }
      return violations;
    },
  },

  // #4
  {
    name: "unique-card-ids",
    description: "Every card must have a unique _id",
    check(cards) {
      const violations: Violation[] = [];
      const seen = new Map<string, number>();
      for (const card of cards) {
        const prev = seen.get(card._id);
        if (prev !== undefined) {
          violations.push({
            cardId: card._id,
            detail: `duplicate (first at index ${prev})`,
          });
        }
        seen.set(card._id, seen.size);
      }
      return violations;
    },
  },

  // #5
  {
    name: "required-tags",
    description:
      "Every card needs exactly 1 ui:* tag, plus gpc:exercise:* (exercise cards) or gpc:intro:* (intro cards)",
    check(cards) {
      // Intro cards deliberately carry gpc:intro:* instead of gpc:exercise:*
      // (they present a GPC; nothing is exercised).
      const INTRO_UI_TAGS = new Set([
        "ui:gpc-intro",
        "ui:digraph-gpc-intro",
        "ui:split-digraph-intro",
        "ui:sight-word-intro",
      ]);
      const violations: Violation[] = [];
      for (const card of cards) {
        const uiTags = card.tags.filter((t) => t.startsWith("ui:"));
        const isIntro = card.tags.some((t) => INTRO_UI_TAGS.has(t));
        const requiredPrefix = isIntro ? "gpc:intro:" : "gpc:exercise:";

        if (!card.tags.some((t) => t.startsWith(requiredPrefix))) {
          violations.push({
            cardId: card._id,
            detail: `missing ${requiredPrefix}* tag`,
          });
        }
        if (uiTags.length !== 1) {
          violations.push({
            cardId: card._id,
            detail: `expected 1 ui:* tag, got ${uiTags.length}: [${uiTags.join(", ")}]`,
          });
        }
      }
      return violations;
    },
  },

  // #6
  {
    name: "audio-coverage",
    description:
      "All words in SQ and WS cards must have recorded audio",
    check(cards, ctx) {
      const violations: Violation[] = [];
      for (const card of cards) {
        const words: string[] = [];
        if (card.questionType === "SpellingQuestion") {
          words.push(card.data.word as string);
        } else if (card.questionType === "WordSelection") {
          words.push(card.data.target as string);
          words.push(...(card.data.distractors as string).split(","));
        }
        for (const w of words) {
          if (!ctx.audioWords.has(w)) {
            violations.push({
              cardId: card._id,
              detail: `word "${w}" not in audio word list`,
            });
          }
        }
      }
      return violations;
    },
  },

  // #7
  {
    name: "words-decodable",
    description:
      "All SQ/WS words must be fully decodable (all GPCs in teaching sequence)",
    check(cards, ctx) {
      const violations: Violation[] = [];
      const checked = new Set<string>();
      for (const card of cards) {
        const words: string[] = [];
        if (card.questionType === "SpellingQuestion") {
          words.push(card.data.word as string);
        } else if (card.questionType === "WordSelection") {
          words.push(card.data.target as string);
          words.push(...(card.data.distractors as string).split(","));
        }
        for (const w of words) {
          if (checked.has(w)) continue;
          checked.add(w);
          const gpcs = ctx.wordToGpcs.get(w);
          if (!gpcs) continue; // not in teaching-words — skip (audio-coverage catches it)
          // Sight words are taught as whole words, whether or not the
          // sequencer placed their WORD-* GPC (it often credits a regular
          // reading instead).
          const missing = gpcs.filter((g) => !ctx.sequenceGpcIds.has(g) && !g.startsWith("GPC-WORD-"));
          if (missing.length > 0) {
            violations.push({
              cardId: card._id,
              detail: `word "${w}" has GPCs outside sequence: ${missing.join(", ")}`,
            });
          }
        }
      }
      return violations;
    },
  },

  // #8 — "i" renders as lowercase but the word requires uppercase "I"
  {
    name: "no-blocked-words",
    description:
      "Blocked words must not appear as SQ targets or WS targets/distractors",
    check(cards) {
      const BLOCKED = new Set(["i"]);
      const violations: Violation[] = [];
      for (const card of cards) {
        const words: string[] = [];
        if (card.questionType === "SpellingQuestion") {
          words.push(card.data.word as string);
        } else if (card.questionType === "WordSelection") {
          words.push(card.data.target as string);
          words.push(...(card.data.distractors as string).split(","));
        }
        for (const w of words) {
          if (BLOCKED.has(w)) {
            violations.push({
              cardId: card._id,
              detail: `blocked word "${w}"`,
            });
          }
        }
      }
      return violations;
    },
  },

  // #9 — MissingLetters blanks must be valid indices within the word
  {
    name: "ml-valid-blanks",
    description:
      "ML card blank indices must be valid (within word length, no duplicates)",
    check(cards) {
      const violations: Violation[] = [];
      for (const card of cards) {
        if (card.questionType !== "MissingLetters") continue;
        const word = card.data.word as string;
        const blanksStr = card.data.blanks as string;
        if (!word || !blanksStr) {
          violations.push({
            cardId: card._id,
            detail: `missing word or blanks field`,
          });
          continue;
        }
        const indices = blanksStr.split(",").map(Number);
        const seen = new Set<number>();
        for (const idx of indices) {
          if (idx < 0 || idx >= word.length) {
            violations.push({
              cardId: card._id,
              detail: `blank index ${idx} out of range for "${word}" (length ${word.length})`,
            });
          }
          if (seen.has(idx)) {
            violations.push({
              cardId: card._id,
              detail: `duplicate blank index ${idx}`,
            });
          }
          seen.add(idx);
        }
      }
      return violations;
    },
  },

  // #10 — MissingLetters must not blank the entire word (that's SQ)
  {
    name: "ml-not-all-blanked",
    description:
      "ML cards must not blank every letter (use SpellingQuestion instead)",
    check(cards) {
      const violations: Violation[] = [];
      for (const card of cards) {
        if (card.questionType !== "MissingLetters") continue;
        const word = card.data.word as string;
        const blanksStr = card.data.blanks as string;
        if (!word || !blanksStr) continue;
        const indices = blanksStr.split(",").filter(Boolean);
        if (indices.length >= word.length) {
          violations.push({
            cardId: card._id,
            detail: `all ${word.length} letters blanked in "${word}"`,
          });
        }
      }
      return violations;
    },
  },

  // #11 — MissingLetters audio and decodability (extend existing coverage to ML)
  {
    name: "ml-audio-coverage",
    description:
      "ML words must have recorded audio",
    check(cards, ctx) {
      const violations: Violation[] = [];
      for (const card of cards) {
        if (card.questionType !== "MissingLetters") continue;
        const word = card.data.word as string;
        if (word && !ctx.audioWords.has(word)) {
          violations.push({
            cardId: card._id,
            detail: `word "${word}" not in audio word list`,
          });
        }
      }
      return violations;
    },
  },

  // #12 — MissingLetters words must not be blocked
  {
    name: "ml-no-blocked-words",
    description:
      "ML words must not be in the blocked words list",
    check(cards) {
      const BLOCKED = new Set(["i"]);
      const violations: Violation[] = [];
      for (const card of cards) {
        if (card.questionType !== "MissingLetters") continue;
        const word = card.data.word as string;
        if (word && BLOCKED.has(word)) {
          violations.push({
            cardId: card._id,
            detail: `blocked word "${word}"`,
          });
        }
      }
      return violations;
    },
  },
  // -------------------------------------------------------------------------
  // Curriculum audits (P0.2 obligations) — these check lib/curriculum.ts
  // against the catalogue, the app lesson catalog, and emitted strategy
  // configs. They take (cards, ctx) like every invariant but several ignore
  // the card list; `cardId` carries the offending entity id.
  // -------------------------------------------------------------------------

  // #13 — referential integrity: overrides must point at real catalogue GPCs
  {
    name: "curriculum-override-integrity",
    description: "Every GPC_OVERRIDES key must exist in the GPC catalogue",
    check() {
      const ids = new Set(GPC_CATALOGUE.map((e) => e.id));
      return Object.keys(GPC_OVERRIDES)
        .filter((id) => !ids.has(id))
        .map((id) => ({ cardId: id, detail: "override key not in catalogue" }));
    },
  },

  // #14 — teaching-tier totality: every carded GPC has a curriculum home
  {
    name: "curriculum-teaching-totality",
    description:
      "Every teaching-tier GPC (v0.2–v0.4) must resolve to a lesson assignment (or explicit unassigned)",
    check() {
      return getComprehensiveCatalogue()
        .filter((e) => assignmentFor(e) === null)
        .map((e) => ({
          cardId: e.id,
          detail: `no override and no category default for category "${e.category}"`,
        }));
    },
  },

  // #15 — every unlockedBy target is a registry lesson (typecheck would catch
  // this, but the scripts tsconfig is currently broken — see tooling aside)
  {
    name: "curriculum-lesson-refs",
    description:
      "Every unlockedBy (overrides + category defaults) must reference a registry lesson or be unassigned",
    check() {
      const lessonIds = new Set<string>(LESSON_REGISTRY.map((l) => l.id));
      const violations: Violation[] = [];
      for (const [gpcId, a] of Object.entries(GPC_OVERRIDES)) {
        if (a.unlockedBy !== UNASSIGNED && !lessonIds.has(a.unlockedBy)) {
          violations.push({
            cardId: gpcId,
            detail: `unlockedBy "${a.unlockedBy}" not in lesson registry`,
          });
        }
      }
      for (const [cat, lesson] of Object.entries(CATEGORY_DEFAULT_LESSON)) {
        if (lesson !== UNASSIGNED && !lessonIds.has(lesson)) {
          violations.push({
            cardId: `category:${cat}`,
            detail: `default lesson "${lesson}" not in lesson registry`,
          });
        }
      }
      return violations;
    },
  },

  // #16 — registry twins: app lesson catalog ↔ curriculum registry.
  // Parses src/services/lessons.ts as text (same precedent as word-list.ts);
  // P3.2 will derive the app catalog from curriculum.ts, after which this
  // guards against the derivation being bypassed.
  {
    name: "curriculum-registry-twins",
    description:
      "Every lesson in the app's LESSON_CATALOG / DEFERRED_LESSON_CATALOG must have a curriculum registry twin with matching status",
    check() {
      const src = readFileSync(
        resolve(SRC_ROOT, "services", "lessons.ts"),
        "utf-8",
      );
      const arrayIds = (marker: string): string[] => {
        const start = src.indexOf(marker);
        if (start === -1) return [];
        const body = src.slice(start, src.indexOf("\n];", start));
        const ids: string[] = [];
        // uncommented `id: '...'` lines only
        for (const m of body.matchAll(/^\s*id: '([a-z-]+)'/gm)) ids.push(m[1]);
        return ids;
      };
      const violations: Violation[] = [];
      const registry = new Map(LESSON_REGISTRY.map((l) => [l.id as string, l]));
      const seen: Array<[string, "active" | "deferred"]> = [
        ...arrayIds("export const LESSON_CATALOG").map(
          (id): [string, "active"] => [id, "active"],
        ),
        ...arrayIds("export const DEFERRED_LESSON_CATALOG").map(
          (id): [string, "deferred"] => [id, "deferred"],
        ),
      ];
      if (seen.length === 0) {
        return [
          {
            cardId: "lessons.ts",
            detail: "parsed 0 lesson ids — parser is broken, fix the audit",
          },
        ];
      }
      for (const [id, appStatus] of seen) {
        const twin = registry.get(id);
        if (!twin) {
          violations.push({
            cardId: id,
            detail: `in app ${appStatus} catalog but missing from curriculum LESSON_REGISTRY`,
          });
        } else if (twin.status !== appStatus) {
          violations.push({
            cardId: id,
            detail: `app catalog says ${appStatus}, registry says ${twin.status}`,
          });
        }
      }
      return violations;
    },
  },

  // #17b — mastery breadth rules are reachable: enough of each named slate
  // has exercise cards (an uncarded GPC can never be met, so an unreachable
  // rule would hold its lesson forever).
  {
    name: "mastery-breadth-reachable",
    description:
      "Every lessonAvailability.mastery.breadth rule must be satisfiable from GPCs that have exercise cards",
    check(cards) {
      const carded = new Set(
        cards.flatMap((c) => c.tags.filter((t) => t.startsWith("gpc:exercise:"))),
      );
      const violations: Violation[] = [];
      for (const [concept, policy] of Object.entries(CONCEPT_POLICIES)) {
        for (const rule of policy.lessonAvailability?.mastery?.breadth ?? []) {
          const slate = exerciseTagsForLesson(rule.lesson, GPC_CATALOGUE);
          const needed = Math.ceil(rule.fraction * slate.length);
          const have = slate.filter((t) => carded.has(t)).length;
          if (have < needed) {
            violations.push({
              cardId: concept,
              detail: `breadth ${JSON.stringify(rule)} needs ${needed} of ${slate.length} met, only ${have} carded`,
            });
          }
        }
      }
      return violations;
    },
  },

  // #17 — mustMatch contract: lesson availability mirrors pipeline prereqs
  {
    name: "curriculum-mustmatch",
    description:
      "Concepts with mustMatch: true must have lessonAvailability.masteryPrereqs deep-equal to pipelinePrereqs",
    check() {
      const key = (ts: MasteryThreshold[] | undefined) =>
        JSON.stringify(
          (ts ?? [])
            .map((t) => [t.tag, t.minCount ?? null, t.minElo ?? null])
            .sort(),
        );
      const violations: Violation[] = [];
      for (const [concept, policy] of Object.entries(CONCEPT_POLICIES)) {
        if (!policy.mustMatch) continue;
        if (
          key(policy.pipelinePrereqs) !==
          key(policy.lessonAvailability?.masteryPrereqs)
        ) {
          violations.push({
            cardId: concept,
            detail:
              "mustMatch: true but pipelinePrereqs ≠ lessonAvailability.masteryPrereqs",
          });
        }
      }
      return violations;
    },
  },

  // #18 — emitted hierarchy-concept.json agrees with CONCEPT_POLICIES.
  // Until P2.5 derives the emit from curriculum.ts, the policies are staged
  // copies — this is the drift alarm for that window (and after P2.5, the
  // "you forgot to regenerate" alarm).
  {
    name: "curriculum-hierarchy-concept-sync",
    description:
      "strategy-configs/hierarchy-concept.json prerequisites must equal CONCEPT_POLICIES pipelinePrereqs (both directions)",
    check() {
      interface EmittedPrereq {
        tag: string;
        masteryThreshold: { minCount?: number; minElo?: number };
      }
      const emitted = JSON.parse(
        readFileSync(
          resolve(OUTPUTS_V2, "strategy-configs", "hierarchy-concept.json"),
          "utf-8",
        ),
      ) as { prerequisites: Record<string, EmittedPrereq[]> };

      const key = (ts: Array<[string, number | null, number | null]>) =>
        JSON.stringify(ts.sort());
      const emittedKey = (ps: EmittedPrereq[]) =>
        key(
          ps.map((p) => [
            p.tag,
            p.masteryThreshold.minCount ?? null,
            p.masteryThreshold.minElo ?? null,
          ]),
        );
      const policyKey = (ts: MasteryThreshold[]) =>
        key(ts.map((t) => [t.tag, t.minCount ?? null, t.minElo ?? null]));

      const violations: Violation[] = [];
      const policyConcepts = new Map(
        Object.entries(CONCEPT_POLICIES).filter(
          ([, p]) => p.pipelinePrereqs && p.pipelinePrereqs.length > 0,
        ),
      );
      for (const [concept, prereqs] of Object.entries(emitted.prerequisites)) {
        const policy = policyConcepts.get(concept);
        if (!policy) {
          violations.push({
            cardId: concept,
            detail: "emitted in hierarchy-concept.json but no pipelinePrereqs in CONCEPT_POLICIES",
          });
        } else if (emittedKey(prereqs) !== policyKey(policy.pipelinePrereqs!)) {
          violations.push({
            cardId: concept,
            detail: "emitted prerequisites differ from CONCEPT_POLICIES.pipelinePrereqs",
          });
        }
      }
      for (const concept of policyConcepts.keys()) {
        if (!(concept in emitted.prerequisites)) {
          violations.push({
            cardId: concept,
            detail: "has pipelinePrereqs in CONCEPT_POLICIES but missing from hierarchy-concept.json",
          });
        }
      }
      return violations;
    },
  },

  // #20 — gated concept tags must trace to what the card actually teaches.
  // Trace sources: exercised/introduced GPCs (curriculum-effective tags);
  // for WordSelection additionally every GPC of the words on the card — the
  // discrimination task spans target AND distractors, so a concept any of
  // those words requires is a legitimate gate (split-contrast cards carry
  // concept:match:split_digraph on the short-vowel-target card because the
  // distractor is the magic-e word).
  // Spelling cards exercise every GPC in their word (locked decision), so
  // their full concept set traces by construction.
  // MissingLetters on a sight word additionally trace to the word's own
  // whole-word GPC: the card blanks a fair letter but is *about* the sight
  // word, and is deliberately gated behind its lesson (#23).
  {
    name: "concept-tags-traceable",
    description:
      "Every lesson-gated concept tag must trace to an exercised/introduced GPC (WS: any GPC of the card's words)",
    check(cards, ctx) {
      const entryByShortId = new Map<string, GPCEntry>();
      for (const e of GPC_CATALOGUE) entryByShortId.set(gpcShortId(e.id), e);
      const addEntryTags = (allowed: Set<string>, gpcId: string) => {
        const entry = entryByShortId.get(gpcShortId(gpcId));
        if (!entry) return; // synthetic (e-silent-split) or unknown
        for (const ct of effectiveConceptTags(entry)) allowed.add(ct);
      };

      const violations: Violation[] = [];
      for (const card of cards) {
        // A lesson's gate stamp traces to the curriculum naming the card
        // (LESSON_GATED_CARDS), not to a GPC
        const allowed = new Set<string>(cardGateTags(card._id));
        for (const tag of card.tags) {
          const m = tag.match(/^gpc:(?:exercise|intro):(.+)$/);
          if (m) addEntryTags(allowed, m[1]);
        }
        if (card.questionType === "MissingLetters") {
          for (const g of ctx.wordToGpcs.get(card.data.word as string) ?? []) {
            if (g.startsWith("GPC-WORD-")) addEntryTags(allowed, g);
          }
        }
        if (card.questionType === "WordSelection") {
          const words = [
            card.data.target as string,
            ...((card.data.distractors as string) ?? "").split(","),
          ];
          for (const w of words) {
            for (const g of ctx.wordToGpcs.get(w) ?? []) {
              addEntryTags(allowed, g);
            }
          }
        }
        for (const tag of card.tags) {
          if (!tag.startsWith("concept:")) continue;
          if (isLessonGatingExempt(tag)) continue;
          if (allowed.has(tag)) continue;
          violations.push({
            cardId: card._id,
            detail: `gated concept tag "${tag}" does not trace to an exercised/introduced GPC`,
          });
        }
      }
      return violations;
    },
  },

  // #19 — every concept tag on a generated card is accounted for
  {
    name: "concept-tags-known",
    description:
      "Every concept:* tag on a card must be lesson-gated in curriculum.ts or lesson-gating-exempt (skill/interference/blend)",
    check(cards) {
      const gated = lessonGatedConceptTags();
      const violations: Violation[] = [];
      const flagged = new Set<string>();
      for (const card of cards) {
        for (const tag of card.tags) {
          if (!tag.startsWith("concept:")) continue;
          if (isLessonGatingExempt(tag)) continue;
          if (gated.has(tag)) continue;
          if (flagged.has(tag)) continue; // one violation per unknown tag
          flagged.add(tag);
          violations.push({
            cardId: card._id,
            detail: `concept tag "${tag}" not in curriculum lesson-gated set (first occurrence)`,
          });
        }
      }
      return violations;
    },
  },

  // #21 — the intro-prereq deadlock class, structurally
  // (agent/lessons-audit/c.1). A hierarchy prereq targeting a tag no card
  // bears can never be satisfied and soft-suppresses every bearer of the
  // key tag forever (gu-G, s-Z ×49); an entry KEYED on an unborne tag gates
  // nothing and pollutes the registry. generate-strategy-configs.ts emits
  // conditionally on borne tags and safety-prunes; this re-asserts the
  // result on the written output so the class cannot come back.
  {
    name: "hierarchy-tags-borne",
    description:
      "Every hierarchy prereq entry key and target tag must be borne by ≥1 generated card (all three scopes)",
    check(cards) {
      const borne = new Set<string>();
      for (const card of cards) {
        for (const tag of card.tags) borne.add(tag);
      }
      const violations: Violation[] = [];
      for (const scope of ["gpc", "concept", "ui"]) {
        const file = `hierarchy-${scope}.json`;
        let config: { prerequisites: Record<string, Array<{ tag: string }>> };
        try {
          config = JSON.parse(
            readFileSync(
              resolve(OUTPUTS_V2, "strategy-configs", file),
              "utf-8",
            ),
          );
        } catch {
          violations.push({
            cardId: file,
            detail: "missing/unreadable — run 'yarn gen:strategies' (after gen:cards)",
          });
          continue;
        }
        for (const [key, prereqs] of Object.entries(config.prerequisites)) {
          if (!borne.has(key)) {
            violations.push({
              cardId: `${file}:${key}`,
              detail: `prereq entry keyed on tag no card bears`,
            });
          }
          for (const p of prereqs) {
            if (!borne.has(p.tag)) {
              violations.push({
                cardId: `${file}:${key}`,
                detail: `prereq targets unborne tag "${p.tag}" — unsatisfiable, permanently suppresses bearers of ${key}`,
              });
            }
          }
        }
      }
      return violations;
    },
  },

  // #22 — post-lesson seed cards (lesson-is-the-intro follow-through) must
  // reference real cards that the naming lesson actually releases. Guards
  // the curriculum.ts prescriptions against card-id format drift and
  // against seeding a card the lesson's concept gate wouldn't release.
  {
    name: "post-lesson-seed-cards-exist",
    description:
      "Every POST_LESSON_SEED_CARDS id must exist in generated-cards.json and carry a concept tag its lesson gates (or involve a GPC whose intro card it gates)",
    check(cards) {
      const byId = new Map(cards.map((c) => [c._id, c]));
      const lessonById = new Map(LESSON_REGISTRY.map((l) => [l.id, l]));
      const violations: Violation[] = [];
      for (const [lessonId, seedIds] of Object.entries(
        POST_LESSON_SEED_CARDS,
      )) {
        const lesson = lessonById.get(lessonId as LessonId);
        if (!lesson) {
          violations.push({
            cardId: lessonId,
            detail: "POST_LESSON_SEED_CARDS key is not a registry lesson",
          });
          continue;
        }
        for (const seedId of seedIds ?? []) {
          const card = byId.get(seedId);
          if (!card) {
            violations.push({
              cardId: seedId,
              detail: `seed card for lesson "${lessonId}" not found in generated cards`,
            });
            continue;
          }
          const gates = new Set(lesson.gatesConcepts);
          // Or it involves a GPC whose intro card the lesson gates by name
          // (bed: b's sound card, and the b/d mirror pair, which shows b)
          const behindGatedIntro = card.tags.some((t) => {
            const m = t.match(/^gpc:(?:exercise|intro|expose):(.+)$/);
            return !!m && introGatedBy(`GPC-${m[1]}`) === lessonId;
          });
          if (!behindGatedIntro && !card.tags.some((t) => gates.has(t))) {
            violations.push({
              cardId: seedId,
              detail: `seed card carries no concept tag gated by lesson "${lessonId}" (${lesson.gatesConcepts.join(", ")})`,
            });
          }
        }
      }
      return violations;
    },
  },

  // #23 — every card touching a sight word waits for the sight-words lesson.
  // MissingLetters carries only its tested GPC's concept, so a fair-letter
  // blank (`_as` in "was") would otherwise release on day one.
  {
    name: "sight-cards-gated",
    description: "Cards bearing a gpc:*:WORD-* tag carry concept:match:whole_word",
    check(cards) {
      const violations: Violation[] = [];
      for (const card of cards) {
        const touchesSightWord = card.tags.some((t) => /^gpc:[a-z]+:WORD-/.test(t));
        if (touchesSightWord && !card.tags.includes("concept:match:whole_word")) {
          violations.push({ cardId: card._id, detail: "sight-word card without concept:match:whole_word" });
        }
      }
      return violations;
    },
  },

  // #24 — sight-word MissingLetters blank a fair letter (exercising its
  // GPC), or the odd part whole (w_s, s__d: exercising the word). Never a
  // slice of the odd part, never a silent letter (it has no chunk).
  {
    name: "sight-ml-blanks",
    description: "MissingLetters exercising a sight word's own GPC blank exactly one whole odd chunk",
    check(cards) {
      const violations: Violation[] = [];
      for (const c of cards) {
        if (c.questionType !== "MissingLetters") continue;
        if (!c.tags.some((t) => t.startsWith("gpc:exercise:WORD-"))) continue;
        const word = String(c.data.word);
        const phonemes = lookupWord(word)?.phonemes as ArpabetPhoneme[] | undefined;
        const chunks = phonemes ? alignmentToChunks(word, phonemes) : [];
        const blanks = String(c.data.blanks);
        const whole = chunks.some(
          (ch) =>
            isOddSightWordChunk(word, ch) &&
            Object.keys(ch.letters).map(Number).sort((a, b) => a - b).join(",") === blanks,
        );
        if (!whole) violations.push({ cardId: c._id, detail: `blanks ${blanks} aren't one whole odd chunk of "${word}"` });
      }
      return violations;
    },
  },

  // #25 — no self-lock: a gpc:* prerequisite must be satisfiable by some card
  // it doesn't lock. If every card bearing prereq tag P also bears the locked
  // tag T, P can only be earned by cards T holds back (e.g. an intro card that
  // bears its own gpc:expose:X when expose:X requires intro:X). Concept
  // prereqs are skipped — lessons satisfy those, not cards.
  {
    name: "no-self-lock",
    description: "Every gpc:* hierarchy prereq is borne by ≥1 card not locked by it",
    check(cards) {
      const violations: Violation[] = [];
      let config: { prerequisites: Record<string, Array<{ tag: string }>> };
      try {
        config = JSON.parse(
          readFileSync(resolve(OUTPUTS_V2, "strategy-configs", "hierarchy-gpc.json"), "utf-8"),
        );
      } catch {
        return [{ cardId: "hierarchy-gpc.json", detail: "missing/unreadable — run 'yarn gen:strategies' (after gen:cards)" }];
      }
      const bearers = new Map<string, GeneratedCard[]>();
      for (const card of cards) {
        for (const tag of card.tags) bearers.set(tag, [...(bearers.get(tag) ?? []), card]);
      }
      for (const [locked, prereqs] of Object.entries(config.prerequisites)) {
        for (const { tag: prereq } of prereqs) {
          if (!prereq.startsWith("gpc:")) continue;
          const providers = bearers.get(prereq) ?? [];
          if (providers.length > 0 && providers.every((c) => c.tags.includes(locked))) {
            violations.push({
              cardId: `hierarchy-gpc.json:${locked}`,
              detail: `prereq "${prereq}" is borne only by cards "${locked}" locks (${providers.map((c) => c._id).slice(0, 3).join(", ")})`,
            });
          }
        }
      }
      return violations;
    },
  },

  // #26 — a sight-word intro's follow-up (required next by its completion
  // replan) exists, and every sight word it bears is introduced by then (by
  // this card's family or an earlier card in the drip): a required card
  // bypasses the filters, so it would otherwise surface ahead of an intro.
  {
    name: "sight-intro-follow-up",
    description: "SightWordIntro follow-ups exist and bear only sight words introduced by then",
    check(cards) {
      const violations: Violation[] = [];
      const byId = new Map(cards.map((c) => [c._id, c]));
      const intros = cards
        .filter((card) => card.questionType === "SightWordIntro")
        .sort((a, b) => (a.meta.dripRank ?? Infinity) - (b.meta.dripRank ?? Infinity));
      const introduced = new Set<string>();
      for (const c of intros) {
        for (const w of [String(c.data.word), ...String(c.data.family ?? "").split(/\s+/)]) if (w) introduced.add(w);
        for (const id of String(c.data.followUp ?? "").split(/\s+/).filter(Boolean)) {
          const target = byId.get(id);
          if (!target) {
            violations.push({ cardId: c._id, detail: `follow-up ${id} doesn't exist` });
            continue;
          }
          const early = target.tags
            .map((t) => t.match(/^gpc:[a-z]+:WORD-(.+)$/)?.[1])
            .filter((w): w is string => !!w && !introduced.has(w));
          if (early.length) violations.push({ cardId: c._id, detail: `follow-up ${id} bears ${early.join(", ")}, not introduced yet` });
        }
      }
      return violations;
    },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function main() {
  console.log("=== Card Generation Regression Tests ===\n");

  // Load generated cards
  const cardsPath = resolve(OUTPUTS_V2, "generated-cards.json");
  let cardsFile: GeneratedCardsFile;
  try {
    cardsFile = JSON.parse(readFileSync(cardsPath, "utf-8"));
  } catch (error) {
    console.error(`Failed to load ${cardsPath}: ${error}`);
    console.error("Run 'yarn gen:cards' first.");
    process.exit(1);
  }

  const s = cardsFile.meta.stats;
  console.log(
    `Loaded ${cardsFile.cards.length} cards (${s.spelling} SQ, ${s.whoSaidThat} WST, ${s.wordSelection} WS, ${s.missingLetters ?? 0} ML)\n`,
  );

  // Load reference data
  console.log("Loading reference data...");
  const ctx = loadCtx();
  console.log(
    `  phonemes: ${ctx.wordToPhonemes.size} words, audio: ${ctx.audioWords.size} words, GPCs: ${ctx.sequenceGpcIds.size}\n`,
  );

  // Run invariants
  let totalViolations = 0;
  let failedInvariants = 0;

  for (const inv of invariants) {
    const violations = inv.check(cardsFile.cards, ctx);
    if (violations.length === 0) {
      console.log(`  PASS  ${inv.name}`);
    } else {
      failedInvariants++;
      totalViolations += violations.length;
      console.log(`  FAIL  ${inv.name}  (${violations.length} violation(s))`);
      console.log(`        ${inv.description}`);
      const MAX_SHOW = 5;
      for (const v of violations.slice(0, MAX_SHOW)) {
        console.log(`          ${v.cardId}: ${v.detail}`);
      }
      if (violations.length > MAX_SHOW) {
        console.log(
          `          ... and ${violations.length - MAX_SHOW} more`,
        );
      }
    }
  }

  // Summary
  console.log(
    `\n${invariants.length} invariants, ${failedInvariants} failed, ${totalViolations} total violations`,
  );

  if (failedInvariants > 0) {
    process.exit(1);
  } else {
    console.log("\nAll checks passed.");
  }
}

main();
