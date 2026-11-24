<template>
  <v-container fluid class="wp-dbg">
    <div class="wp-dbg__head">
      <h2 class="text-h5">🖼️ Word pictures</h2>
      <router-link to="/dbg/word-pictures/styles" class="text-body-2">Style lab →</router-link>
      <span class="text-body-2 text-medium-emphasis">
        Which recorded words can be pictured, for silent exercises. Catalog:
        <code>src/content/wordPictures.ts</code>; 3D builders: <code>letterpeople/three/pictures/</code>.
      </span>
    </div>

    <!-- Filters -->
    <div class="wp-dbg__filters">
      <v-chip-group v-model="verdicts" multiple>
        <v-chip v-for="v in VERDICTS" :key="v" :value="v" filter :color="VERDICT_COLOR[v]" variant="tonal">
          {{ VERDICT_LABEL[v] }} ({{ counts[v] }})
        </v-chip>
      </v-chip-group>
      <v-select
        v-model="kind"
        :items="KIND_ITEMS"
        label="Iffy kind"
        density="compact"
        hide-details
        clearable
        class="wp-dbg__narrow"
      />
      <v-text-field
        v-model="search"
        label="Search"
        density="compact"
        hide-details
        clearable
        class="wp-dbg__narrow"
      />
      <v-checkbox v-model="only3d" :label="`3D (${count3d})`" density="compact" hide-details />
      <v-checkbox v-model="onlyEmoji" label="Has emoji" density="compact" hide-details />
      <v-checkbox v-model="onlyCheckAudio" label="Check audio" density="compact" hide-details />
      <v-checkbox v-model="onlyRivals" label="Has rivals" density="compact" hide-details />
      <v-switch v-model="playOnSelect" label="Play on select" density="compact" hide-details color="primary" />
      <v-switch v-model="gallery" :label="`3D gallery (${count3d})`" density="compact" hide-details color="primary" />
      <v-switch v-if="gallery" v-model="galleryLabels" label="Labels" density="compact" hide-details color="primary" />
    </div>

    <Picture3DGallery v-if="gallery" class="mb-4" :selected="selected" :labels="galleryLabels" @select="select" />

    <div class="wp-dbg__body">
      <!-- Grid -->
      <div class="wp-dbg__grid">
        <div class="text-caption text-medium-emphasis wp-dbg__shown">{{ shown.length }} shown</div>
        <button
          v-for="row in shown"
          :key="row.word"
          class="wp-card"
          :class="[`wp-card--${row.verdict}`, { 'wp-card--selected': row.word === selected }]"
          @click="select(row.word)"
        >
          <span class="wp-card__pic">{{ row.entry?.emoji ?? "·" }}</span>
          <span class="wp-card__word">{{ row.word }}</span>
          <span class="wp-card__badges">
            <span v-if="row.has3d" title="3D picture">🧊</span>
            <span v-if="row.entry?.checkAudio" title="Check the audio">⚠️</span>
            <span v-if="row.entry?.rivals?.length" :title="`Rivals: ${row.entry.rivals.join(', ')}`">†</span>
          </span>
        </button>
      </div>

      <!-- Detail -->
      <div v-if="selectedRow" class="wp-dbg__detail">
        <div class="wp-detail__title">
          <span class="text-h4">{{ selectedRow.word }}</span>
          <v-btn icon="mdi-volume-high" size="small" variant="tonal" @click="play(selectedRow.word)" />
          <v-chip size="small" :color="VERDICT_COLOR[selectedRow.verdict]" variant="tonal">
            {{ VERDICT_LABEL[selectedRow.verdict] }}<template v-if="selectedRow.entry?.kind">: {{ selectedRow.entry.kind }}</template>
          </v-chip>
        </div>

        <Picture3DPreview v-show="selectedRow.has3d" :word="selectedRow.word" />
        <div v-if="!selectedRow.has3d" class="wp-detail__no3d">
          <span class="wp-detail__emoji">{{ selectedRow.entry?.emoji ?? "—" }}</span>
          <span class="text-caption text-medium-emphasis">No 3D picture yet{{ selectedRow.entry?.emoji ? " (emoji stand-in)" : "" }}.</span>
        </div>

        <dl class="wp-detail__facts">
          <template v-if="phonemes">
            <dt>Phonemes</dt>
            <dd><code>{{ phonemes }}</code></dd>
          </template>
          <template v-if="selectedRow.entry?.rivals?.length">
            <dt>Rival names</dt>
            <dd>{{ selectedRow.entry.rivals.join(", ") }}</dd>
          </template>
          <template v-if="selectedRow.entry?.note">
            <dt>Note</dt>
            <dd>{{ selectedRow.entry.note }}</dd>
          </template>
          <template v-if="selectedRow.entry?.checkAudio">
            <dt>⚠️ Check audio</dt>
            <dd>{{ selectedRow.entry.checkAudio }}</dd>
          </template>
          <template v-if="!selectedRow.inWordList">
            <dt>Word list</dt>
            <dd>Recorded, but not in <code>WORD_LIST</code>.</dd>
          </template>
        </dl>
      </div>
      <div v-else class="wp-dbg__detail text-medium-emphasis">Pick a word.</div>
    </div>
  </v-container>
</template>

<script setup lang="ts">
/**
 * /dbg/word-pictures: browse the recorded words by how well they picture
 * (src/content/wordPictures.ts), with each word's audio, rival names, notes
 * and its 3D picture where one exists. Lazy route (three.js).
 */
