# Lessons Directory

Lesson components are hand-rolled Vue files that introduce phonetic concepts via
LetterPeople stage choreography before unlocking concept-gated practice content.

## Curriculum source of truth

What each lesson *releases* (concept tags), *when* it's available (thresholds),
and which GPCs belong to it are **not** defined here — they live in the
curriculum SoT, `content/phoneticAnalytics/lib/curriculum.ts` (imported app-side
via `@/services/curriculum`). `src/services/lessons.ts` derives the lesson
catalog from it; `LessonGateFilter` enforces default-deny gating. To see the
current state-of-the-world (every GPC × state × card counts) read
`content/phoneticAnalytics/outputs-v2/curriculum-coverage.md`, or the live
`/admin/content` → Lessons tab. Pipeline overview:
`content/phoneticAnalytics/CLAUDE.md`.

## Sync Requirements

### Storyboarding.md

`Storyboarding.md` is the canonical reference for lesson step sequences. It must
stay in sync with the actual component implementations.

**When implementing or modifying a lesson:**

- Add or update the lesson's storyboard table in `Storyboarding.md`.
- Each row covers one step: Kind, Actor(s), Content/dialogue, Audio, and any
  Choreography trigger. Follow the existing table format.
- If a step is cut or reordered during development, update the table — do not
  leave stale rows that no longer reflect the component.

**When adding a new lesson definition to `lessons.ts`:**

- Add a stub section to `Storyboarding.md` (even if the component isn't written
  yet) documenting the intended storyboard so future implementors have a spec.

### CATALOG.md

`CATALOG.md` contains curriculum design notes and content sketches. It is
explicitly marked as *not a strong source of truth* — treat it as background
context, not a spec to keep mechanically in sync.

---

## 3D first

Lessons are **3D-first**. A new lesson is a three.js staging only: a shared
step script (e.g. `bedSteps.ts`: the steps, choreography injected) and its
staging in `three/` (e.g. `three/BedLesson3D.vue`), listed in `THREE_D_ONLY`.
The SVG lessons (`NN.*Lesson.vue`) are legacy and trending unsupported: keep
them running, don't build new ones. Where 3D can't run, a 3D-only lesson falls
back to a stub that marks it passed, so what it gates isn't locked away.

## Registering a New Lesson

**Checklist for a new lesson:**

1. Write the step script and the 3D staging (above).
2. In `index.ts`: add its loader to `LESSON_3D_LOADERS` and its id to
   `THREE_D_ONLY`.
3. Add the lesson to the curriculum registry (`LESSON_REGISTRY` in
   `content/phoneticAnalytics/lib/curriculum.ts`) and its `LessonDefinition`
   to `LESSON_CATALOG` (active) or `DEFERRED_LESSON_CATALOG` (pre-production)
   in `src/services/lessons.ts`.
4. Add / update the storyboard table in `Storyboarding.md`.
5. Add it to `/dbg/lesson/three` (`src/dbg/LessonThreeDbg.vue`) and check it
   runs there.

The older `/dbg/lesson` viewer lists `LESSON_CATALOG` / `DEFERRED_LESSON_CATALOG`
and previews lessons registered in `LESSON_COMPONENTS` (SVG); a lesson with a
`LessonDefinition` but no SVG component shows a placeholder there.
