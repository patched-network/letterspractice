
We're going to start reworking the overall structure and content of the landing page. Here is the incoming structure.

## CURRENT IMPLEMENTATION STATUS

### ✅ COMPLETED
- **Section 2 (UserExperienceSection.vue)**: Daily usage section with two-column layout (For Your Child / For You), "You're the Coach" card
- **Section 3 (HowItWorksSection.vue)**: Trimmed 2026-09-18 to eyebrow + title + one line + a chip strip linking into the new `/how-it-works` page (alias `/pedagogy`) (`views/PedagogyView.vue`, copy in `content/pedagogyCopy.ts`). Full technique details, Team of Rivals, and three new "deliberate choices" sections (ideas vs facts drip, encoding-first, not-a-rulebook) live there. New material is point-form **working text** (`type: "working"`) awaiting Colin's prose.
- **Section 4 (MissionSection.vue)**: Mission statement with tweaks, origin story
- **Section 5 (Footer Email CTA)**: Final signup section in LandingPage.vue
- **EmailSignupForm.vue**: Extracted reusable component used in hero and footer

### ⚠️ PENDING
- ~~**Section 1 (Hero)**: Update animation on `Hello!` letters~~ — done
  2026-07-31. The `Hello!` greeting is gone; the hero now poses a live
  MissingLetters vignette inside the H1 ("Teach your child to `_ead`" → `read`
  + celebration). See `hero-read.spec.md` (the authority) plus
  `HeroReadVignette.vue` / `heroReadAnimation.ts`.
- **SRS Section**: Add free-tier commentary — the boundary is ~1,000 readable
  words, not a 3-7 day clock; the contrast with countdown trials is the point
  (progress pressure, not time pressure). See bd/distribution.md
  §"Entitlement Model: reachable-words freemium".

### 🔧 TECHNICAL DEBT / FUTURE IMPROVEMENTS
**Background Color Centralization**
- Current state: Each section hardcodes its own background colors
  - HeroGreeting: `linear-gradient(135deg, #fffef7 0%, #fff8e8 100%)` (warm)
  - UserExperienceSection: `#ffffff` (white)
  - HowItWorksSection: `#fafafa` (light gray)
  - MissionSection: `linear-gradient(135deg, #f8fef7 0%, #f0f9f0 100%)` (cool/green)
  - Footer signup: `linear-gradient(135deg, #fff8e8 0%, #fffef7 100%)` (warm reversed)
- Proposed: Extract to CSS custom properties in LandingPage.vue for single source of truth
- Benefit: Makes visual rhythm/coherence more obvious and easier to maintain

---

## ORIGINAL PLAN

--- SECTION 1
HERO (keep existing), but update animation on `Hello!` letters
---

--- SECTION 2
How It Works (user-side)
- blurb on "what you will do" (a usage brief)
- kid uses daily w/ rough supervision
- micro instruction, reinforced by micro assessment-as-learning
  - decorated & characterized by characters
- student learns content (duh)
- supervising parent gains strong working intuition on how to appropriately challenge / prompt kids during co-reading
---

--- SECTION 3
How It Works (under the hood/behind the scenes)

3.1
OVERALL
- emphasize ongoing dynamic personalization
- the letters work hard to provide the right content
  - planned curriculum
  - close observation of overall progress, particular successes and challenges
- (insert graphics of letters pouring over charts, dabating, etc)

3.2
SPECIFICS

accordian section? expandable explainations of each of the following
- interference mitigation
  - (eg, separating the introduction of b,d - some of the existing 'bombardment' copy applies)
- SRS
  - problem: learned concepts and information can be forgotten!
  - solution: mechanising long-term retention and growth
- Weighted priorities
  - arranging curriculum so that we start w/ the most immidiately useful knowledge
  - leading with letters and phonetic rules that are common and 'well behaved'
  - deferring esoteric knowledge
- Procedural exercise generation / selection
  - using solidly known building blocks when introducing new concepts
  - eg, if `m` knowledge is more mature than `k`, then prefer `same` to `sake` when introducing the long-vowel cvce
- Progressive Overload
  - ramping
- Rejecting Self Report
  - throughout, understanding is actively demonstrated by learners
  - no 'mindless dismissal'


3.3
TEAM OF RIVALS / SYSTEMATIC IMPROVEMENTS

"The above approaches are sometimes in tension with one another.

These tensions are worked out with internal politicing - different coalitions of letters vie for the right to present the next lesson or exercise.

We use our ongoing experience with learners to continually fine-tune and get the right mix of influences."

---

--- SECTION 4
Mission (keep existing), tweaks, add also another email list CTA
---

--- SECTION 5
final CTA
---
