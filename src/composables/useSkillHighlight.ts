/**
 * Skill Highlight
 * ===============
 *
 * A tiny shared store that lets the /progress "Putting Them Together" card point
 * back at the atomic skills in "The Pieces": when a carousel word is hovered or
 * clicked through to (or a word is typed into the checker / picked from "See
 * all"), the GPCs that decode it shimmer in the lesson reports. A carousel
 * cycling on its own highlights nothing.
 *
 * Keyed by catalogue GPC id (e.g. `GPC-sh-SH`) — the same id space the word
 * table and the report tiles both use. Provided once in `ProgressView`; the card
 * writes, the reports read. Consumers outside a provider (e.g. the dbg view)
 * get `null` and simply do nothing.
 */
import { inject, provide, ref, type InjectionKey, type Ref } from 'vue';
import './skillHighlight.css';

export type SkillHighlightState =
  /** Part of the current word AND the learner has it — the "combining" skills. */
  | 'used'
  /** Needed to decode the current word but not yet learned — the gap. */
  | 'missing';

export interface SkillHighlightStore {
  states: Ref<Map<string, SkillHighlightState>>;
  /** Visually stronger when the source (carousel/checker) is hovered/focused. */
  strong: Ref<boolean>;
  set(next: Map<string, SkillHighlightState>, strong?: boolean): void;
  setStrong(v: boolean): void;
  clear(): void;
}

const KEY: InjectionKey<SkillHighlightStore> = Symbol('skillHighlight');

export function provideSkillHighlight(): SkillHighlightStore {
  const states = ref<Map<string, SkillHighlightState>>(new Map());
  const strong = ref(false);
  const store: SkillHighlightStore = {
    states,
    strong,
    set(next, s = false) {
      states.value = next;
      strong.value = s;
    },
    setStrong(v) {
      strong.value = v;
    },
    clear() {
      if (states.value.size) states.value = new Map();
      strong.value = false;
    },
  };
  provide(KEY, store);
  return store;
}

export function useSkillHighlight(): SkillHighlightStore | null {
  return inject(KEY, null);
}

/**
 * Highlight class for a report tile, given the catalogue GPC id(s) it represents.
 * Pass several ids when one tile collapses multiple readings (e.g. `u_e`).
 */
export function skillHighlightClass(
  store: SkillHighlightStore | null,
  gpcIds: string | string[],
): string {
  if (!store) return '';
  const ids = typeof gpcIds === 'string' ? [gpcIds] : gpcIds;
  let state: SkillHighlightState | undefined;
  for (const id of ids) {
    const s = store.states.value.get(id);
    if (s === 'used') {
      state = 'used';
      break;
    }
    if (s === 'missing') state = 'missing';
  }
  if (!state) return '';
  return `skill-hl skill-hl--${state}${store.strong.value ? ' skill-hl--strong' : ''}`;
}
