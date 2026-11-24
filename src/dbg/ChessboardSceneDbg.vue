<template>
  <v-container fluid>
    <v-row>
      <v-col cols="12">
        <h2 class="text-h5 mb-2">♟ Chessboard Scene</h2>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Lowercase <strong>c</strong> and <strong>h</strong> sit across from
          each other with a chessboard between them. Move pieces by selecting
          source → destination squares.
        </p>
      </v-col>
    </v-row>

    <!-- Stage canvas -->
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title class="d-flex align-center justify-space-between">
            <span>Stage</span>
            <span class="text-body-2 text-medium-emphasis" v-if="boardProp">
              Pieces: {{ pieceCount }}
            </span>
          </v-card-title>
          <v-card-text>
            <div
              ref="stageContainer"
              class="stage-canvas"
            ></div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Position Tuning Sliders -->
    <v-row v-if="stage">
      <v-col cols="12">
        <v-card>
          <v-card-title class="d-flex align-center justify-space-between">
            <span>Position Tuning</span>
            <v-btn size="x-small" variant="text" @click="logPositions">📋 Log</v-btn>
          </v-card-title>
          <v-card-text>
            <div class="slider-grid">
              <!-- c -->
              <div class="slider-group">
                <div class="text-subtitle-2 mb-1">c (left)</div>
                <label class="slider-label">
                  <span>x</span>
                  <input type="range" :min="-200" :max="800" v-model.number="pos.cX" @input="applyPositions" />
                  <span class="slider-val">{{ pos.cX }}</span>
                </label>
                <label class="slider-label">
                  <span>z</span>
                  <input type="range" :min="0" :max="100" v-model.number="pos.cZ" @input="applyPositions" />
                  <span class="slider-val">{{ pos.cZ }}</span>
                </label>
              </div>

              <!-- board -->
              <div class="slider-group">
                <div class="text-subtitle-2 mb-1">Board</div>
                <label class="slider-label">
                  <span>x</span>
                  <input type="range" :min="0" :max="800" v-model.number="pos.boardX" @input="applyPositions" />
                  <span class="slider-val">{{ pos.boardX }}</span>
                </label>
                <label class="slider-label">
                  <span>z</span>
                  <input type="range" :min="0" :max="100" v-model.number="pos.boardZ" @input="applyPositions" />
                  <span class="slider-val">{{ pos.boardZ }}</span>
                </label>
              </div>

              <!-- h -->
              <div class="slider-group">
                <div class="text-subtitle-2 mb-1">h (right)</div>
                <label class="slider-label">
                  <span>x</span>
                  <input type="range" :min="0" :max="1000" v-model.number="pos.hX" @input="applyPositions" />
                  <span class="slider-val">{{ pos.hX }}</span>
                </label>
                <label class="slider-label">
                  <span>z</span>
                  <input type="range" :min="0" :max="100" v-model.number="pos.hZ" @input="applyPositions" />
                  <span class="slider-val">{{ pos.hZ }}</span>
                </label>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Controls -->
    <v-row>
      <!-- Stage & Board -->
      <v-col cols="12" md="4">
        <v-card>
          <v-card-title>Stage & Board</v-card-title>
          <v-card-text>
            <div class="d-flex flex-wrap gap-2 mb-3">
              <v-btn color="primary" size="small" @click="initScene" :disabled="!!stage">
                Init Scene
              </v-btn>
              <v-btn color="error" size="small" variant="outlined" @click="destroyScene" :disabled="!stage">
                Destroy
              </v-btn>
            </div>
            <div class="d-flex flex-wrap gap-2 mb-3" v-if="boardProp">
              <v-btn size="small" @click="setupStandard">
                Standard Position
              </v-btn>
              <v-btn size="small" @click="clearBoard">
                Clear Board
              </v-btn>
              <v-btn size="small" @click="setupMidgame">
                Sample Mid-game
              </v-btn>
            </div>
            <div class="d-flex flex-wrap gap-2" v-if="boardProp">
              <v-btn size="small" variant="outlined" @click="toggleAnchors">
                {{ showAnchors ? 'Hide' : 'Show' }} Anchors
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Move Piece -->
      <v-col cols="12" md="4">
        <v-card>
          <v-card-title>Move a Piece</v-card-title>
          <v-card-text v-if="boardProp">
            <div class="d-flex gap-2 mb-3 align-center">
              <v-select
                v-model="moveFrom"
                :items="occupiedSquares"
                label="From"
                density="compact"
                hide-details
                style="max-width: 120px"
              />
              <v-icon>mdi-arrow-right</v-icon>
              <v-select
                v-model="moveTo"
                :items="allSquareLabels"
                label="To"
                density="compact"
                hide-details
                style="max-width: 120px"
              />
            </div>
            <div class="d-flex flex-wrap gap-2 mb-3">
              <v-btn
                size="small"
                color="primary"
                :disabled="!moveFrom || !moveTo || moveFrom === moveTo"
                @click="doMove('c')"
              >
                c moves it
              </v-btn>
              <v-btn
                size="small"
                color="secondary"
                :disabled="!moveFrom || !moveTo || moveFrom === moveTo"
                @click="doMove('h')"
              >
                h moves it
              </v-btn>
              <v-btn
                size="small"
                variant="outlined"
                :disabled="!moveFrom || !moveTo || moveFrom === moveTo"
                @click="doMove(null)"
              >
                Slide only
              </v-btn>
            </div>
            <p class="text-caption text-medium-emphasis">
              Pick a source (occupied) square and a destination. The selected
              letter-person will reach out and slide the piece.
            </p>
          </v-card-text>
          <v-card-text v-else>
            <span class="text-medium-emphasis">Init scene first</span>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Actor controls -->
      <v-col cols="12" md="4">
        <v-card>
          <v-card-title>Actor Controls</v-card-title>
          <v-card-text v-if="stage">
            <!-- c actor -->
            <div class="text-subtitle-2 mb-1">c (left side)</div>
            <div class="d-flex flex-wrap gap-2 mb-3">
              <v-btn size="x-small" variant="outlined" @click="actorSay('c', 'Your move!')">
                "Your move!"
              </v-btn>
              <v-btn size="x-small" variant="outlined" @click="actorSay('c', 'Check!')">
                "Check!"
              </v-btn>
              <v-btn size="x-small" variant="outlined" @click="actorSilence('c')">
                Silence
              </v-btn>
              <v-btn size="x-small" variant="outlined" @click="toggleIdle('c')">
                {{ idleActive.c ? 'Stop' : 'Start' }} Idle
              </v-btn>
            </div>

            <!-- h actor -->
            <div class="text-subtitle-2 mb-1">h (right side)</div>
            <div class="d-flex flex-wrap gap-2 mb-3">
              <v-btn size="x-small" variant="outlined" @click="actorSay('h', 'Hmm...')">
                "Hmm..."
              </v-btn>
              <v-btn size="x-small" variant="outlined" @click="actorSay('h', 'Good game!')">
                "Good game!"
              </v-btn>
              <v-btn size="x-small" variant="outlined" @click="actorSilence('h')">
                Silence
              </v-btn>
              <v-btn size="x-small" variant="outlined" @click="toggleIdle('h')">
                {{ idleActive.h ? 'Stop' : 'Start' }} Idle
              </v-btn>
            </div>

            <!-- Shared -->
            <div class="text-subtitle-2 mb-1">Both</div>
            <div class="d-flex flex-wrap gap-2">
              <v-btn size="x-small" variant="outlined" @click="bothLookAtBoard">
                Gaze at board
              </v-btn>
              <v-btn size="x-small" variant="outlined" @click="bothLookAtEachOther">
                Look at each other
              </v-btn>
              <v-btn size="x-small" variant="outlined" @click="actorWave('c')">
                c waves
              </v-btn>
              <v-btn size="x-small" variant="outlined" @click="actorWave('h')">
                h waves
              </v-btn>
            </div>
          </v-card-text>
          <v-card-text v-else>
            <span class="text-medium-emphasis">Init scene first</span>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Quick-move presets -->
    <v-row v-if="boardProp">
      <v-col cols="12">
        <v-card>
          <v-card-title>Quick Moves (from standard position)</v-card-title>
          <v-card-text>
            <div class="d-flex flex-wrap gap-2">
              <v-btn size="small" variant="outlined" @click="quickMove('e2', 'e4', 'c')">
                c: e2→e4
              </v-btn>
              <v-btn size="small" variant="outlined" @click="quickMove('e7', 'e5', 'h')">
                h: e7→e5
              </v-btn>
              <v-btn size="small" variant="outlined" @click="quickMove('g1', 'f3', 'c')">
                c: Nf3
              </v-btn>
              <v-btn size="small" variant="outlined" @click="quickMove('b8', 'c6', 'h')">
                h: Nc6
              </v-btn>
              <v-btn size="small" variant="outlined" @click="quickMove('f1', 'c4', 'c')">
                c: Bc4
              </v-btn>
              <v-btn size="small" variant="outlined" @click="quickMove('f8', 'c5', 'h')">
                h: Bc5
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, onBeforeUnmount } from 'vue';
import { Stage, type Actor } from '../letterpeople/scene/Stage';
import { startIdle } from '../letterpeople/animations';
import { randomVibrancyColor } from '../letterpeople/util/color';
import {
  createChessboardPropConfigurable,
  type ChessboardPropController,
  type ChessSquare,
  type ChessFile,
  type ChessRank,
} from '../letterpeople/props/chessboard';

