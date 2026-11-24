<template>
    <OnboardingLayout
        current-screen="decorations"
        screen-title="Seasonal themes & decorations"
        :can-continue="true"
    >
        <div class="onboarding-decorations">
            <div class="mb-6">
                <h2 class="text-h5 mb-2 text-primary">Seasonal Decorations?</h2>
                <p class="text-body-1 text-medium-emphasis mb-6">
                    The letters are a festive bunch. Sometimes they dress up a
                    little for special occasions.
                </p>
                <p class="text-body-1 text-medium-emphasis mb-6">
                    Please select your seasons-of-choice, or skip to keep it
                    professional all year round.
                </p>
            </div>

            <!-- Holiday Inclusions -->
            <v-expand-transition>
                <div>
                    <v-card elevation="1" class="holiday-card">
                        <v-card-text>
                            <div class="holiday-list">
                                <v-row
                                    v-for="holiday in shuffledHolidays"
                                    :key="holiday.key"
                                    class="holiday-item mb-3"
                                    no-gutters
                                    align="center"
                                    @click="
                                        toggleHoliday(
                                            holiday.key,
                                            !excludedHolidays[holiday.key],
                                        )
                                    "
                                    style="cursor: pointer"
                                >
                                    <v-col cols="auto" class="pr-4">
                                        <v-switch
                                            :model-value="
                                                !excludedHolidays[holiday.key]
                                            "
                                            @update:model-value="
                                                (enabled: boolean) =>
                                                    toggleHoliday(
                                                        holiday.key,
                                                        !enabled,
                                                    )
                                            "
                                            color="success"
                                            hide-details
                                            density="compact"
                                        />
                                    </v-col>
                                    <v-col class="holiday-text">
                                        <WordDisplay
                                            :ref="
                                                (el: any) =>
                                                    setWordDisplayRef(
                                                        holiday.key,
                                                        el as InstanceType<typeof WordDisplay> | null,
                                                    )
                                            "
                                            :text="holiday.name"
                                            :height="40"
                                            :options="{
                                                spacing: 5,
                                                letterOptions: {
                                                    color: '#444',
                                                    lineWidth: 20,
                                                    borderWidth: 4,
                                                },
                                            }"
                                        />
                                    </v-col>
                                </v-row>
                            </div>

                            <div class="mt-4">
                                <div class="text-caption text-medium-emphasis">
                                    <v-icon
                                        icon="mdi-information-outline"
                                        size="small"
                                        class="mr-1"
                                    />
                                    Toggle holidays on/off to include or exclude
                                    them from seasonal content.
                                </div>
                            </div>
                        </v-card-text>
                    </v-card>
                </div>
            </v-expand-transition>

            <div class="my-6">
                <p class="text-body-1 text-medium-emphasis mb-6">
                    If we are missing something that you would like to
                    celebrate, please
                    <a
                        @click="showHolidayRequestDialog = true"
                        class="text-primary text-decoration-none"
                        style="cursor: pointer"
                        >let us know</a
                    >!
                </p>

                <!-- Show submitted requests -->
                <div v-if="onboardingStore.data.holidayRequests.length > 0" class="mt-4">
                    <div class="text-body-2 mb-2 text-medium-emphasis">
                        Your holiday requests:
                    </div>
                    <v-chip
                        v-for="request in onboardingStore.data.holidayRequests"
                        :key="request"
                        class="mr-2 mb-1"
                        size="small"
                        color="info"
                        variant="outlined"
                    >
                        {{ request }}
                    </v-chip>
                </div>
            </div>

            <!-- Holiday Request Dialog -->
            <v-dialog v-model="showHolidayRequestDialog" max-width="500">
                <v-card>
                    <v-card-title class="text-h6">
                        Request a Holiday
                    </v-card-title>
                    <v-card-text>
                        <p class="text-body-2 mb-4">
                            What holiday or celebration would you like us to add?
                        </p>
                        <v-text-field
                            v-model="newHolidayRequest"
                            label="Holiday name"
                            placeholder="e.g., Diwali, Kwanzaa, Chinese New Year..."
                            variant="outlined"
                            autofocus
                            @keyup.enter="submitHolidayRequest"
                        />
                    </v-card-text>
                    <v-card-actions>
                        <v-spacer />
                        <v-btn
                            color="grey"
                            variant="text"
                            @click="showHolidayRequestDialog = false"
                        >
                            Cancel
                        </v-btn>
                        <v-btn
                            color="primary"
                            variant="flat"
                            :disabled="!newHolidayRequest.trim()"
                            @click="submitHolidayRequest"
                        >
                            Submit
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-dialog>
        </div>
    </OnboardingLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick } from "vue";
import { useOnboardingStore } from "@/stores/onboarding";
import OnboardingLayout from "@/components/onboarding/OnboardingLayout.vue";
import WordDisplay from "@/letterpeople/vue/WordDisplay.vue";
import {
    createSingleColorTransform,
    colorPatterns,
    createColorTransform,
} from "@/letterpeople/transforms/color";
import type { TransformFunction } from "@/letterpeople/types";

