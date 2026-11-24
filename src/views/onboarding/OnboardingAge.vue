<template>
    <OnboardingLayout
        current-screen="age"
        screen-title="Tell us about your child"
        :can-continue="canContinue"
    >
        <div class="onboarding-age">
            <p class="text-body-1 text-medium-emphasis mb-6">
                Help us to ballpark where your learner currently is.
            </p>

            <!-- Section: Child's Age -->
            <div class="mb-8">
                <h2 class="text-h5 mb-4 text-primary">
                    How old is your child?
                </h2>
                <v-radio-group
                    v-model="selectedAge"
                    @update:model-value="handleAgeSelection"
                    color="primary"
                >
                    <v-radio
                        v-for="option in ageOptions"
                        :key="option.value"
                        :label="option.label"
                        :value="option.value"
                    />
                </v-radio-group>
            </div>

            <!-- Section: Literacy Level -->
            <div>
                <h2 class="text-h5 mb-4 text-primary">
                    What describes your child's reading experience best?
                </h2>
                <v-radio-group
                    v-model="selectedLiteracyLevel"
                    @update:model-value="handleLiteracySelection"
                    color="primary"
                >
                    <v-radio
                        v-for="option in literacyOptions"
                        :key="option.value"
                        :label="option.label"
                        :value="option.value"
                    />
                </v-radio-group>
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
const selectedAge = ref<string>("");
const selectedLiteracyLevel = ref<number>(0);

// Age options from spec
const ageOptions = [
    { value: "2 years", label: "2 years or less" },
    { value: "2.5-3 years", label: "2 ½" },
    { value: "3-3.5 years", label: "3" },
    { value: "3.5-4 years", label: "3 ½" },
    { value: "4-4.5 years", label: "4" },
    { value: "4.5-5 years", label: "4 ½" },
    { value: "5+ years", label: "5 years or more" },
];

// Literacy level options from spec
const literacyOptions = [
    { value: 1, label: "Little direct experience with reading mechanics" },
    { value: 2, label: "Knows some letter names and sounds" },
    { value: 3, label: "Knows many letter names and sounds" },
    { value: 4, label: "Can read some words independently" },
];

// Enable continue button only when both selections are made
const canContinue = computed(() => {
    return selectedAge.value !== "" && selectedLiteracyLevel.value > 0;
});

// Handle age selection
const handleAgeSelection = (age: string) => {
    selectedAge.value = age;
    onboardingStore.updateChildAge(age);
};

// Handle literacy selection
const handleLiteracySelection = (level: number) => {
    selectedLiteracyLevel.value = level;
    onboardingStore.updateLiteracyLevel(level as 1 | 2 | 3 | 4);
};

// Initialize from store on mount
onMounted(() => {
    const data = onboardingStore.data;
    if (data.childAge) {
        selectedAge.value = data.childAge;
    }
    if (data.literacyLevel) {
        selectedLiteracyLevel.value = data.literacyLevel;
    }
});
</script>

<style scoped>
.onboarding-age {
    max-width: 600px;
    margin: 0 auto;
}

.v-radio-group :deep(.v-selection-control) {
    margin-bottom: 12px;
}

.v-radio-group :deep(.v-label) {
    font-size: 1rem;
    line-height: 1.4;
}

@media (max-width: 600px) {
    .text-h5 {
        font-size: 1.25rem !important;
    }

    .v-radio-group :deep(.v-label) {
        font-size: 0.95rem;
    }
}
</style>