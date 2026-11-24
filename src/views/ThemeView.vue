<template>
    <v-container>
        <v-row>
            <v-col cols="12">
                <h1 class="text-h3 mb-6">
                    Theme Demo - LettersPractice Educational Theme
                </h1>
                <p class="text-body-1 mb-8">
                    This page showcases all the Vuetify 3 theme elements
                    configured in skuilder.config.json
                </p>
            </v-col>
        </v-row>

        <!-- Color Palette -->
        <v-row>
            <v-col cols="12">
                <h2 class="text-h4 mb-4">Color Palette</h2>
                <v-row>
                    <v-col
                        cols="6"
                        md="3"
                        v-for="color in colorPalette"
                        :key="color.name"
                    >
                        <v-card :color="color.name" class="pa-4 mb-2">
                            <div class="text-white font-weight-bold">
                                {{ color.label }}
                            </div>
                            <div class="text-caption opacity-75">
                                {{ color.name }}
                            </div>
                        </v-card>
                    </v-col>
                </v-row>
            </v-col>
        </v-row>

        <!-- Typography -->
        <v-row>
            <v-col cols="12">
                <h2 class="text-h4 mb-4">Typography</h2>
                <div class="text-h1 mb-2">Heading 1 - text-h1</div>
                <div class="text-h2 mb-2">Heading 2 - text-h2</div>
                <div class="text-h3 mb-2">Heading 3 - text-h3</div>
                <div class="text-h4 mb-2">Heading 4 - text-h4</div>
                <div class="text-h5 mb-2">Heading 5 - text-h5</div>
                <div class="text-h6 mb-2">Heading 6 - text-h6</div>
                <div class="text-subtitle-1 mb-2">
                    Subtitle 1 - text-subtitle-1
                </div>
                <div class="text-subtitle-2 mb-2">
                    Subtitle 2 - text-subtitle-2
                </div>
                <div class="text-body-1 mb-2">Body 1 - text-body-1</div>
                <div class="text-body-2 mb-2">Body 2 - text-body-2</div>
                <div class="text-caption mb-2">Caption - text-caption</div>
                <div class="text-overline mb-2">OVERLINE - text-overline</div>
            </v-col>
        </v-row>

        <!-- Buttons -->
        <v-row>
            <v-col cols="12">
                <h2 class="text-h4 mb-4">Buttons</h2>
                <div class="d-flex flex-wrap ga-2 mb-4">
                    <v-btn color="primary">Primary Button</v-btn>
                    <v-btn color="secondary">Secondary Button</v-btn>
                    <v-btn color="accent">Accent Button</v-btn>
                    <v-btn color="success">Success Button</v-btn>
                    <v-btn color="warning">Warning Button</v-btn>
                    <v-btn color="error">Error Button</v-btn>
                    <v-btn color="info">Info Button</v-btn>
                </div>
                <div class="d-flex flex-wrap ga-2 mb-4">
                    <v-btn color="primary" variant="outlined"
                        >Primary Outlined</v-btn
                    >
                    <v-btn color="secondary" variant="outlined"
                        >Secondary Outlined</v-btn
                    >
                    <v-btn color="accent" variant="outlined"
                        >Accent Outlined</v-btn
                    >
                </div>
                <div class="d-flex flex-wrap ga-2">
                    <v-btn color="primary" variant="text">Primary Text</v-btn>
                    <v-btn color="secondary" variant="text"
                        >Secondary Text</v-btn
                    >
                    <v-btn color="accent" variant="text">Accent Text</v-btn>
                </div>
            </v-col>
        </v-row>

        <!-- Cards -->
        <v-row>
            <v-col cols="12">
                <h2 class="text-h4 mb-4">Cards</h2>
                <v-row>
                    <v-col cols="12" md="4">
                        <v-card color="surface" class="mb-4">
                            <v-card-title>Surface Card</v-card-title>
                            <v-card-text
                                >This card uses the surface color from the
                                theme.</v-card-text
                            >
                            <v-card-actions>
                                <v-btn color="primary">Action</v-btn>
                            </v-card-actions>
                        </v-card>
                    </v-col>
                    <v-col cols="12" md="4">
                        <v-card color="surface-variant" class="mb-4">
                            <v-card-title>Surface Variant Card</v-card-title>
                            <v-card-text
                                >This card uses the surface-variant
                                color.</v-card-text
                            >
                            <v-card-actions>
                                <v-btn color="secondary">Action</v-btn>
                            </v-card-actions>
                        </v-card>
                    </v-col>
                    <v-col cols="12" md="4">
                        <v-card color="primary" class="mb-4">
                            <v-card-title class="text-on-primary"
                                >Primary Card</v-card-title
                            >
                            <v-card-text class="text-on-primary"
                                >This card uses the primary color with
                                on-primary text.</v-card-text
                            >
                            <v-card-actions>
                                <v-btn color="accent">Action</v-btn>
                            </v-card-actions>
                        </v-card>
                    </v-col>
                </v-row>
            </v-col>
        </v-row>

        <!-- Alerts -->
        <v-row>
            <v-col cols="12">
                <h2 class="text-h4 mb-4">Alerts</h2>
                <v-alert type="success" class="mb-2"
                    >Success Alert - color="success"</v-alert
                >
                <v-alert type="info" class="mb-2"
                    >Info Alert - color="info"</v-alert
                >
                <v-alert type="warning" class="mb-2"
                    >Warning Alert - color="warning"</v-alert
                >
                <v-alert type="error" class="mb-2"
                    >Error Alert - color="error"</v-alert
                >
            </v-col>
        </v-row>

        <!-- Form Elements -->
        <v-row>
            <v-col cols="12">
                <h2 class="text-h4 mb-4">Form Elements</h2>
                <v-row>
                    <v-col cols="12" md="6">
                        <v-text-field
                            label="Primary Text Field"
                            color="primary"
                            variant="outlined"
                            class="mb-4"
                        />
                        <v-text-field
                            label="Secondary Text Field"
                            color="secondary"
                            variant="filled"
                            class="mb-4"
                        />
                        <v-textarea
                            label="Textarea"
                            color="accent"
                            variant="outlined"
                            rows="3"
                            class="mb-4"
                        />
                    </v-col>
                    <v-col cols="12" md="6">
                        <v-select
                            :items="['Option 1', 'Option 2', 'Option 3']"
                            label="Select"
                            color="primary"
                            variant="outlined"
                            class="mb-4"
                        />
                        <v-checkbox
                            label="Primary Checkbox"
                            color="primary"
                            class="mb-2"
                        />
                        <v-checkbox
                            label="Secondary Checkbox"
                            color="secondary"
                            class="mb-2"
                        />
                        <v-switch
                            label="Accent Switch"
                            color="accent"
                            class="mb-2"
                        />
                    </v-col>
                </v-row>
            </v-col>
        </v-row>

        <!-- Progress & Loading -->
        <v-row>
            <v-col cols="12">
                <h2 class="text-h4 mb-4">Progress & Loading</h2>
                <div class="mb-4">
                    <div class="text-body-2 mb-2">Linear Progress</div>
                    <v-progress-linear
                        color="primary"
                        :model-value="75"
                        class="mb-2"
                    />
                    <v-progress-linear
                        color="secondary"
                        :model-value="50"
                        class="mb-2"
                    />
                    <v-progress-linear color="accent" :model-value="25" />
                </div>
                <div>
                    <div class="text-body-2 mb-2">Circular Progress</div>
                    <div class="d-flex ga-4">
                        <v-progress-circular
                            color="primary"
                            :model-value="75"
                        />
                        <v-progress-circular
                            color="secondary"
                            :model-value="50"
                        />
                        <v-progress-circular color="accent" :model-value="25" />
                    </div>
                </div>
            </v-col>
        </v-row>

        <!-- Navigation -->
        <v-row>
            <v-col cols="12">
                <h2 class="text-h4 mb-4">Navigation</h2>
                <v-tabs color="primary" class="mb-4">
                    <v-tab>Tab 1</v-tab>
                    <v-tab>Tab 2</v-tab>
                    <v-tab>Tab 3</v-tab>
                </v-tabs>
                <v-breadcrumbs :items="breadcrumbItems" class="mb-4">
                    <template v-slot:divider>
                        <v-icon>mdi-chevron-right</v-icon>
                    </template>
                </v-breadcrumbs>
            </v-col>
        </v-row>

        <!-- Chips -->
        <v-row>
            <v-col cols="12">
                <h2 class="text-h4 mb-4">Chips</h2>
                <div class="d-flex flex-wrap ga-2">
                    <v-chip color="primary">Primary Chip</v-chip>
                    <v-chip color="secondary">Secondary Chip</v-chip>
                    <v-chip color="accent">Accent Chip</v-chip>
                    <v-chip color="success">Success Chip</v-chip>
                    <v-chip color="warning">Warning Chip</v-chip>
                    <v-chip color="error">Error Chip</v-chip>
                    <v-chip color="info">Info Chip</v-chip>
                </div>
            </v-col>
        </v-row>

        <!-- Background Colors -->
        <v-row>
            <v-col cols="12">
                <h2 class="text-h4 mb-4">Background Colors</h2>
                <v-row>
                    <v-col cols="12" md="6">
                        <div class="bg-background pa-4 mb-2 border">
                            <div class="text-on-background">
                                Background - bg-background / text-on-background
                            </div>
                        </div>
                        <div class="bg-surface pa-4 mb-2 border">
                            <div class="text-on-surface">
                                Surface - bg-surface / text-on-surface
                            </div>
                        </div>
                        <div class="bg-surface-variant pa-4 mb-2 border">
                            <div class="text-on-surface-variant">
                                Surface Variant - bg-surface-variant /
                                text-on-surface-variant
                            </div>
                        </div>
                    </v-col>
                    <v-col cols="12" md="6">
                        <div class="bg-surface-bright pa-4 mb-2 border">
                            <div class="text-on-surface">
                                Surface Bright - bg-surface-bright
                            </div>
                        </div>
                        <div class="bg-surface-light pa-4 mb-2 border">
                            <div class="text-on-surface">
                                Surface Light - bg-surface-light
                            </div>
                        </div>
                    </v-col>
                </v-row>
            </v-col>
        </v-row>

        <!-- Theme Toggle -->
        <v-row>
            <v-col cols="12">
                <h2 class="text-h4 mb-4">Theme Controls</h2>
                <v-btn @click="toggleTheme" color="primary" class="mb-4">
                    Switch to
                    {{
                        $vuetify.theme.global.name === "light"
                            ? "Dark"
                            : "Light"
                    }}
                    Theme
                </v-btn>
                <div class="text-body-2">
                    Current theme: {{ $vuetify.theme.global.name }}
                </div>
            </v-col>
        </v-row>
    </v-container>
</template>

<script setup lang="ts">
import { useTheme } from "vuetify";

const theme = useTheme();

const colorPalette = [
    { name: "primary", label: "Primary" },
    { name: "secondary", label: "Secondary" },
    { name: "accent", label: "Accent" },
    { name: "success", label: "Success" },
    { name: "warning", label: "Warning" },
    { name: "error", label: "Error" },
    { name: "info", label: "Info" },
    { name: "surface", label: "Surface" },
];

const breadcrumbItems = [
    { title: "Home", disabled: false },
    { title: "Theme", disabled: false },
    { title: "Demo", disabled: true },
];

function toggleTheme() {
    if (theme.global.current.value.dark) {
        theme.change("light");
    } else {
        theme.change("dark");
    }
}
</script>
