<template>
    <div class="word-display-test">
        <h2>WordDisplay Component Testing</h2>

        <!-- Basic Usage Test -->
        <section class="test-section">
            <h3>1. Basic Static Display (Clean Text Mode)</h3>
            <WordDisplay text="LETTERS PRACTICE" />
            <p>
                <em>Default mode: Clean text without eyes, mouth, or arms</em>
            </p>
        </section>

        <!-- Character Mode Test -->
        <section class="test-section">
            <h3>1b. Character Mode (With Personality)</h3>
            <WordDisplay
                text="WORLDA"
                :options="{
                    letterOptions: {
                        showEyes: true,
                        showMouth: true,
                        showArms: true,
                    },
                }"
            />
            <p><em>Character mode: Letters with eyes, mouth, and arms</em></p>
        </section>

        <!-- Custom Styling Test -->
        <section class="test-section">
            <h3>2. Custom Styling (Clean Text)</h3>
            <WordDisplay
                text="COLOR"
                :options="{ spacing: 15 }"
                :letter-options="{
                    0: { color: 'red', borderWidth: 3 },
                    1: { color: 'orange', borderWidth: 2 },
                    2: { color: 'blue', borderColor: 'purple', borderWidth: 4 },
                    3: { color: 'green', borderColor: 'darkgreen' },
                    4: { color: 'purple', borderWidth: 1 },
                }"
            />
            <p><em>Colorful text styling without character attachments</em></p>
        </section>

        <!-- Mixed Attachment Modes -->
        <section class="test-section">
            <h3>2b. Mixed Attachment Modes</h3>
            <div
                style="
                    display: flex;
                    gap: 20px;
                    align-items: flex-start;
                    flex-wrap: wrap;
                "
            >
                <div>
                    <h4>Eyes Only</h4>
                    <WordDisplay
                        text="LOOK"
                        :options="{ letterOptions: { showEyes: true } }"
                        :height="80"
                    />
                </div>
                <div>
                    <h4>Mouth Only</h4>
                    <WordDisplay
                        text="TALK"
                        :options="{ letterOptions: { showMouth: true } }"
                        :height="80"
                    />
                </div>
                <div>
                    <h4>Arms Only</h4>
                    <WordDisplay
                        text="WAVE"
                        :options="{ letterOptions: { showArms: true } }"
                        :height="80"
                    />
                </div>
            </div>
        </section>

        <!-- Reactive Text Test -->
        <section class="test-section">
            <h3>3. Reactive Text Changes</h3>
            <WordDisplay :text="dynamicText" />
            <button @click="changeText">Change Text</button>
            <p>Current text: {{ dynamicText }}</p>
        </section>

        <!-- Programmatic Animation Test -->
        <section class="test-section">
            <h3>4. Programmatic Animations</h3>
            <WordDisplay ref="animateWordRef" text="ANIMATE" />
            <div class="controls">
                <button @click="triggerStaggerAnimation">
                    Stagger Animation
                </button>
                <button @click="triggerSequenceAnimation">
                    Sequence Animation
                </button>
                <button @click="triggerAllAnimation">
                    All Letters Animation
                </button>
                <button @click="resetColors">Reset Colors</button>
            </div>
        </section>

        <!-- Event Handling Test -->
        <section class="test-section">
            <h3>5. Event Handling</h3>
            <WordDisplay
                text="EVENTS"
                @word-created="handleWordCreated"
                @word-destroyed="handleWordDestroyed"
                @letter-updated="handleLetterUpdate"
                @text-changed="handleTextChanged"
            />
            <div class="event-log">
                <h4>Event Log:</h4>
                <ul>
                    <li v-for="(event, index) in eventLog" :key="index">
                        {{ event }}
                    </li>
                </ul>
            </div>
        </section>

        <!-- Accessibility Test -->
        <section class="test-section">
            <h3>6. Accessibility</h3>
            <WordDisplay
                text="ACCESS"
                accessibility-text="Accessibility test word: ACCESS"
            />
            <br /><br />
            <WordDisplay
                text="HIDDEN"
                accessibility-text="This word is visually hidden but screen reader accessible"
                screen-reader-mode
            />
            <p>
                <em
                    >The second word above should be invisible but accessible to
                    screen readers</em
                >
            </p>
        </section>

        <!-- Multi-Word Layout Test -->
        <section class="test-section">
            <h3>7. Multiple Words Layout</h3>
            <div class="word-gallery">
                <WordDisplay
                    v-for="(item, index) in wordGallery"
                    :key="index"
                    :text="item.text"
                    :options="{
                        letterOptions: item.styling,
                    }"
                    :letter-options="item.styling"
                    class="gallery-word"
                />
            </div>
        </section>

        <!-- Debug Information -->
        <section class="test-section">
            <h3>8. Debug Information</h3>
            <pre>{{ debugInfo }}</pre>
        </section>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, shallowRef } from "vue";
