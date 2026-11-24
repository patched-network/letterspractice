<!--
  RivalDisc — a rival's icon on its colour: a white glyph knocked out of a
  filled disc, or (outline) the glyph in the colour inside a ring. The
  rival's name always sits beside it, so it's hidden from screen readers.
-->
<template>
    <span
        class="rival-disc"
        :class="{ 'rival-disc--outline': outline }"
        :style="{ '--rival-color': style.color, '--disc-size': `${size}px` }"
        aria-hidden="true"
    >
        <v-icon :size="Math.round(size * 0.6)">{{ style.icon }}</v-icon>
    </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RIVAL_STYLE, type RivalId } from "./rivals";

const props = withDefaults(defineProps<{ rival: RivalId; size?: number; outline?: boolean }>(), {
    size: 28,
    outline: false,
});
const style = computed(() => RIVAL_STYLE[props.rival]);
</script>

<style scoped>
.rival-disc {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: var(--disc-size);
    height: var(--disc-size);
    border-radius: 999px;
    background: var(--rival-color);
    color: #fff;
    transition: background-color 160ms ease, color 160ms ease;
}
.rival-disc--outline {
    background: transparent;
    box-shadow: inset 0 0 0 2px var(--rival-color);
    color: var(--rival-color);
}
</style>
