<template>
  <div class="letter-export-harness">
    <div
      ref="container"
      class="letter-container"
      :data-ready="ready ? 'true' : 'false'"
      :data-error="error || undefined"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { createLetter } from "../letterpeople";
import { oklchToRgb } from "../letterpeople/util/color";
import { POSES, applyPose, type PoseName } from "../../scripts/export-letterpeople/poses";
import { seedToHue } from "../../scripts/export-letterpeople/seed";

declare global {
  interface Window {
    __letterReady?: boolean;
    __letterError?: string;
  }
}

const route = useRoute();
const container = ref<HTMLDivElement | null>(null);
const ready = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    const letter = String(route.query.letter ?? "A");
    const caseMode = String(route.query.case ?? "upper");
    const poseParam = String(route.query.pose ?? "resting") as PoseName;
    const hueMode = String(route.query.hue ?? "auto");
    const seed = String(route.query.seed ?? `${letter}-${caseMode}`);

    if (!POSES[poseParam]) {
      throw new Error(`Unknown pose "${poseParam}"`);
    }

    const recipe = POSES[poseParam];

    // Hue resolution. vibrancyHigh preset = lightness 0.7, chroma 0.15.
    // hue=neutral forces chroma 0 (gray) for re-tintable assets.
    const color =
      hueMode === "neutral"
        ? oklchToRgb(0.7, 0, 0)
        : oklchToRgb(0.7, 0.15, seedToHue(seed));

    if (!container.value) {
      throw new Error("Container ref missing");
    }

    const instance = createLetter(letter, container.value, {
      color,
      lineWidth: 22,
      borderWidth: 4,
      showEyes: true,
      showMouth: true,
      showArms: recipe.showArms,
      eyebrowsWithEyes: true,
      showEyebrows: true,
    });

    if (!instance) {
      throw new Error(`No renderer for letter "${letter}"`);
    }

    await applyPose(instance, poseParam);

    // Two RAFs to ensure the pose has painted before signalling readiness.
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );

    ready.value = true;
    window.__letterReady = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error.value = msg;
    window.__letterError = msg;
  }
});
</script>

<style scoped>
.letter-export-harness {
  display: inline-block;
  padding: 16px;
  background: transparent;
}
.letter-container {
  display: inline-block;
  /* Force a stable rendered size for the inline SVG so Playwright can
     screenshot it. The SVG carries a viewBox but no intrinsic dimensions. */
  width: 240px;
  height: 280px;
}
.letter-container :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