import { WordDisplay } from "../letterpeople/vue";
import type { WordDisplayRef } from "../letterpeople/vue/types";
// import type { LetterInstance } from '../letterpeople/types';
import type { Word } from "../letterpeople/Word";

// Template refs
const animateWordRef = ref<WordDisplayRef | null>(null);

// Reactive data
const dynamicText = ref("START");
const eventLog = ref<string[]>([]);

// Gallery data - demonstrating different modes
const wordGallery = reactive([
    {
        text: "TEXT",
        styling: {
            // Clean text mode - no attachments
            0: { color: "#ff4757" },
            1: { color: "#ff6b7a" },
            2: { color: "#ff8a9b" },
            3: { color: "#ffa6bb" },
        },
    },
    {
        text: "EYES",
        styling: {
            // Eyes only mode
            showEyes: true,
            0: { color: "#3742fa", borderWidth: 3 },
            1: { color: "#5352ed", borderWidth: 4 },
            2: { color: "#70a1ff", borderWidth: 5 },
            3: { color: "#7bed9f", borderWidth: 6 },
        },
    },
    {
        text: "FULL",
        styling: {
            // Full character mode
            showEyes: true,
            showMouth: true,
            showArms: true,
            0: { color: "#ffa502", borderColor: "#ff6348" },
            1: { color: "#ffb142", borderColor: "#ff7675" },
            2: { color: "#ffd32a", borderColor: "#fd79a8" },
            3: { color: "#fffa65", borderColor: "#e17055" },
        },
    },
]);

// Debug info
const debugInfo = reactive({
    componentsLoaded: false,
    lastEvent: {},
    animateWordInstance: {},
    testResults: [],
});

// Methods
const changeText = () => {
    const words = ["START", "CHANGE", "REACT", "WORKS", "GREAT"];
    const currentIndex = words.indexOf(dynamicText.value);
    const nextIndex = (currentIndex + 1) % words.length;
    dynamicText.value = words[nextIndex];
};

const triggerStaggerAnimation = async () => {
    if (!animateWordRef.value) return;

    try {
        await animateWordRef.value.animateStagger(
            {
                color: `hsl(${Math.random() * 360}, 70%, 50%)`,
                borderWidth: Math.floor(Math.random() * 4) + 2,
            },
            { duration: 600, ease: "outBounce" },
            150, // stagger delay
        );
        addToEventLog("Stagger animation completed");
    } catch (error) {
        addToEventLog(`Stagger animation error: ${error}`);
    }
};

const triggerSequenceAnimation = async () => {
    if (!animateWordRef.value) return;

    try {
        await animateWordRef.value.animateSequence([
            {
                index: 0,
                options: { color: "red" },
                animationParams: { duration: 300, ease: "outQuad" },
            },
            {
                index: 2,
                options: { color: "green", borderWidth: 5 },
                animationParams: { duration: 400, ease: "outBack", delay: 200 },
            },
            {
                index: 4,
                options: { color: "blue" },
                animationParams: {
                    duration: 500,
                    ease: "outBounce",
                    delay: 400,
                },
            },
            {
                index: 6,
                options: { color: "purple", borderColor: "orange" },
                animationParams: {
                    duration: 300,
                    ease: "outElastic",
                    delay: 600,
                },
            },
        ]);
        addToEventLog("Sequence animation completed");
    } catch (error) {
        addToEventLog(`Sequence animation error: ${error}`);
    }
};

