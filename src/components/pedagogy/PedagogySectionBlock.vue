<!--
  One anchored section of /learning-engine: icon + heading + summary, then
  (rivals only) what it wants and who it argues with, then the prose.

  Rivals fold their prose behind a "More" toggle (2026-10-09): heading,
  summary and the stance stay visible — they're what pairs with the Team of
  Rivals panel — and the column stays about as long as the pinned panel.
  A hash link to the section (`/learning-engine#srs`) opens it.
  Working-text boxes show only with SHOW_WORKING_TEXT.
-->
<template>
    <section
        :id="section.id"
        class="ped-section"
        :style="rival ? { '--rival-color': RIVAL_STYLE[rival].color } : undefined"
    >
        <header class="ped-head">
            <RivalDisc v-if="rival" :rival="rival" :size="32" class="ped-disc" />
            <v-icon v-else class="ped-icon" size="28">{{ section.icon }}</v-icon>
            <div>
                <h3 class="ped-name">{{ section.name }}</h3>
                <p class="ped-summary">{{ section.summary }}</p>
            </div>
        </header>
        <dl v-if="section.wants || section.pullsAgainst" class="ped-stance">
            <template v-if="section.wants">
                <dt>Aims for</dt>
                <dd v-html="renderInline(section.wants)"></dd>
            </template>
            <template v-if="section.pullsAgainst">
                <dt>In tension with</dt>
                <dd v-html="renderInline(section.pullsAgainst)"></dd>
            </template>
        </dl>
        <button
            v-if="foldable"
            type="button"
            class="ped-more"
            :aria-expanded="open"
            :aria-controls="`${section.id}-body`"
            @click="open = !open"
        >
            {{ open ? "Less" : "More" }}
            <v-icon size="18">{{ open ? "mdi-chevron-up" : "mdi-chevron-down" }}</v-icon>
        </button>
        <v-expand-transition>
            <div v-show="open || !foldable" :id="`${section.id}-body`" class="ped-body">
                <template v-for="(detail, i) in details" :key="i">
                    <p v-if="typeof detail === 'string'" v-html="renderInline(detail)"></p>
                    <p v-else-if="detail.type === 'example'">
                        <strong>{{ detail.label }}</strong>
                        {{ " " }}<span v-html="renderInline(detail.text)"></span>
                    </p>
                    <p v-else-if="detail.type === 'labeled'">
                        <strong>{{ detail.label }}</strong>
                        {{ " " }}<span v-html="renderInline(detail.text)"></span>
                    </p>
                    <!-- Working text: dense point-form notes awaiting real prose.
                         Deliberately loud so it can't ship unnoticed. -->
                    <div v-else-if="detail.type === 'working'" class="working-text">
                        <div class="working-label">working text</div>
                        <ul>
                            <li v-for="(pt, j) in detail.points" :key="j" v-html="renderInline(pt)"></li>
                        </ul>
                    </div>
                </template>
            </div>
        </v-expand-transition>
    </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { SHOW_WORKING_TEXT, type PedagogySection } from "../../content/pedagogyCopy";
import { renderInline } from "../landing/inlineMarkup";
import RivalDisc from "./RivalDisc.vue";
import { isRivalId, RIVAL_STYLE } from "./rivals";

const props = defineProps<{ section: PedagogySection }>();

/** A rival section wears its rival's colour and disc; evidence sections stay primary. */
const rival = computed(() => (isRivalId(props.section.id) ? props.section.id : null));

// Draft material is filtered here rather than removed from the copy file, so
// the notes stay next to the prose they belong to.
const details = computed(() =>
    SHOW_WORKING_TEXT
        ? props.section.details
        : props.section.details.filter((d) => typeof d === "string" || d.type !== "working"),
);

/** Rivals with prose fold it away; evidence sections are all body, so they don't. */
const foldable = computed(() => rival.value !== null && details.value.length > 0);

const route = useRoute();
const open = ref(false);
watch(
    () => route.hash,
    (hash) => {
        if (hash === `#${props.section.id}`) open.value = true;
    },
    { immediate: true },
);
</script>

<style scoped>
.ped-section {
    padding: 32px 0;
    border-top: 1px solid rgba(33, 33, 33, 0.1);
    scroll-margin-top: calc(var(--v-layout-top, 0px) + 24px);
}
.ped-head {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 16px;
}
.ped-disc {
    margin-top: -2px;
}
.ped-icon {
    flex-shrink: 0;
    margin-top: 2px;
    color: rgb(var(--v-theme-primary));
}
.ped-name {
    font-size: 1.375rem;
    font-weight: 700;
    line-height: 1.25;
    margin: 0 0 2px;
}
.ped-summary {
    font-size: 0.95rem;
    margin: 0;
    color: rgba(33, 33, 33, 0.6);
}

/* What it wants, who it argues with: a labelled pair, set off by a rule */
.ped-stance {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 6px 16px;
    margin: 0 0 16px 42px;
    padding: 4px 0 4px 16px;
    border-left: 3px solid var(--rival-color, rgba(var(--v-theme-primary), 0.35));
}
.ped-stance dt {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    line-height: 1.9;
    color: rgba(33, 33, 33, 0.5);
}
.ped-stance dd {
    margin: 0;
    line-height: 1.6;
}
.ped-more {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin: 0 0 0 42px;
    padding: 2px 6px 2px 8px;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    color: rgba(33, 33, 33, 0.6);
}
.ped-more:hover,
.ped-more:focus-visible {
    background: rgba(33, 33, 33, 0.06);
    color: rgba(33, 33, 33, 0.85);
}
.ped-more + .ped-body {
    padding-top: 12px;
}
.ped-body {
    margin-left: 42px;
}
.ped-body p {
    margin: 0 0 12px;
    line-height: 1.7;
}
.ped-body p:last-child {
    margin-bottom: 0;
}
@media (max-width: 600px) {
    .ped-stance,
    .ped-more,
    .ped-body {
        margin-left: 0;
    }
    .ped-stance {
        grid-template-columns: 1fr;
        gap: 0 0;
    }
    .ped-stance dd + dt {
        margin-top: 8px;
    }
}

.working-text {
    border: 2px dashed rgba(var(--v-theme-warning), 0.7);
    border-radius: 10px;
    padding: 10px 14px 10px 8px;
    margin: 0 0 12px;
    background: rgba(var(--v-theme-warning), 0.06);
}
.working-label {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-warning));
    margin-left: 8px;
    margin-bottom: 4px;
}
.working-text ul {
    margin: 0;
    padding-left: 24px;
}
.working-text li {
    margin: 0 0 4px;
    line-height: 1.5;
}
/* :deep() — chips are injected via v-html, so they lack the scoped attr. */
.ped-section :deep(code) {
    background: rgba(var(--v-theme-primary), 0.1);
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.95em;
    color: rgb(var(--v-theme-primary));
    font-weight: 600;
}
</style>