import { computed, ref, watch } from "vue";
import { WORD_LIST } from "../../audio/word-list";
import { getPhonetics } from "../../services/phonetics";
import { WORD_PICTURES, pictureVerdict, type IffyKind, type PictureVerdict, type WordPicture } from "../../content/wordPictures";
import { hasPicture3D } from "../../letterpeople/three/pictures/index";
import Picture3DPreview from "./Picture3DPreview.vue";
import Picture3DGallery from "./Picture3DGallery.vue";

interface Row {
  word: string;
  verdict: PictureVerdict;
  entry: WordPicture | undefined;
  has3d: boolean;
  inWordList: boolean;
}

const VERDICTS: PictureVerdict[] = ["drawable", "iffy", "no"];
const VERDICT_LABEL: Record<PictureVerdict, string> = { drawable: "✅ Drawable", iffy: "〰️ Iffy", no: "❌ No" };
const VERDICT_COLOR: Record<PictureVerdict, string> = { drawable: "success", iffy: "warning", no: "grey" };
const KIND_ITEMS: IffyKind[] = ["emotion", "action", "symbol", "relational", "stand-in", "borderline"];

const inList = new Set<string>(WORD_LIST);
const rows: Row[] = [...new Set<string>([...WORD_LIST, ...Object.keys(WORD_PICTURES)])].sort().map((word) => ({
  word,
  verdict: pictureVerdict(word),
  entry: WORD_PICTURES[word],
  has3d: hasPicture3D(word),
  inWordList: inList.has(word),
}));

const counts = computed(() => {
  const c: Record<PictureVerdict, number> = { drawable: 0, iffy: 0, no: 0 };
  for (const r of rows) c[r.verdict]++;
  return c;
});
const count3d = rows.filter((r) => r.has3d).length;

const verdicts = ref<PictureVerdict[]>(["drawable", "iffy"]);
const kind = ref<IffyKind | null>(null);
const search = ref<string | null>("");
const only3d = ref(false);
const onlyEmoji = ref(false);
const onlyCheckAudio = ref(false);
const onlyRivals = ref(false);
const playOnSelect = ref(true);
const gallery = ref(true);
const galleryLabels = ref(true);

// A kind only exists on iffy words: picking one shows them
watch(kind, (k) => {
  if (k && !verdicts.value.includes("iffy")) verdicts.value = [...verdicts.value, "iffy"];
});

const shown = computed(() => {
  const q = (search.value ?? "").trim().toLowerCase();
  return rows.filter(
    (r) =>
      verdicts.value.includes(r.verdict) &&
      (!kind.value || r.entry?.kind === kind.value) &&
      (!q || r.word.includes(q) || r.entry?.rivals?.some((x) => x.includes(q))) &&
      (!only3d.value || r.has3d) &&
      (!onlyEmoji.value || !!r.entry?.emoji) &&
      (!onlyCheckAudio.value || !!r.entry?.checkAudio) &&
      (!onlyRivals.value || !!r.entry?.rivals?.length),
  );
});

const selected = ref<string>("kite");
const selectedRow = computed(() => rows.find((r) => r.word === selected.value));
const phonemes = computed(() => getPhonetics(selected.value)?.phonemes.join(" ") ?? null);

let audio: HTMLAudioElement | null = null;
function play(word: string) {
  audio?.pause();
  audio = new Audio(`/audio/words/${word}.mp3`);
  void audio.play().catch(() => {});
}

function select(word: string) {
  selected.value = word;
  if (playOnSelect.value) play(word);
}
</script>

<style scoped>
.wp-dbg {
  background: #fffef7;
  min-height: 100vh;
}
.wp-dbg__head {
  display: flex;
  align-items: baseline;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.wp-dbg__filters {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.wp-dbg__narrow {
  max-width: 180px;
  min-width: 140px;
}
.wp-dbg__body {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}
.wp-dbg__grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 8px;
  align-content: start;
}
.wp-dbg__shown {
  grid-column: 1 / -1;
}
.wp-dbg__detail {
  width: 380px;
  flex-shrink: 0;
  position: sticky;
  top: 16px;
}
@media (max-width: 800px) {
  .wp-dbg__body {
    flex-direction: column-reverse;
  }
  .wp-dbg__detail {
    width: 100%;
    position: static;
  }
}

.wp-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px 6px;
  border-radius: 8px;
  border: 2px solid transparent;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  border-top-width: 4px;
}
.wp-card--drawable {
  border-top-color: rgb(var(--v-theme-success));
}
.wp-card--iffy {
  border-top-color: rgb(var(--v-theme-warning));
}
.wp-card--no {
  border-top-color: #ccc;
  opacity: 0.7;
}
.wp-card--selected {
  border-color: rgb(var(--v-theme-primary));
}
.wp-card__pic {
  font-size: 30px;
  line-height: 1.1;
  min-height: 34px;
}
.wp-card__word {
  font: 600 15px/1.2 system-ui, sans-serif;
}
.wp-card__badges {
  font-size: 11px;
  min-height: 14px;
}

.wp-detail__title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.wp-detail__no3d {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}
.wp-detail__emoji {
  font-size: 48px;
}
.wp-detail__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 12px;
  margin-top: 12px;
  font-size: 14px;
}
.wp-detail__facts dt {
  font-weight: 600;
  color: #555;
}
</style>