const onboardingStore = useOnboardingStore();

// Local reactive state
const seasonalEnabled = ref<boolean>(true);
const excludedHolidays = reactive<Record<string, boolean>>({});

// Holiday request dialog state
const showHolidayRequestDialog = ref<boolean>(false);
const newHolidayRequest = ref<string>("");

// Holiday definitions with themed colors
const holidays = [
    {
        key: "christmas",
        name: "Christmas",
        colors: colorPatterns.christmas,
    },
    {
        key: "halloween",
        name: "Halloween",
        colors: ["#FF6600", "#000000", "#FF6600", "#000000"], // Orange and black
    },
    {
        key: "easter",
        name: "Easter",
        colors: colorPatterns.pastel,
    },
    {
        key: "hanukkah",
        name: "Hanukkah",
        colors: ["#0033CC", "#FFFFFF", "#0033CC", "#FFFFFF"], // Blue and white
    },
    {
        key: "diwali",
        name: "Diwali",
        colors: colorPatterns.warm,
    },
    {
        key: "valentines",
        name: "Valentine's Day",
        colors: ["#FF1493", "#FFB6C1", "#FF1493", "#FFB6C1"], // Pink theme
    },
];

// Shuffle holidays for random display order
const shuffledHolidays = computed(() => {
    const shuffled = [...holidays];
    // Simple shuffle algorithm
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
});

// Computed
const excludedHolidayNames = computed(() => {
    return holidays
        .filter((holiday) => excludedHolidays[holiday.key])
        .map((holiday) => holiday.name);
});

// Methods
const toggleHoliday = (holidayKey: string, excluded: boolean) => {
    excludedHolidays[holidayKey] = excluded;
    updateSeasonalSettings();

    // Apply the transform immediately after toggling
    nextTick(() => {
        applyHolidayTransform(holidayKey);
    });
};

const updateSeasonalSettings = () => {
    onboardingStore.updateSeasonalSettings(
        seasonalEnabled.value,
        excludedHolidayNames.value,
    );
};

// Holiday request methods
const submitHolidayRequest = () => {
    if (newHolidayRequest.value.trim()) {
        onboardingStore.addHolidayRequest(newHolidayRequest.value.trim());
        newHolidayRequest.value = "";
        showHolidayRequestDialog.value = false;
    }
};

// Store refs to WordDisplay components
const wordDisplayRefs = ref<
    Record<string, InstanceType<typeof WordDisplay> | null>
>({});

const setWordDisplayRef = (
    holidayKey: string,
    el: InstanceType<typeof WordDisplay> | null,
) => {
    wordDisplayRefs.value[holidayKey] = el;
};

// Apply color transform to a specific holiday
const applyHolidayTransform = (holidayKey: string) => {
    const wordDisplay = wordDisplayRefs.value[holidayKey];
    if (!wordDisplay) return;

    const holiday = holidays.find((h) => h.key === holidayKey);
    if (!holiday) return;

    const wordInstance = wordDisplay.getWordInstance();
    if (!wordInstance) return;

    const isExcluded = excludedHolidays[holidayKey];

    if (isExcluded) {
        // Apply gray color
        const grayTransform = createSingleColorTransform("#9E9E9E", {
            duration: 300,
            animate: true,
        });
        grayTransform(wordInstance);
    } else {
        // Apply themed colors
        const colorTransform = createColorTransform({
            colors: holiday.colors,
            duration: 400,
            stagger: 30,
            animate: true,
        });
        colorTransform(wordInstance);
    }
};

// Initialize from store on mount
onMounted(() => {
    const storeSettings = onboardingStore.data.seasonalSettings;
    seasonalEnabled.value = storeSettings.enabled;

    // Initialize exclusion state
    holidays.forEach((holiday) => {
        excludedHolidays[holiday.key] = storeSettings.excludedHolidays.includes(
            holiday.name,
        );
    });

    // Apply initial transforms after components are mounted
    nextTick(() => {
        holidays.forEach((holiday) => {
            applyHolidayTransform(holiday.key);
        });
    });
});
</script>

<style scoped>
.onboarding-decorations {
    max-width: 700px;
    margin: 0 auto;
}

.v-switch :deep(.v-selection-control__input) {
    transform: scale(1.2);
}

.holiday-card {
    max-width: 500px;
    margin: 0 auto;
}

.holiday-list {
    width: 100%;
}

.holiday-item {
    padding: 8px 0;
    border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    border-radius: 4px;
}

.holiday-item:last-child {
    border-bottom: none;
}

.holiday-text {
    display: flex;
    align-items: center;
    min-height: 40px;
}

@media (max-width: 600px) {
    .text-h5 {
        font-size: 1.25rem !important;
    }

    .d-flex.align-center {
        flex-direction: column;
        align-items: flex-start !important;
    }

    .d-flex.align-center .v-switch {
        margin-top: 16px;
        align-self: flex-end;
    }
}
</style>