const triggerAllAnimation = async () => {
    if (!animateWordRef.value) return;

    try {
        await animateWordRef.value.updateAllLettersAppearance(
            {
                color: "#ff6b6b",
                borderColor: "#4ecdc4",
                borderWidth: 3,
            },
            { duration: 800, ease: "outElastic" },
        );
        addToEventLog("All letters animation completed");
    } catch (error) {
        addToEventLog(`All letters animation error: ${error}`);
    }
};

const resetColors = async () => {
    if (!animateWordRef.value) return;

    try {
        await animateWordRef.value.updateAllLettersAppearance(
            {
                color: "currentColor",
                borderColor: "black",
                borderWidth: 2,
            },
            { duration: 300, ease: "outQuad" },
        );
        addToEventLog("Colors reset completed");
    } catch (error) {
        addToEventLog(`Reset error: ${error}`);
    }
};

// Event handlers
const handleWordCreated = (instance: Word) => {
    addToEventLog(`Word created with ${instance.length} letters`);
    debugInfo.lastEvent = { type: "wordCreated", length: instance.length };
};

const handleWordDestroyed = () => {
    addToEventLog("Word destroyed");
    debugInfo.lastEvent = { type: "wordDestroyed" };
};

const handleLetterUpdate = ({
    index,
    options,
    completed,
}: {
    index: number;
    options: any;
    completed: boolean;
}) => {
    addToEventLog(
        `Letter ${index} updated: ${JSON.stringify(options)} - ${completed ? "success" : "failed"}`,
    );
    debugInfo.lastEvent = { type: "letterUpdated", index, options, completed };
};

const handleTextChanged = ({
    oldText,
    newText,
}: {
    oldText: string;
    newText: string;
}) => {
    addToEventLog(`Text changed: "${oldText}" → "${newText}"`);
    debugInfo.lastEvent = { type: "textChanged", oldText, newText };
};

const addToEventLog = (message: string) => {
    eventLog.value.unshift(`${new Date().toLocaleTimeString()}: ${message}`);
    if (eventLog.value.length > 10) {
        eventLog.value = eventLog.value.slice(0, 10);
    }
};

// Lifecycle
onMounted(() => {
    debugInfo.componentsLoaded = true;
    debugInfo.animateWordInstance = animateWordRef.value!;
    addToEventLog("WordDisplayTest component mounted");
});
</script>

<style scoped>
.word-display-test {
    padding: 20px;
    max-width: 1200px;
    margin: 0 auto;
}

.test-section {
    margin-bottom: 40px;
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: #f9f9f9;
}

.test-section h3 {
    margin-top: 0;
    color: #333;
    border-bottom: 2px solid #4caf50;
    padding-bottom: 8px;
}

.controls {
    margin-top: 15px;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

.controls button {
    padding: 8px 16px;
    background: #2196f3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
}

.controls button:hover {
    background: #1976d2;
}

.event-log {
    margin-top: 15px;
    padding: 15px;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 4px;
    max-height: 200px;
    overflow-y: auto;
}

.event-log ul {
    margin: 0;
    padding: 0;
    list-style: none;
}

.event-log li {
    padding: 4px 0;
    border-bottom: 1px solid #eee;
    font-family: monospace;
    font-size: 13px;
}

.word-gallery {
    display: flex;
    gap: 30px;
    flex-wrap: wrap;
    align-items: flex-start;
}

.gallery-word {
    padding: 10px;
    border: 2px dashed #ccc;
    border-radius: 8px;
    background: white;
}

pre {
    background: #f0f0f0;
    padding: 15px;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 12px;
}

/* WordDisplay component styling within this test */
.word-display-test :deep(.word-display) {
    margin: 10px 0;
    padding: 5px;
}

/* Test-specific animations */
@keyframes highlight {
    0% {
        background-color: transparent;
    }
    50% {
        background-color: #ffeb3b;
    }
    100% {
        background-color: transparent;
    }
}

.test-section:target {
    animation: highlight 2s ease-in-out;
}
</style>
