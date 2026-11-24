# Practicing Vignettes

Post-session animated sequences where LetterPeople practice skills. Shown on the `SessionEndScreen` alongside the session summary — a pleasant "treat" for the child while the adult optionally reviews results.

## Purpose & Philosophy

Vignettes serve role #3 from the product vision: **Letters EXEMPLIFY skill acquisition.** Each vignette is a multi-session arc where an uppercase letter (mentor) teaches a lowercase letter (learner) a real-world skill, mirroring the child's own learning journey.

- **Usually uppercase teaches lowercase.** This models a caring mentor/student relationship — deliberate practice curated by a demonstrated expert. (Exception: floss vignette inverts this — lowercase `f` teaches uppercase `F`.)
- **Skill acquisition is visible.** The learner starts awkward, improves over sessions. Progress is gradual and non-linear — setbacks happen, recovery happens.
- **Purely visual.** No speech balloons, no text overlays, no narration. The animation speaks for itself.
- **Audio is per-vignette and optional.** Some skills may warrant sound (e.g., `p` for piano), but it is not a general requirement.

## Structure of a Vignette Session

Sessions (one per learner study session) will typically have two phases:

1. **Scripted intro** — A short narrative sequence: mentor demonstrates, learner reacts, brief teaching moment. Runs once, ~5-15 seconds.
2. **Idle practice loop** — The learner enters an open-ended loop, practicing skill components at and near their current frontier. The mentor independently practices or observes. This loop runs indefinitely until the user navigates away.

The idle loop is the main event. It's meant to be a pleasant, mildly interesting thing to watch — not riveting, not demanding attention. The child sees a letter practicing; the adult optionally skims the session report.

The skill pool for a given stage includes the frontier skill (highest weight) plus previously-learned skills for review/variety, with natural random variation.

## Shared Types

`types.ts` defines the vignette contract:

- `VignetteProps` — what every vignette component accepts: `stage` (0-based progression index) and `autoPlay`
- `VignetteInfo` — metadata exported by each vignette component: `name`, `maxStage`, `description`
- `VignetteMetadata` — `VignetteInfo` + the component reference, used by registries/debug views
- `VIGNETTE_FRAME` — the fixed logical authoring frame (800×450)

## Sizing: Fixed Frame + Contain-Fit Scale

Vignette scenes are authored against the fixed `VIGNETTE_FRAME` — all actor
placement, heights, and walk targets are in frame units, and the `Stage` is
created at exactly that size. The host component wraps the stage in a
`.stage-frame` div that is contain-fit scaled (`useContainScale.ts` — a
ResizeObserver computing `min(w/frameW, h/frameH)`, applied as a CSS
`transform: scale(...)`).

Consequences:

- **Design once, render anywhere.** A scene tuned in `/dbg/vignettes` looks
  identical (just bigger/smaller) on every screen — no choreography ever
  reads the live container size, and window resizes never rebuild the scene.
- **Letterboxing, not cropping.** When the container's aspect differs from
  the frame's, the scene centers with empty margins; the host's background
  gradient fills them. Portrait-ish containers are width-bound and render
  the scene smaller.
- Do NOT read `clientWidth`/`clientHeight` in scene setup or choreography —
  use `VIGNETTE_FRAME` dimensions.

## Integration

`SessionEndScreen.vue` renders the vignette alongside the session summary. It passes a `stage` prop (0-based, representing the learner's cumulative session count mapped to vignette progression) and `autoPlay`. Currently hardcoded to `JJugglingVignette` — will need a vignette selection mechanism as more vignettes are added.

Vignettes use the `Stage` scene system from `src/letterpeople/scene/` to place actors and run choreography.

## Debug

`src/dbg/practicing/PracticeVignettesDbg.vue` — stage picker + replay controls. Registered vignettes are listed in that component's `vignettes` array. Route: `/dbg/vignettes`.

## Existing Vignettes

### J Juggling (`JJugglingVignette.vue`, `juggling-sessions/`)

J teaches j to juggle across **30 stages** (terminal stage 30 loops forever; stage indexes clamp). Stage configs are **derived, not hand-authored**: `stages/skill-timeline.ts` is the single source of truth (milestone table + per-stage metadata), and `stages/derive.ts` computes pools/jitter/remediation from age-decay formulas. Every previously-learned skill stays in the idle pool with a small floor weight — callback play is structural.

Stage 1's intro uses **direct choreography** (`runSession1Intro` in the component); stages 2+ use segment templates (`stages/intro-templates.ts`) played by `runner.ts`. After the intro, `runIdleLoop()` (`idle-runner.ts`) takes over: attempt-based jitter smoothing, drop remediation, and J **guidance re-demos** (after 2 consecutive drops of a skill, J pauses, slowly re-demos it, j watches, retries).

In-app, the stage is driven by a vignette-progress counter in `services/userState` (`advanceVignetteProgress()`), passed `StudyPracticeView` → `SessionEndScreen` → vignette. See `juggling-sessions/TODO-session-progression.md` for the full design (30-stage skeleton, formulas, skill tree).

### F Flossing (`FFlosingVignette.vue`, `flossing-sessions/`)

Lowercase `f` (expert) teaches uppercase `F` (learner) the floss dance across 12 sessions. **Inverts** the usual uppercase-teaches-lowercase pattern — f is the cool little sibling who already knows the move.

Uses **direct inline choreography** throughout (no runner/stages abstraction). The floss is a single repeating motion with parametric deformations, better expressed as a while-loop with config than a segment DSL. Both letters have legs (`legKneeBend: -2`).

Key mechanics: 6-beat arm swing cycle, hip counter-sway, z-layer arm-behind-body passes. Deformation hooks (skip hip, wrong z-layer, timing drift, reduced amplitude, etc.) model F's gradual improvement. See `flossing-sessions/TODO-floss-progression.md` for the full skill decomposition and session scripts.

## Planned Vignettes

b - Baseball. Hitting: from t, small tosses-to-self, small tosses from parent (growing larger), progressions in terms of: adding 'step in' during swing, adding 'body turn' during swing
p - piano. side-by-side Ps at a shared keyboard?

## Adding a New Vignette

1. Create a Vue component implementing `VignetteProps`
2. Export a `VIGNETTE_INFO` constant with `name`, `maxStage`, `description`
3. Create a subdirectory for session configs and a `TODO-*-progression.md` working doc
4. Register in `PracticeVignettesDbg.vue` for debug access
5. Integrate with `SessionEndScreen` vignette selection (currently hardcoded — needs a selection mechanism)

Prefer **direct inline choreography** for new vignettes unless the skill has complex composable phrases (like juggling's physics system). A simple while-loop with parametric configs is easier to author and debug than a segment/runner DSL.
