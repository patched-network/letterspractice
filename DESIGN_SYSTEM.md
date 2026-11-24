# LettersPractice Design System

**Reference this document when building UI components, styling interfaces, or working with colors.**

## UI Framework

- Uses **Vuetify 3.x** - prefer using Vuetify components where applicable
- Material UI color scheme defined in `./skuilder.config.json`
- **Always use Vuetify semantic colors** (`primary`, `success`, etc.) for UI components

## Color Design System: Two-Tier Palette

The application uses a **two-tier color system** for clear visual hierarchy:

### Tier 1: Action Colors (High Saturation)
- **Purpose**: Buttons, interactive controls, persistent UI elements
- **Source**: Vuetify semantic colors from `skuilder.config.json` (primary, success, error, etc.)
- **Characteristics**: High chroma (fully saturated), authoritative appearance
- **Usage**: Reference via Vuetify semantic names (`color="primary"`). When inlining for canvas/SVG, use config values and document source.

### Tier 2: Content Colors (Pastel/Desaturated)
- **Purpose**: LetterPeople characters, suspect cards, educational content
- **Source**: Generated programmatically via OKLCH utilities (`src/letterpeople/util/color.ts`)
- **Characteristics**: Low chroma, high lightness, soft and approachable
- **Usage**: Apply OKLCH transformations (lighten +0.25, desaturate -0.12) to create pastel variants

## Color Space: OKLCH

All color transformations use **OKLCH** (Oklab LCH) for perceptually uniform adjustments. This ensures:
- Equal changes in values produce equal perceived changes
- Chroma and lightness are independent
- Consistent accessibility through direct lightness control

**Key utilities** (`src/letterpeople/util/color.ts`):
- `colorToOklch()` / `oklchToRgbString()` - Parsing and conversion
- `adjustLightness()` / `adjustChroma()` - Perceptual adjustments
- `randomVibrancyColor()` / `generateVibrancyRainbow()` - Generation
- `ColorPresets.vibrancyHigh` / `ColorPresets.pastel` - Common configurations

## Design Principles

### Low Text in Learning Components

**The primary userbase is pre-literate.** Runtime learning components (question views, practice activities, LetterPeople interactions) must communicate through visuals, audio, and animation — never through written instructions, labels, or feedback messages. Text is acceptable only in:
- Parent-facing UI (settings, dashboards, onboarding)
- Debug views (developer tooling)
- Accessibility attributes (`aria-label`, `alt` text)

Use pips/dots for progress, audio cues for feedback, and animation for state changes. Show, don't tell.

### Separation by Saturation

Action buttons stay vibrant while educational content stays pastel, regardless of hue. This creates clear functional distinction that works even when LetterPeople colors randomly approach button hues (green, orange).

## Bridging Tiers: Procedural Color Relationships

When action elements correspond to specific content (e.g., keyboard keys representing LetterPeople suspects), derive action colors procedurally from content colors to maintain visual connection:

```typescript
// Keyboard key for a suspect: darken the LetterPerson color for legibility
const suspectColor = letterPerson.color;  // Tier 2 (pastel)
const oklch = colorToOklch(suspectColor);
const keyColor = oklchToRgbString(
  adjustLightness(oklch, -0.1)  // Darken slightly for Tier 1 usage
);
```

This preserves the hue relationship while adjusting saturation/lightness to meet Tier 1 requirements (sufficient contrast for interactivity).

## Categorical Palette (one of N kinds)

