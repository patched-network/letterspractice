<template>
    <OnboardingLayout
        current-screen="preferences"
        screen-title="What interests your child?"
        :can-continue="true"
    >
        <div class="onboarding-preferences">
            <div class="mb-6">
                <h2 class="text-h5 mb-2 text-primary">Content Areas</h2>
                <p class="text-body-1 text-medium-emphasis mb-6">
                    Select topics your child enjoys. This helps us personalize
                    their learning experience.
                </p>
            </div>

            <div class="preference-grid">
                <v-card
                    v-for="category in contentCategories"
                    :key="category.key"
                    class="preference-card"
                    :class="getCardClass(category.key)"
                    @click="togglePreference(category.key)"
                    elevation="1"
                    hover
                >
                    <v-card-text class="text-center py-6">
                        <v-icon
                            :icon="category.icon"
                            size="48"
                            class="mb-3"
                            :color="getIconColor(category.key)"
                        />
                        <div class="text-subtitle-1 font-weight-medium">
                            {{ category.label }}
                        </div>
                        <div class="mt-3">
                            <v-chip
                                :color="getChipColor(category.key)"
                                variant="flat"
                                size="small"
                            >
                                {{ getPreferenceLabel(category.key) }}
                            </v-chip>
                        </div>
                    </v-card-text>
                </v-card>
            </div>

            <div class="mt-6 text-center">
                <p class="text-caption text-medium-emphasis">
                    Tap cards to cycle through: Not Interested → Neutral →
                    Interested
                </p>
            </div>
        </div>
    </OnboardingLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useOnboardingStore } from "@/stores/onboarding";
import OnboardingLayout from "@/components/onboarding/OnboardingLayout.vue";

type PreferenceLevel = "not-interested" | "neutral" | "interested";

const onboardingStore = useOnboardingStore();

// Local reactive state
const preferences = ref<Record<string, PreferenceLevel>>({});

// Content categories from spec
const contentCategories = [
    { key: "animals", label: "Animals", icon: "mdi-paw" },
    { key: "transportation", label: "Transportation", icon: "mdi-car" },
    { key: "family", label: "Family & Friends", icon: "mdi-account-group" },
    { key: "nature", label: "Nature", icon: "mdi-tree" },
    { key: "food", label: "Food & Cooking", icon: "mdi-food-apple" },
    {
        key: "community",
        label: "Community Helpers",
        icon: "mdi-account-hard-hat",
    },
    { key: "sports", label: "Sports & Movement", icon: "mdi-soccer" },
    { key: "fantasy", label: "Fantasy & Adventure", icon: "mdi-castle" },
];

// Methods
const togglePreference = (category: string) => {
    const current = preferences.value[category] || "neutral";
    let next: PreferenceLevel;

    switch (current) {
        case "not-interested":
            next = "neutral";
            break;
        case "neutral":
            next = "interested";
            break;
        case "interested":
            next = "not-interested";
            break;
        default:
            next = "neutral";
    }

    preferences.value[category] = next;
    onboardingStore.updateContentPreference(category, next);
};

const getPreferenceLabel = (category: string): string => {
    const pref = preferences.value[category] || "neutral";
    switch (pref) {
        case "not-interested":
            return "Not Interested";
        case "neutral":
            return "Neutral";
        case "interested":
            return "Interested";
        default:
            return "Neutral";
    }
};

const getCardClass = (category: string): string => {
    const pref = preferences.value[category] || "neutral";
    switch (pref) {
        case "not-interested":
            return "preference-not-interested";
        case "interested":
            return "preference-interested";
        default:
            return "preference-neutral";
    }
};

const getIconColor = (category: string): string => {
    const pref = preferences.value[category] || "neutral";
    switch (pref) {
        case "not-interested":
            return "error";
        case "interested":
            return "success";
        default:
            return "primary";
    }
};

const getChipColor = (category: string): string => {
    const pref = preferences.value[category] || "neutral";
    switch (pref) {
        case "not-interested":
            return "error";
        case "interested":
            return "success";
        default:
            return "primary";
    }
};

// Initialize from store on mount
onMounted(() => {
    const storePrefs = onboardingStore.data.contentPreferences;

    // Initialize all categories to neutral if not set
    contentCategories.forEach((category) => {
        preferences.value[category.key] = storePrefs[category.key] || "neutral";
    });
});
</script>

<style scoped>
.onboarding-preferences {
    max-width: 800px;
    margin: 0 auto;
}

.preference-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
}

.preference-card {
    cursor: pointer;
    transition: all 0.2s ease;
    border: 2px solid transparent;
}

.preference-card:hover {
    /*transform: translateY(-2px);*/
}

.preference-neutral {
    border-color: rgb(var(--v-theme-primary));
    background-color: rgba(var(--v-theme-primary), 0.05);
}

.preference-interested {
    border-color: rgb(var(--v-theme-success));
    background-color: rgba(var(--v-theme-success), 0.1);
}

.preference-not-interested {
    border-color: rgb(var(--v-theme-error));
    background-color: rgba(var(--v-theme-error), 0.05);
}

@media (max-width: 600px) {
    .preference-grid {
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 12px;
    }

    .preference-card :deep(.v-card-text) {
        padding: 16px 12px !important;
    }

    .preference-card :deep(.v-icon) {
        font-size: 36px !important;
    }

    .text-h5 {
        font-size: 1.25rem !important;
    }
}
</style>
