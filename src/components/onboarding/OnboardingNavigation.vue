<template>
    <div class="onboarding-navigation">
        <v-row>
            <!-- Back Button -->
            <v-col cols="auto">
                <v-btn
                    v-if="showBackButton"
                    variant="text"
                    color="primary"
                    prepend-icon="mdi-arrow-left"
                    @click="$emit('back')"
                >
                    Back
                </v-btn>
            </v-col>

            <!-- Spacer -->
            <v-spacer />


            <!-- Next Button -->
            <v-col cols="auto">
                <v-btn
                    color="primary"
                    variant="flat"
                    append-icon="mdi-arrow-right"
                    :disabled="!canContinue"
                    @click="$emit('next')"
                >
                    {{ isLastScreen ? "All Done!" : "Continue" }}
                </v-btn>
            </v-col>
        </v-row>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
    useOnboardingStore,
    type OnboardingScreen,
    ONBOARDING_SCREENS,
} from "@/stores/onboarding";

interface Props {
    currentScreen: OnboardingScreen;
    canContinue: boolean;
}

const props = defineProps<Props>();

defineEmits<{
    back: [];
    next: [];
}>();

const onboardingStore = useOnboardingStore();

// Computed
const showBackButton = computed(() => {
    return onboardingStore.previousScreen(props.currentScreen) !== null;
});

const isLastScreen = computed(() => {
    return (
        props.currentScreen ===
        ONBOARDING_SCREENS[ONBOARDING_SCREENS.length - 1]
    );
});
</script>

<style scoped>
.onboarding-navigation {
    width: 100%;
}
</style>
