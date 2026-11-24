<template>
    <div class="debug-layout">
        <div class="debug-navigation">
            <router-link to="/dbg" class="back-link">
                <v-btn
                    variant="outlined"
                    color="primary"
                    prepend-icon="mdi-arrow-left"
                    size="small"
                >
                    Back to Debug Index
                </v-btn>
            </router-link>

            <div class="breadcrumb" v-if="pageTitle">
                <span class="breadcrumb-item">Debug</span>
                <span class="breadcrumb-separator">›</span>
                <span class="breadcrumb-current">{{ pageTitle }}</span>
            </div>
        </div>

        <div class="debug-content">
            <router-view />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();

// Map route names to display titles
const routeTitleMap: Record<string, string> = {
    theme: "Theme",
    letterpeople: "LetterPeople",
    "words-debug": "Words",
    "word-playground": "Word Playground",
    "word-component": "Word Component",
    "transform-test": "Transform Test",
    "transform-playground": "Transform Playground",
    "phonetic-word-debug": "Phonetic Word",
    "shadow-test": "Shadow Test",
    "animations-debug": "Animations",
    "juggling-debug": "Juggling",
    "arms-debug": "Arms",
    "checkout-debug": "Checkout",
    "debug-auth": "Authentication",
    "keyboard-debug": "ProgressiveKeyboard",
    "keyboard-context-debug": "Keyboard Context",
    "practice-vignettes-debug": "Practice Vignettes",
    "prop-scene-debug": "Props & Choreography",
};

const pageTitle = computed(() => {
    const routeName = route.name as string;
    return routeTitleMap[routeName] || null;
});
</script>

<style scoped>
.debug-layout {
    width: 100%;
    margin: 0;
    padding: 0;
}

.debug-navigation {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.back-link {
    text-decoration: none;
}

.breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #666;
}

.breadcrumb-item {
    opacity: 0.7;
}

.breadcrumb-separator {
    opacity: 0.5;
    font-weight: bold;
}

.breadcrumb-current {
    font-weight: 600;
    color: rgb(var(--v-theme-primary));
}

.debug-content {
    margin: 1.5em;
}

.debug-content :deep(.debug-container),
.debug-content :deep(.phonetic-word-debug) {
    max-width: none;
    margin: 0;
    padding: 0;
}

@media (max-width: 600px) {
    .debug-navigation {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
    }

    .breadcrumb {
        order: -1;
    }
}
</style>
