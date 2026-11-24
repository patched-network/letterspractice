<template>
    <OnboardingLayout
        current-screen="sensitive"
        screen-title="Words to avoid (optional)"
        :can-continue="true"
    >
        <div class="onboarding-sensitive">
            <div class="mb-6">
                <h2 class="text-h5 mb-2 text-primary">Topics to Avoid?</h2>
                <p class="text-body-1 text-medium-emphasis mb-4">
                    Sometimes common words can have an uncommon impact.
                </p>

                <p class="text-body-1 text-medium-emphasis mb-4">
                    If there's anything you or your child would prefer to avoid
                    right now, you can list them below.
                </p>
                <v-alert type="info" variant="tonal" class="mb-4">
                    <div class="text-body-2">
                        <strong>Example:</strong> If Spot the cat is no longer
                        with us, you might add both "Spot" and "cat"
                    </div>
                </v-alert>
            </div>

            <v-textarea
                v-model="sensitiveWordsText"
                @update:model-value="updateSensitiveWords"
                label="Words or topics to exclude"
                placeholder="dog, grandpa, etc."
                variant="outlined"
                rows="4"
                hide-details
                clearable
            >
                <template #prepend-inner>
                    <v-icon icon="mdi-shield-heart" color="primary" />
                </template>
            </v-textarea>

            <div class="mt-4">
                <div class="text-caption text-medium-emphasis mb-2">
                    <v-icon
                        icon="mdi-information-outline"
                        size="small"
                        class="mr-1"
                    />
                    Separate multiple words with commas. These words will be
                    filtered from learning content.
                </div>

                <!-- Show parsed words as chips if any -->
                <div v-if="parsedWords.length > 0" class="mt-3">
                    <div class="text-body-2 mb-2 text-medium-emphasis">
                        Words to exclude:
                    </div>
                    <v-chip
                        v-for="word in parsedWords"
                        :key="word"
                        class="mr-2 mb-1"
                        size="small"
                        color="error"
                        variant="outlined"
                    >
                        {{ word }}
                    </v-chip>
                </div>
            </div>
        </div>
    </OnboardingLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useOnboardingStore } from "@/stores/onboarding";
import OnboardingLayout from "@/components/onboarding/OnboardingLayout.vue";

const onboardingStore = useOnboardingStore();

// Local reactive state
const sensitiveWordsText = ref<string>("");

// Computed
const parsedWords = computed(() => {
    if (!sensitiveWordsText.value.trim()) return [];

    return sensitiveWordsText.value
        .split(",")
        .map((word) => word.trim().toLowerCase())
        .filter((word) => word.length > 0)
        .filter((word, index, arr) => arr.indexOf(word) === index); // Remove duplicates
});

// Methods
const updateSensitiveWords = () => {
    onboardingStore.updateSensitiveWords(parsedWords.value);
};

// Initialize from store on mount
onMounted(() => {
    const storeWords = onboardingStore.data.sensitiveWords;
    if (storeWords && storeWords.length > 0) {
        sensitiveWordsText.value = storeWords.join(", ");
    }
});
</script>

<style scoped>
.onboarding-sensitive {
    max-width: 700px;
    margin: 0 auto;
}

.v-textarea :deep(.v-field__input) {
    line-height: 1.5;
}

@media (max-width: 600px) {
    .text-h5 {
        font-size: 1.25rem !important;
    }
}
</style>
