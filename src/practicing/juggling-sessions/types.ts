/**
 * Vignette session types for the juggling skill-acquisition choreography.
 *
 * 20 sessions of progressive skill development. J (uppercase, teacher) models
 * skills; j (lowercase, learner) attempts with jitter that smooths over practice.
 *
 * @packageDocumentation
 */

// ── Skill identifiers ────────────────────────────────────────────────────────

export type SkillId =
  | "handoff"
  | "tossToSelf"
  | "arcPass"
  | "arcPassEasy"
  | "tossTo2HandedCatch"
  | "dropCatch"
  | "oneHandedTossAndCatch"
  | "syncColumns"
  | "asyncColumns"
  | "2ballExchange"
  | "2ballContinuous"
  | "cascade"
  | "cascadeFlash";

// ── Skill parameters ─────────────────────────────────────────────────────────

export interface SkillParams {
  /** Peak throw height in px. */
  height?: number;
  /** Number of repetitions / throws. */
  count?: number;
  /** Dwell ratio (fraction of cycle spent holding ball). */
  dwell?: number;
  /** Shorthand jitter: applied to both throw and catch when specific values aren't set. */
  jitter?: number;
  /** Throw jitter 0–1. Overrides `jitter` for throws. */
  throwJitter?: number;
  /** Catch jitter 0–1. Overrides `jitter` for catches. */
  catchJitter?: number;
  /** Which hand to start from or use. */
  hand?: "left" | "right";
  /** Which hand to throw from (for arc pass, tossTo2HandedCatch, etc.). */
  from?: "left" | "right";
  /** Whether to alternate hands between reps. */
  alternating?: boolean;
  /** Handoff width 0–1. */
  width?: number;
  /** Lateral offset for oneHandedTossAndCatch. */
  offset?: number;
  /** Beat timing fraction for cascade / 2-ball patterns. */
  beatTiming?: number;
  /** Maximum beats before auto-stop (for cascade flash). */
  maxBeats?: number;
}

// ── Segment types ────────────────────────────────────────────────────────────

/**
 * Segment types within a vignette session.
 *
 * | Type       | Description                                                    |
 * |------------|----------------------------------------------------------------|
 * | demo       | J demonstrates a skill. j watches. Near-zero jitter on J.      |
 * | practice   | j performs a skill. Jitter per the model. Drops → remediation.  |
 * | review     | j performs a previously-learned skill at cross-session jitter.  |
 * | showcase   | J performs briefly — context, not performance. Keep short.      |
 * | transition | Narrative beats: walking, looking, emoting, captions.          |
 * | together   | Both J and j perform simultaneously (later sessions).          |
 * | teach      | j demonstrates to a peer (sessions 18+). Near-mastery jitter.  |
 */
export type SegmentType =
  | "demo"
  | "practice"
  | "review"
  | "showcase"
  | "transition"
  | "together"
  | "teach";

/**
 * Which actor(s) participate in a segment.
 */
export type SegmentActor = "J" | "j" | "peer" | "both" | "all";

// ── Transition actions ───────────────────────────────────────────────────────

/**
 * Transition segments use `action` instead of `skill` to describe
 * non-physics narrative beats.
 */
export type TransitionAction =
  | "walkIn"
  | "impressedReaction"
  | "gatherAndStop"
  | "noticeAndSmile"
  | "dropToFloor"
  | "caption"
  | "celebrate"
  | "encouragement"
  | "nod"
  | "faceEachOther"
  | "smile"
  | "turnToward"
  | "lookAt"
  | "startWithBall"
  | "custom";

// ── Segment definition ───────────────────────────────────────────────────────