When colour marks *which one of a set* something is (lessons on /curriculum, the learning engine's rivals), it comes from **one fixed hue order**: `src/theme/categoricalPalette.ts` (`CATEGORICAL`). Assign slots in order, never cycled. A role picks a **tier**, derived in OKLCH, rather than keeping its own hex list:

- **base**: the slots as listed. Bright marks on the page surface, with ink (not white) labels on them (lesson discs).
- **deep** (`deepTier()`): lightness capped, hue and chroma kept. Deep enough to knock a white glyph out of a disc (rival discs).

Rules:
- **Validate before use.** A new slot, order or tier runs through the dataviz skill's `validate_palette.js` on the surface it sits on. Several slots fall below 3:1 on the light surface, so every coloured mark also carries its label or icon: colour is never the only identity.
- **One role per surface.** Two roles share hues, so never colour both on the same surface (e.g. the landing's Under the Hood cards: lesson chips may be coloured, technique chips stay plain).
- These are Tier 1-ish marks for parent-facing pages, not LetterPeople content colours (Tier 2).

## Spacing and Layout

- **Component spacing**: Follow Vuetify's spacing scale (multiples of 4px: 8, 12, 16, 24, 32)
- **Touch targets**: Minimum 44x44px for interactive elements (toddler-friendly)
- **Container widths**: Responsive design using Vuetify breakpoints

## Typography

- **Headings**: Use Vuetify's text utility classes (`text-h1` through `text-h6`)
- **Body text**: Large, readable fonts suitable for early readers
- **Interactive labels**: Clear, concise text with sufficient contrast

## Animation System

The application uses **anime.js 4.x** for animations.

**IMPORTANT**: LLMs often know anime.js 3.x API. **Consult `agent/docs-vendoring/animejs/animejs.md`** for v4.x API differences (breaking changes from v3).

### Animation Guidelines

- **Duration**: Fast animations (200-400ms) for UI feedback, slower (600-1000ms) for storytelling moments
- **Easing**: Use `outQuad` or `outElastic` for playful, responsive feel
- **Immersive moments**: "Magic" and celebratory animations are encouraged at event boundaries (correct answers, level completion, character introductions)
- **Learning content**: Keep core instructional content clear and focused, but feel free to add flair around the edges

## 3D Scenes (three.js)

LetterPeople also appear in 3D scenes, for lessons, vignettes and GPC intros (`src/letterpeople/three/`). The aim is a **picture-book diorama**: toy-like letters performing on a small paper stage.

### Look
- **The letters are the stars.** They're the most solid, most colourful things on stage. Sets and props support them and never compete.
- **The world is paper.** Sets, props and pictures read as cut paper: flat shapes, simple silhouettes, low detail. Things the letters *wear or hold* can be softer and more 3D, but they stay simple.
- **Colour follows the two tiers.** Sets are muted and near-neutral. Letters use content colours. Pictures and props sit in between, and must stand out clearly from their background: check the contrast, don't just eyeball it. Action-tier colours stay in the DOM UI (e.g. the audio button), outside the scene.

### Staging
- **Words read like words.** Letters forming a word stand in a straight row, square to the camera. A lone letter may turn slightly toward the viewer.
- **Keep the stage legible.** Leave headroom for speech balloons, keep pictures clear of words, and frame so faces (especially eyes) are visible.
- **Use depth for meaning.** Entrances and exits come from the wings at depth; a speaking host can stand downstage, apart from the word.

### Motion
- **Stillness by default.** Only things the story cues should move, and mostly only during their moment. Continuous motion is the exception and should earn its place (it competes for attention and costs battery).
- **Calm, not busy.** Drifts over zooms; the choreography (anime.js) sets the pace.
- **One clock.** Tweens use anime.js, as in the rest of the app. Per-frame 3D work joins anime's loop (`createTimer`) or a `Stage3D` ticker. Never take over anime's global engine (`useDefaultMainLoop = false`): it would stop every SVG animation.
- **Transform, don't swap.** When a lesson's idea is change (e.g. the silent e changing a word), show objects changing into each other, not being replaced.

### Pictures and learning
- **A picture belongs to its word,** and appears during that word's part of the lesson.
- **Pictures shouldn't get ahead of the sounds.** Anything that plays audio (tapping a picture, sweeping a word) waits until the lesson has presented that word.
- **Choose example words for both.** Pick words whose picture is strong *and* whose sounds are clean in the recorded voice.

### Budget
Keep sets cheap: few draw calls, baked geometry, and rendering only when something changes. Treat every stretch of continuous rendering as a performance cost, and check it on low-end devices. SVG remains the fallback for weak devices.

## Brand Graphic Assets & Marketing Media

Export tooling: `scripts/export-og-cards.ts` (OG cards), `scripts/export-letterpeople/` (LetterPeople renders), `scripts/export-email-cta.ts` (email CTA button).

OG-image: running claude-design artifact is found at https://claude.ai/artifact/HUC1VcfrPSyL8vsFRWWPTo
