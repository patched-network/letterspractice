<!--
  DripTimeline — the /curriculum timeline for one age, in the wide layout's
  panel beside the lessons (CurriculumView; narrower screens get DripStrip).
  Sessions top to bottom, as a typical (simulated) learner meets them: each
  session that brings something new is a row of its facts, coloured by their
  lesson; runs of sessions with nothing new fold into one dashed stretch. A
  lesson opening is a marker on the rail, its number and title, that emits
  `lesson` (the view scrolls to it).

  So the two drips read in the order they happen: an idea arrives, and facts
  keep coming from every lesson opened so far — Meet the Letters' letters
  still turning up rows after Letter Teammates has opened.

  Rows carry no session numbers; a mark every ten sessions gives the time,
  and roughly how many words a learner could sound out by then. Sessions,
  not weeks: real practice comes in fits and starts, so the page claims an
  order, not a calendar.
-->
<template>
  <ol class="drip-timeline">
    <template v-for="item in items" :key="item.key">
      <li v-if="item.kind === 'lesson'" class="timeline-row timeline-row--opening" :style="{ '--lesson-color': item.lesson.color }">
        <span class="timeline-track">
          <LessonNumber :n="item.lesson.number" :color="item.lesson.color" class="timeline-opening__disc" />
          <a
            :href="`#lesson-${item.lesson.id}`"
            class="timeline-opening"
            @click.prevent="emit('lesson', item.lesson.id)"
          >
            <span class="visually-hidden">Lesson {{ item.lesson.number }}: </span>{{ item.lesson.title }}
          </a>
        </span>
      </li>
      <li v-else-if="item.kind === 'mark'" class="timeline-row timeline-row--mark">
        <span class="timeline-track">
          <span class="timeline-mark__when">{{ item.sessions }} {{ SESSIONS_LABEL }}</span>
          <span v-if="item.words !== null" class="timeline-mark__words">
            {{ WORDS_LABEL(about(item.words).toLocaleString()) }}
          </span>
        </span>
      </li>
      <li v-else-if="item.kind === 'quiet'" class="timeline-row timeline-row--quiet">
        <span class="timeline-track">
          {{ item.sessions }} {{ item.sessions === 1 ? 'session' : 'sessions' }} of practice, nothing new
        </span>
      </li>
      <li v-else class="timeline-row">
        <div class="timeline-track">
          <span class="visually-hidden">Session {{ item.session }}: </span>
          <FactChip
            v-for="fact in item.facts"
            :key="fact.gpc"
            :fact="fact"
            :color="colorOf(fact)"
            compact
          />
        </div>
      </li>
    </template>
  </ol>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { factsForAge, lessonsForAge, readableAt, type CurriculumLesson, type SimFact } from './curriculumData';
import FactChip from './FactChip.vue';
import LessonNumber from './LessonNumber.vue';

const props = defineProps<{ age: number }>();
const emit = defineEmits<{ (e: 'lesson', id: string): void }>();

const lessons = computed(() => lessonsForAge(props.age));
const facts = computed(() => factsForAge(props.age));

const colorOf = (fact: SimFact) => lessons.value.find((l) => l.id === fact.lesson)?.color ?? '#9e9e9e';

type TimelineItem =
  | { kind: 'lesson'; key: string; lesson: CurriculumLesson }
  | { kind: 'session'; key: string; session: number; facts: SimFact[] }
  | { kind: 'quiet'; key: string; sessions: number }
  | { kind: 'mark'; key: string; sessions: number; words: number | null };

/** Sessions between marks */
const MARK_EVERY = 10;
/** The marks' wording. PLACEHOLDER(P9) — see the handoff */
const SESSIONS_LABEL = 'sessions in';
const WORDS_LABEL = (n: string) => `about ${n} one-syllable words to sound out`;

/** Two significant figures: the sim's counts are a shape, not a promise */
function about(n: number): number {
  if (n < 100) return n;
  const unit = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / unit) * unit;
}

