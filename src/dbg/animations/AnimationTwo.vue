<template>
    <v-card>
        <v-card-title>Animation Example 2</v-card-title>
        <v-card-text>
            <div class="animation-container mb-4">
                <WordDisplay
                    ref="wordRef"
                    text="Hi!"
                    :height="150"
                    :options="wordOptions"
                    @word-created="onWordCreated"
                />
            </div>
            <v-btn
                color="primary"
                @click="playAnimation"
                :disabled="!wordInstance"
            >
                Play Animation
            </v-btn>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
import { ref, shallowRef } from "vue";
import WordDisplay from "../../letterpeople/vue/WordDisplay.vue";
import { Word, WordOptions } from "../../letterpeople/Word";
import { createTimeline, animate } from "animejs";

// Word display options
const wordOptions: WordOptions = {
    spacing: 10,
    letterOptions: {
        color: "#4CAF50",
        lineWidth: 22,
        borderWidth: 4,
        showEyes: false,
        showMouth: false,
        showArms: false,
    },
};

// Refs
const wordRef = ref<InstanceType<typeof WordDisplay> | null>(null);
const wordInstance = shallowRef<Word | null>(null);

// Capture Word instance when created
const onWordCreated = (word: Word) => {
    wordInstance.value = word;
    console.log("[AnimationTwo] Word instance created:", word);
};

// Animation function
const playAnimation = async () => {
    if (!wordInstance.value) {
        console.warn("[AnimationTwo] No word instance available");
        return;
    }

    const word = wordInstance.value;
    console.log("[AnimationTwo] Playing animation");

    const H = word.getLetter(0)!;
    const I = word.getLetter(1)!;
    const exclamation = word.getLetter(2)!;

    const tl = createTimeline();
    let currentTime = 0;

    // Wait 2 seconds
    currentTime += 2000;

    // H opens eyes
    tl.call(async () => {
        await H.eyes.show({ duration: 300 });
    }, currentTime);

    currentTime += 400;

    // Eyes dart to the left (H's left = our right) - look at I
    tl.call(async () => {
        await H.eyes.lookAt(I.getCenter(), { duration: 200 });
    }, currentTime);

    currentTime += 300;

    // H turns body to look at I
    tl.call(async () => {
        await H.body.lookAt(I.getCenter(), { duration: 500, ease: "outQuad" });
    }, currentTime);

    currentTime += 500;

    // H opens mouth, speaks, shows arms and waves
    tl.call(async () => {
        await H.mouth.show({ duration: 300 });
        await H.mouth.updateShape(
            { mood: 0.7, openness: 0.2 },
            { duration: 200 },
        );
        await H.mouth.animateSpeak({ duration: 150, loop: 3 });
        await H.arms.show({ duration: 300 });
        H.arms.wave({ duration: 600, count: 2 });
    }, currentTime);

    currentTime += 2000; // Give time for H's wave

    // Some delay before I responds
    currentTime += 500;

    // I opens eyes, mouth, and waves back
    tl.call(async () => {
        await I.eyes.show({ duration: 300 });
        I.body.lookAt(H, { duration: 200 });

        await I.mouth.show({ duration: 300 });
        I.mouth.updateShape({ mood: 0.8, openness: 0.15 }, { duration: 200 });
        await I.arms.show({ duration: 300 });

        await I.arms.wave({ duration: 600, count: 2 });

        await I.body.resetPose({ duration: 300 });
        await H.body.resetPose({ duration: 300 });
        I.arms.relax({ duration: 300 });
        H.arms.relax({ duration: 300 });
    }, currentTime);

    tl.play();
    console.log("[AnimationTwo] Animation started");
};
</script>

<style scoped>
.animation-container {
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f5f5f5;
    border-radius: 8px;
    padding: 2rem;
}
</style>