// ─── Refs ─────────────────────────────────────────────────────

const stageContainer = ref<HTMLElement | null>(null);
const stage = shallowRef<Stage | null>(null);

// ─── Position tuning ──────────────────────────────────────────

const pos = ref({
  cX: 0,
  cZ: 72,
  boardX: 0,
  boardZ: 70,
  hX: 0,
  hZ: 72,
});

function applyPositions() {
  const c = actors.value.c;
  const h = actors.value.h;
  if (c) c.move3D(pos.value.cX, pos.value.cZ, 0);
  if (h) h.move3D(pos.value.hX, pos.value.hZ, 0);
  if (boardProp.value) {
    boardProp.value.reposition(pos.value.boardX, pos.value.boardZ);
  }
}

function logPositions() {
  console.log('Scene positions:', JSON.parse(JSON.stringify(pos.value)));
}

const actors = shallowRef<{ c: Actor | null; h: Actor | null }>({
  c: null,
  h: null,
});

const boardProp = ref<ChessboardPropController | null>(null);

const idleActive = ref<{ c: boolean; h: boolean }>({ c: false, h: false });
const idleCleanups: { c: (() => void) | null; h: (() => void) | null } = {
  c: null,
  h: null,
};

const showAnchors = ref(false);
let anchorElements: HTMLElement[] = [];