const items = computed<TimelineItem[]>(() => {
  const session = (s: number) => Math.max(1, Math.round(s));
  const arrivals = new Map<number, SimFact[]>();
  for (const fact of facts.value) {
    const s = session(fact.session);
    arrivals.set(s, [...(arrivals.get(s) ?? []), fact]);
  }
  const opens = new Map<number, CurriculumLesson[]>();
  const unreached: CurriculumLesson[] = [];
  for (const lesson of lessons.value) {
    if (lesson.session === null) {
      unreached.push(lesson);
      continue;
    }
    const s = session(lesson.session);
    opens.set(s, [...(opens.get(s) ?? []), lesson]);
  }

  const out: TimelineItem[] = [];
  const last = Math.max(0, ...arrivals.keys(), ...opens.keys());
  let quiet = 0;
  const flushQuiet = (s: number) => {
    if (quiet) out.push({ kind: 'quiet', key: `quiet-${s}`, sessions: quiet });
    quiet = 0;
  };
  for (let s = 1; s <= last; s++) {
    const opening = opens.get(s) ?? [];
    const arriving = arrivals.get(s) ?? [];
    if (!opening.length && !arriving.length) quiet++;
    else {
      flushQuiet(s);
      for (const lesson of opening) out.push({ kind: 'lesson', key: lesson.id, lesson });
      if (arriving.length) out.push({ kind: 'session', key: `s${s}`, session: s, facts: arriving });
    }
    // A mark: a quiet run splits there
    if (s % MARK_EVERY === 0) {
      flushQuiet(s);
      out.push({ kind: 'mark', key: `mark-${s}`, sessions: s, words: readableAt(props.age, s) });
    }
  }
  for (const lesson of unreached) out.push({ kind: 'lesson', key: lesson.id, lesson });
  return out;
});
</script>

<style scoped>
/* Room on the left for the marks that sit across the rail (the panel clips) */
.drip-timeline {
  --rail: rgba(0, 0, 0, 0.14);
  list-style: none;
  padding: 0 0 0 12px;
  margin: 0;
}

.timeline-track {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0 8px 20px;
  border-left: 2px solid var(--rail);
}
/* A session's dot on the rail */
.timeline-row:not(.timeline-row--quiet, .timeline-row--opening, .timeline-row--mark) .timeline-track::before {
  content: '';
  position: absolute;
  left: -6px;
  top: calc(50% - 5px);
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.35);
  background: var(--page-bg, #fffef7);
}

.timeline-row--quiet .timeline-track {
  padding: 10px 0 10px 20px;
  border-left-style: dashed;
  font-size: 0.8rem;
  font-style: italic;
  color: rgba(33, 33, 33, 0.5);
}

/* A lesson opening: its number on the rail, cut out of it by a
   ring of page colour, and its title on a wash of its colour */
.timeline-row--opening .timeline-track {
  align-items: center;
  padding: 12px 0 12px 20px;
}
.timeline-opening__disc {
  position: absolute;
  left: -9px;
  top: calc(50% - 8px);
  box-shadow: 0 0 0 3px var(--page-bg, #fffef7);
}
.timeline-opening {
  padding: 4px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lesson-color) 14%, #ffffff);
  font-size: 0.875rem;
  font-weight: 700;
  color: #212121;
  text-decoration: none;
}
.timeline-opening:hover {
  text-decoration: underline;
}
.timeline-opening:focus-visible {
  outline: 2px solid var(--lesson-color);
  outline-offset: 2px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* A mark: a tick across the rail, and the words in reach by then */
.timeline-row--mark .timeline-track {
  align-items: baseline;
  gap: 10px;
  padding: 14px 0 14px 20px;
}
.timeline-row--mark .timeline-track::before {
  content: '';
  position: absolute;
  left: -8px;
  top: calc(50% - 1px);
  width: 14px;
  height: 2px;
  background: rgba(0, 0, 0, 0.45);
}
.timeline-mark__when {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(33, 33, 33, 0.55);
}
.timeline-mark__words {
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(33, 33, 33, 0.8);
}
</style>
