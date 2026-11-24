<template>
    <v-app>
        <!-- `bare` routes (router meta) run without the header -->
        <course-header v-if="!$route.meta.bare" :logo="courseConfig.logo" />

        <v-main>
        <router-view v-slot="{ Component }">
          <!--
            NOTE: previously wrapped in <Transition name="fade" mode="out-in">.
            That caused a blank <v-main> when SignUpView navigated to
            /onboarding/age — the leave phase of SignUpView (which holds a
            2s setTimeout to show the funnel-migration success alert) would
            stall the slot before OnboardingAge could mount.
            If a transition is desired, do NOT use mode="out-in" here.
          -->
          <component :is="Component" :key="$route.path"/>
        </router-view>
            <!-- <Transition name="fade" mode="out-in">
                <router-view v-slot= "">
            </Transition> -->
        </v-main>

        <SnackbarService />

        <div v-if="devDayOffset > 0" class="dev-date-badge">
          date: +{{ devDayOffset }}d
        </div>
    </v-app>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { devDayOffset, initDevDateOffset } from "./dbg/devDateOffset";
import { useTheme } from "vuetify";
import { useCourseConfig } from "./composables/useCourseConfig";
import CourseHeader from "./components/CourseHeader.vue";
import {
    SkMouseTrap,
    SkldrMouseTrap,
    SnackbarService,
    useConfigStore,
} from "@vue-skuilder/common-ui";

const { courseConfig } = useCourseConfig();
const configStore = useConfigStore();
const theme = useTheme();

// Force light mode always for LettersPractice (ignore user's platform config)
const dark = computed(() => {
    return false;
});

// Watch for dark mode changes and update Vuetify theme
watch(
    dark,
    (newVal) => {
        if (newVal) {
            theme.change("dark");
        } else {
            theme.change("light");
        }
    },
    { immediate: true },
);

onMounted(() => {
    initDevDateOffset();

    // Add a global shortcut to show the keyboard shortcuts dialog
    SkldrMouseTrap.addBinding({
        hotkey: "?",
        command: "Show keyboard shortcuts",
        callback: () => {
            const keyboardButton = document.querySelector(".mdi-keyboard");
            if (keyboardButton) {
                (keyboardButton as HTMLElement).click();
            }
        },
    });
});
</script>

<style lang="css">
.fade-enter-active,
.fade-leave-active{
    transition: opacity 0.25s, transform 0.25s;
}
.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.dev-date-badge {
  position: fixed;
  bottom: 8px;
  right: 8px;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font: 600 11px/1 monospace;
  padding: 4px 7px;
  border-radius: 4px;
  pointer-events: none;
  user-select: none;
}

/* Copy markup's fact badges (renderInline, components/landing/inlineMarkup.ts).
   Global: they're emitted as v-html, so scoped styles can't reach them. */
.inline-fact {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  /* Shorter than the line, so chips on adjacent lines keep a gap */
  padding: 1px 5px 0;
  border: 0;
  border-bottom: 2px solid var(--fact-color);
  border-radius: 4px 4px 0 0;
  background: color-mix(in srgb, var(--fact-color) 12%, transparent);
  font: inherit;
  color: inherit;
  line-height: 1.35;
  cursor: pointer;
}
.inline-fact:hover {
  background: color-mix(in srgb, var(--fact-color) 24%, transparent);
}
.inline-fact:focus-visible {
  outline: 2px solid var(--fact-color);
  outline-offset: 2px;
}
.inline-fact__icon {
  align-self: center;
  font-size: 14px;
  opacity: 0.6;
}

</style>