// ─── Move controls ────────────────────────────────────────────

const moveFrom = ref<string | null>(null);
const moveTo = ref<string | null>(null);

const FILES: ChessFile[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS: ChessRank[] = [1, 2, 3, 4, 5, 6, 7, 8];

const allSquareLabels = computed(() => {
  const labels: string[] = [];
  for (const f of FILES) {
    for (const r of RANKS) {
      labels.push(`${f}${r}`);
    }
  }
  return labels.sort();
});

const occupiedSquares = computed(() => {
  if (!boardProp.value) return [];
  return boardProp.value
    .getAllPieces()
    .map((p) => `${p.square.file}${p.square.rank}`)
    .sort();
});

const pieceCount = computed(() => {
  return boardProp.value?.getAllPieces().length ?? 0;
});

function parseSquare(label: string): ChessSquare {
  return {
    file: label[0] as ChessFile,
    rank: parseInt(label[1]) as ChessRank,
  };
}

// ─── Scene lifecycle ──────────────────────────────────────────

function initScene() {
  if (!stageContainer.value || stage.value) return;

  // Create stage
  stage.value = new Stage(stageContainer.value, {
    backgroundColor: '#e8e4dc',
    horizonRatio: 0.32,
  });

  const containerW = stageContainer.value.clientWidth || 800;
  const containerH = stageContainer.value.clientHeight || 450;

  // ── Characters fill most of the frame height ────────────────
  const actorHeight = Math.round(containerH * 1.0);

  // ── Board: at waist/arm level, ~42% of width ────────────────
  const boardSvgWidth = Math.round(containerW * 0.42);
  const boardX = Math.round((containerW - boardSvgWidth) / 2);

  // Flat-ish perspective, moderate vertical span
  const boardSpan = 80;
  const boardTopY = 15;
  boardProp.value = createChessboardPropConfigurable(
    stage.value,
    { kind: 'staged', x: boardX, z: 70 },
    {
      width: boardSvgWidth,
      thickness: 8,
      topWidth: Math.round(boardSvgWidth * 0.84),
      bottomWidth: Math.round(boardSvgWidth * 0.97),
      topY: boardTopY,
      bottomY: boardTopY + boardSpan,
      lightColor: '#D1D5DB',
      darkColor: '#9CA3AF',
      edgeColor: '#4B5563',
      orientation: 'side',
    },
  );

  // Set up standard position
  boardProp.value.setupStandardPosition();

  // ── Position actors flanking the board ──────────────────────
  // Actors overlap the board edges slightly for a tight composition.
  const cX = boardX - actorHeight * 0.22;
  const cZ = 72;
  const hX = boardX + boardSvgWidth - actorHeight * 0.12;
  const hZ = 72;

  // Initialise slider state so sliders reflect actual positions
  pos.value = { cX, cZ, boardX, boardZ: 70, hX, hZ };

  // 'c' sits to the LEFT of the board (white side), facing right
  const cColor = randomVibrancyColor();
  const cActor = stage.value.addActor('c', 'c', {
    x: cX,
    z: cZ,
    height: actorHeight,
    letterOptions: {
      color: cColor,
      showEyes: true,
      showMouth: true,
      showArms: true,
      showEyebrows: true,
    },
  });

  // 'h' sits to the RIGHT of the board (black side), facing left
  const hColor = randomVibrancyColor();
  const hActor = stage.value.addActor('h', 'h', {
    x: hX,
    z: hZ,
    height: actorHeight,
    letterOptions: {
      color: hColor,
      showEyes: true,
      showMouth: true,
      showArms: true,
      showEyebrows: true,
    },
  });

  actors.value = { c: cActor, h: hActor };

  // Face inward toward the board
  if (cActor) {
    cActor.instance.body.turnTo(20); // face right toward board
  }
  if (hActor) {
    hActor.instance.body.turnTo(-20); // face left toward board
  }

  // Both gaze down at the board
  bothLookAtBoard();
}

function destroyScene() {
  stopAllIdles();
  clearAnchors();

  if (boardProp.value) {
    boardProp.value.unmount();
    boardProp.value = null;
  }

  stage.value?.destroy();
  stage.value = null;
  actors.value = { c: null, h: null };
  showAnchors.value = false;
}

// ─── Board controls ───────────────────────────────────────────

function setupStandard() {
  boardProp.value?.setupStandardPosition();
}

function clearBoard() {
  boardProp.value?.clearPieces();
}

function setupMidgame() {
  if (!boardProp.value) return;
  boardProp.value.clearPieces();

  // A classic Sicilian-ish position
  const positions: Array<{ kind: string; color: string; file: string; rank: number }> = [
    // White pieces
    { kind: 'king', color: 'white', file: 'g', rank: 1 },
    { kind: 'queen', color: 'white', file: 'd', rank: 1 },
    { kind: 'rook', color: 'white', file: 'a', rank: 1 },
    { kind: 'rook', color: 'white', file: 'f', rank: 1 },
    { kind: 'bishop', color: 'white', file: 'c', rank: 4 },
    { kind: 'bishop', color: 'white', file: 'e', rank: 3 },
    { kind: 'knight', color: 'white', file: 'f', rank: 3 },
    { kind: 'pawn', color: 'white', file: 'a', rank: 2 },
    { kind: 'pawn', color: 'white', file: 'b', rank: 2 },
    { kind: 'pawn', color: 'white', file: 'c', rank: 2 },
    { kind: 'pawn', color: 'white', file: 'e', rank: 4 },
    { kind: 'pawn', color: 'white', file: 'f', rank: 2 },
    { kind: 'pawn', color: 'white', file: 'g', rank: 2 },
    { kind: 'pawn', color: 'white', file: 'h', rank: 2 },
    // Black pieces
    { kind: 'king', color: 'black', file: 'g', rank: 8 },
    { kind: 'queen', color: 'black', file: 'd', rank: 8 },
    { kind: 'rook', color: 'black', file: 'a', rank: 8 },
    { kind: 'rook', color: 'black', file: 'f', rank: 8 },
    { kind: 'bishop', color: 'black', file: 'c', rank: 8 },
    { kind: 'knight', color: 'black', file: 'c', rank: 6 },
    { kind: 'knight', color: 'black', file: 'f', rank: 6 },
    { kind: 'pawn', color: 'black', file: 'a', rank: 7 },
    { kind: 'pawn', color: 'black', file: 'b', rank: 7 },
    { kind: 'pawn', color: 'black', file: 'd', rank: 6 },
    { kind: 'pawn', color: 'black', file: 'e', rank: 5 },
    { kind: 'pawn', color: 'black', file: 'g', rank: 7 },
    { kind: 'pawn', color: 'black', file: 'h', rank: 7 },
  ];

  for (const p of positions) {
    boardProp.value.placePiece({
      kind: p.kind as any,
      color: p.color as any,
      square: { file: p.file as ChessFile, rank: p.rank as ChessRank },
    });
  }
}

// ─── Move piece ───────────────────────────────────────────────

async function doMove(actorId: 'c' | 'h' | null) {
  if (!boardProp.value || !moveFrom.value || !moveTo.value) return;

  const from = parseSquare(moveFrom.value);
  const to = parseSquare(moveTo.value);

  const actor = actorId ? actors.value[actorId] : undefined;

  // Determine which hand: c is on the left so uses right hand to reach board,
  // h is on the right so uses left hand
  const hand = actorId === 'h' ? 'left' : 'right';

  await boardProp.value.movePiece(from, to, actor ?? undefined, hand, 800);

  // After moving, have the actor look back at the board center
  if (actor && boardProp.value) {
    const center = boardProp.value.getStagePoint('boardCenter');
    const local = actor.toLocalPoint(center);
    actor.lookAt(local);
  }
}

function quickMove(fromLabel: string, toLabel: string, actorId: 'c' | 'h') {
  moveFrom.value = fromLabel;
  moveTo.value = toLabel;
  doMove(actorId);
}

// ─── Anchor debugging ─────────────────────────────────────────

function toggleAnchors() {
  if (showAnchors.value) {
    clearAnchors();
    showAnchors.value = false;
    return;
  }

  if (!boardProp.value || !stage.value) return;

  const anchorNames: Array<'boardCenter' | 'frontEdgeCenter' | 'backEdgeCenter' | 'leftSeat' | 'rightSeat'> = [
    'boardCenter',
    'frontEdgeCenter',
    'backEdgeCenter',
    'leftSeat',
    'rightSeat',
  ];

  for (const a of anchorNames) {
    const pt = boardProp.value.getStagePoint(a);
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = `${pt.x - 4}px`;
    el.style.top = `${pt.y - 4}px`;
    el.style.width = '8px';
    el.style.height = '8px';
    el.style.backgroundColor = 'red';
    el.style.borderRadius = '50%';
    el.style.zIndex = '9999';
    el.style.pointerEvents = 'none';

    const label = document.createElement('div');
    label.innerText = a;
    label.style.position = 'absolute';
    label.style.left = '12px';
    label.style.top = '-4px';
    label.style.fontSize = '10px';
    label.style.color = 'red';
    label.style.whiteSpace = 'nowrap';
    el.appendChild(label);

    stage.value.container.appendChild(el);
    anchorElements.push(el);
  }

  showAnchors.value = true;
}

function clearAnchors() {
  anchorElements.forEach((el) => el.remove());
  anchorElements = [];
}

// ─── Actor controls ───────────────────────────────────────────

function actorSay(id: 'c' | 'h', text: string) {
  actors.value[id]?.say(text, 3000);
}

function actorSilence(id: 'c' | 'h') {
  actors.value[id]?.silence();
}

function actorWave(id: 'c' | 'h') {
  actors.value[id]?.instance.arms.wave({ duration: 600 });
}

function bothLookAtBoard() {
  if (!boardProp.value) return;
  const center = boardProp.value.getStagePoint('boardCenter');
  const c = actors.value.c;
  const h = actors.value.h;
  if (c) {
    const local = c.toLocalPoint(center);
    c.lookAt(local);
  }
  if (h) {
    const local = h.toLocalPoint(center);
    h.lookAt(local);
  }
}

function bothLookAtEachOther() {
  const c = actors.value.c;
  const h = actors.value.h;
  if (c && h) {
    c.lookAt(h);
    h.lookAt(c);
  }
}

function toggleIdle(id: 'c' | 'h') {
  const actor = actors.value[id];
  if (!actor) return;

  if (idleActive.value[id]) {
    idleCleanups[id]?.();
    idleCleanups[id] = null;
    idleActive.value[id] = false;
  } else {
    idleCleanups[id] = startIdle(actor.instance, {
      intensity: 0.2,
      enableTracking: true,
    });
    idleActive.value[id] = true;
  }
}

function stopAllIdles() {
  idleCleanups.c?.();
  idleCleanups.h?.();
  idleCleanups.c = null;
  idleCleanups.h = null;
  idleActive.value = { c: false, h: false };
}

// ─── Cleanup ──────────────────────────────────────────────────

onBeforeUnmount(() => {
  destroyScene();
});
</script>

<style scoped>
.stage-canvas {
  width: 100%;
  height: 420px;
  border: 1px solid #ccc;
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}

.gap-2 {
  gap: 8px;
}

.slider-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
}

@media (max-width: 850px) {
  .slider-grid {
    grid-template-columns: 1fr;
  }
}

.slider-group {
  min-width: 0;
}

.slider-label {
  display: grid;
  grid-template-columns: 18px 1fr 40px;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  margin-bottom: 2px;
}

.slider-label span:first-child {
  font-weight: 600;
  color: #666;
}

.slider-val {
  font-family: monospace;
  font-size: 0.75rem;
  color: #4f46e5;
  text-align: right;
}

.slider-label input[type="range"] {
  width: 100%;
  accent-color: #4f46e5;
}
</style>