export interface VignetteSegment {
  /** Sequential index within the session (1-based, for readability). */
  step: number;
  /** What kind of segment this is. */
  type: SegmentType;
  /** Which actor(s) participate. */
  actor: SegmentActor;
  /** Skill to perform (for demo, practice, review, showcase, teach, together). */
  skill?: SkillId;
  /** Parameters for the skill. */
  params?: SkillParams;
  /** Caption text to display during this segment. */
  caption?: string;
  /** Duration in ms for transition segments. */
  durationMs?: number;
  /** Transition action (only for type === 'transition'). */
  action?: TransitionAction;
  /** Number of balls to drop to floor (for dropToFloor transitions). */
  dropCount?: number;
  /** Which hand(s) to drop from. */
  dropHands?: ("left" | "right")[];
  /**
   * For practice segments: initial jitter before in-session smoothing.
   * If provided, overrides `params.throwJitter` / `params.catchJitter`
   * as the starting point for the smoothing curve.
   */
  jitterStart?: { throw: number; catch: number };
  /**
   * Prerequisite skill for drop remediation.
   * When j drops during this segment, remediation uses this skill.
   */
  remediationSkill?: SkillId;
  /** Parameters for the remediation skill. */
  remediationParams?: SkillParams;
  /**
   * Arbitrary metadata for custom transition logic.
   * e.g. { expression: 'impressed', target: 'J' }
   */
  meta?: Record<string, unknown>;
}

// ── Session definition ───────────────────────────────────────────────────────

export interface VignetteSession {
  /** Session number, 1-based (1–20). */
  id: number;
  /** Short human-readable title. */
  title: string;
  /** Thematic description. */
  theme: string;
  /** Ordered list of segments in this session. */
  segments: VignetteSegment[];
  /** Notes on drop remediation for this session (for documentation). */
  remediationNote?: string;
}

// ── Skill proficiency (cross-session persistence, future use) ────────────────

export interface SkillProficiency {
  skillId: SkillId;
  /** How many sessions this skill has appeared in. */
  sessionsExposed: number;
  totalAttempts: number;
  totalDrops: number;
  /** Lowest jitter achieved. */
  currentJitterFloor: number;
  /** Last session index (0-based) where this skill was practiced. */
  lastSessionIndex: number;
}

// ── V2 Architecture: Intro + Idle Loop ───────────────────────────────────────

/**
 * Stage configuration for the v2 intro + idle loop architecture.
 *
 * Each vignette has a scripted intro sequence followed by an open-ended
 * idle loop where j practices from a weighted skill pool.
 */
export interface VignetteStageConfig {
  /** 1-based stage ID (matches session number). */
  id: number;
  /** Short human-readable title. */
  title: string;
  /** Thematic description. */
  theme: string;

  /** Scripted opening sequence. Runs once, then idle loop begins. */
  intro: VignetteSegment[];

  /**
   * Skills j can attempt in the idle loop, with relative weights.
   * Frontier skill (new for this stage) gets highest weight.
   * Previously-learned skills appear at lower weight for variety.
   */
  skillPool: SkillPoolEntry[];

  /** J's idle behavior during j's idle loop. */
  jBehavior: JIdleBehavior;

  /** Remediation config: which skill to fall back to on drop, per skill. */
  remediationMap: Partial<Record<SkillId, RemediationConfig>>;
}

/**
 * A skill available in the idle loop's weighted random selection.
 */
export interface SkillPoolEntry {
  /** Which skill to execute. */
  skill: SkillId;
  /** Relative weight for random selection. Higher = more likely. */
  weight: number;
  /** Base parameters for this skill (height, hand, alternating, etc.). */
  params: SkillParams;
  /**
   * Starting jitter for this skill at this stage.
   * Frontier skills: high (0.4–0.7). Prereqs: low (0.05–0.2).
   */
  jitterStart: { throw: number; catch: number };
}

/**
 * What to do when j drops a ball during a particular skill.
 */
export interface RemediationConfig {
  /** Prerequisite skill to practice as remediation. */
  skill: SkillId;
  /** Parameters for the remediation skill. */
  params: SkillParams;
  /** Number of remediation reps (typically 1–2). */
  reps: number;
}

/**
 * How J behaves during j's idle practice loop.
 */
export interface JIdleBehavior {
  /** What J does while j practices. */
  mode: "cascade" | "watch" | "demo-occasionally";
  /** For cascade mode: cascade parameters. */
  cascadeParams?: SkillParams;
  /** Whether J reacts to j's drops and successes (smiles, nods, etc.). */
  reactions: boolean;
  /**
   * Guidance re-demos (default true): after 2 consecutive drops of a skill,
   * J pauses his own practice, slowly re-demos that skill while j watches,
   * then j retries.
   */
  guidance?: boolean;
}