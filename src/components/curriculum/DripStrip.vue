<!--
  DripStrip — the /curriculum timeline for one age: one column per session,
  each fact stacked in the session a typical (simulated) learner meets it,
  coloured by its lesson, with the lesson's number and title where it opens.
  Shows the two drips interleaving: facts from every opened lesson arrive by
  usefulness, not lesson by lesson.

  Runs of sessions with nothing new collapse into a narrow gap column, so a
  younger learner's longer timeline stays readable.

  Hover / focus / tap a chip: the readout line above names it (one readout
  instead of per-chip tooltips, which the scroll container would clip); a tap
  also plays it. The lesson sections below list the same facts — the table
  view.
-->
<template>
  <figure class="drip-strip">
    <ul class="strip-legend">
      <li v-for="lesson in lessons" :key="lesson.id">
        <a :href="`#lesson-${lesson.id}`" class="strip-legend__item">
          <LessonNumber :n="lesson.number" :color="lesson.color" />
          {{ lesson.title }}
        </a>
      </li>
    </ul>

    <p class="strip-readout" aria-live="polite">
      <template v-if="hovered">
        <strong>{{ hovered.grapheme }}</strong>
        — {{ lessonOf(hovered)?.title }} · around session {{ Math.round(hovered.session) }}
        <span v-if="hovered.examples.length && !hovered.gpc.startsWith('WORD-')">
          · {{ hovered.examples.join(', ') }}
        </span>
      </template>
      <template v-else>Hover or tap a fact to see what it is and when it arrives.</template>
    </p>

    <div class="strip-scroll" role="group" aria-label="When a typical learner meets each fact, session by session">
      <div class="strip-grid" :style="{ gridTemplateColumns }">
        <template v-for="col in columns" :key="col.key">
          <div v-if="col.gap !== undefined" class="strip-gap" :title="`${col.gap} sessions with nothing new`">
            <span class="strip-gap__count">+{{ col.gap }}</span>
          </div>
          <div
            v-else
            class="strip-col"
            :class="{ 'strip-col--opens': col.opens.length > 0 }"
            :style="col.opens.length ? { '--open-color': col.opens[0].color } : undefined"
          >
            <div class="strip-opens">
              <span v-for="lesson in col.opens" :key="lesson.id" class="strip-open">
                <LessonNumber :n="lesson.number" :color="lesson.color" />
                {{ lesson.title }}
              </span>
            </div>
            <div class="strip-facts">
              <button
                v-for="fact in col.facts"
                :key="fact.gpc"
                type="button"
                class="strip-chip"
                :style="{ '--chip-color': lessonOf(fact)?.color }"
                :aria-label="describe(fact)"
                @mouseenter="hovered = fact"
                @mouseleave="hovered = null"
                @focus="hovered = fact"
                @blur="hovered = null"
                @click="playFact(fact)"
              >
                {{ fact.grapheme }}
              </button>
            </div>
            <div class="strip-session">{{ col.session }}</div>
          </div>
        </template>
      </div>
    </div>

    <figcaption class="strip-caption">
      <slot name="caption" />
    </figcaption>
  </figure>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { factsForAge, lessonsForAge, type SimFact } from './curriculumData';
import LessonNumber from './LessonNumber.vue';
import { playFact } from './playFact';

const props = defineProps<{ age: number }>();

const lessons = computed(() => lessonsForAge(props.age));
const facts = computed(() => factsForAge(props.age));
const hovered = ref<SimFact | null>(null);

const lessonOf = (fact: SimFact) => lessons.value.find((l) => l.id === fact.lesson);

interface SessionColumn {
  key: string;
  gap?: undefined;
  session: number;
  opens: ReturnType<typeof lessonsForAge>;
  facts: SimFact[];
}
interface GapColumn {
  key: string;
  gap: number;
}

/** Sessions with something new, with collapsed gaps between them */
const columns = computed<(SessionColumn | GapColumn)[]>(() => {
  const bySession = new Map<number, SessionColumn>();
  const column = (session: number) => {
    let col = bySession.get(session);
    if (!col) {
      col = { key: `s${session}`, session, opens: [], facts: [] };
      bySession.set(session, col);
    }
    return col;
  };
  for (const lesson of lessons.value) {
    if (lesson.session !== null) column(Math.round(lesson.session)).opens.push(lesson);
  }
  for (const fact of facts.value) column(Math.round(fact.session)).facts.push(fact);

  const out: (SessionColumn | GapColumn)[] = [];
  let prev = 0;
  for (const col of [...bySession.values()].sort((a, b) => a.session - b.session)) {
    const skipped = col.session - prev - 1;
    if (skipped > 0) out.push({ key: `gap${col.session}`, gap: skipped });
    out.push(col);
    prev = col.session;
  }
  return out;
});

const gridTemplateColumns = computed(() =>
  columns.value.map((c) => (c.gap ? '16px' : 'minmax(46px, 1fr)')).join(' '),
);

function describe(fact: SimFact): string {
  return `${fact.grapheme}, ${lessonOf(fact)?.title ?? fact.lesson}, around session ${Math.round(fact.session)}`;
}
</script>

<style scoped>
.drip-strip {
  margin: 0;
}

.strip-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
}
.strip-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  color: rgba(33, 33, 33, 0.8);
  text-decoration: none;
}
.strip-legend__item:hover {
  text-decoration: underline;
}

.strip-readout {
  min-height: 1.6em;
  margin: 0 0 8px;
  font-size: 0.9rem;
  color: rgba(33, 33, 33, 0.75);
}

.strip-scroll {
  overflow-x: auto;
  padding-bottom: 4px;
}
.strip-grid {
  display: grid;
  min-width: max-content;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.strip-col {
  display: flex;
  flex-direction: column;
  padding: 0 2px;
  border-left: 1px solid rgba(0, 0, 0, 0.04);
}
.strip-col--opens {
  border-left: 2px solid var(--open-color);
}

/* The lesson's title runs on to the right, over the columns that follow */
.strip-opens {
  min-height: 24px;
  padding: 2px 0 0 3px;
}
.strip-open {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
}

.strip-facts {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  padding: 2px 0 6px;
}
.strip-chip {
  padding: 2px 4px;
  border: 0;
  border-left: 3px solid var(--chip-color);
  border-radius: 3px;
  background: color-mix(in srgb, var(--chip-color) 14%, #ffffff);
  color: #212121;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.3;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.strip-chip:hover,
.strip-chip:focus-visible {
  background: color-mix(in srgb, var(--chip-color) 30%, #ffffff);
}
.strip-chip:focus-visible {
  outline: 2px solid var(--chip-color);
  outline-offset: 1px;
}

.strip-session {
  min-height: 1.4em;
  font-size: 0.7rem;
  color: rgba(33, 33, 33, 0.5);
}

.strip-gap {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  border-left: 1px dashed rgba(0, 0, 0, 0.15);
}
.strip-gap__count {
  font-size: 0.6rem;
  color: rgba(33, 33, 33, 0.4);
  padding-bottom: 2px;
}

.strip-caption {
  margin-top: 10px;
  font-size: 0.85rem;
  line-height: 1.6;
  color: rgba(33, 33, 33, 0.6);
}
</style>
