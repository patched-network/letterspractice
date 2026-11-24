<template>
    <v-container>
        <v-row>
            <v-col cols="12">
                <h1 class="text-h3 mb-4">Animation Examples</h1>
                <p class="text-body-1 mb-6">
                    Choreographed sequences using anime.js Timeline directly
                </p>
            </v-col>
        </v-row>

        <!-- Example 1: Hello World Greeting -->
        <v-row>
            <v-col cols="12">
                <v-card>
                    <v-card-title>Greeting Animation</v-card-title>
                    <v-card-text>
                        <div class="animation-container mb-4">
                            <WordDisplay
                                ref="helloWorldRef"
                                text="Hello World"
                                :height="150"
                                :options="wordOptions"
                                @word-created="onHelloWorldCreated"
                            />
                        </div>
                        <v-btn
                            color="primary"
                            @click="playGreetingAnimation"
                            :disabled="!helloWorldInstance"
                        >
                            Play Greeting
                        </v-btn>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>

        <!-- Example 2: Separate Component -->
        <v-row>
            <v-col cols="12">
                <AnimationTwo />
            </v-col>
        </v-row>
        <!-- Example 2: Separate Component -->
        <v-row>
            <v-col cols="12">
                <AnimationThree />
            </v-col>
        </v-row>

        <!-- Example 4: Jump Animation -->
        <v-row>
            <v-col cols="12">
                <AnimationJump />
            </v-col>
        </v-row>

        <!-- Example 5: Walk Animation -->
        <v-row>
            <v-col cols="12">
                <AnimationWalk />
            </v-col>
        </v-row>
    </v-container>
</template>

<script setup lang="ts">
import { ref, shallowRef } from "vue";
import WordDisplay from "../letterpeople/vue/WordDisplay.vue";
import { Word, WordOptions } from "../letterpeople/Word";
import type { LetterInstance } from "../letterpeople/types";
import { createTimeline } from "animejs";
import AnimationTwo from "./animations/AnimationTwo.vue";
import AnimationThree from "./animations/AnimationThree.vue";
import AnimationJump from "./animations/AnimationJump.vue";
import AnimationWalk from "./animations/AnimationWalk.vue";

// Word display options
const wordOptions: WordOptions = {
    spacing: 10,
    letterOptions: {
        color: "#FF6B6B",
        lineWidth: 22,
        borderWidth: 4,
        showEyes: false,
        showMouth: false,
        showArms: false,
    },
};

// Refs
const helloWorldRef = ref<InstanceType<typeof WordDisplay> | null>(null);
const helloWorldInstance = shallowRef<Word | null>(null);

// Capture Word instance when created
const onHelloWorldCreated = (word: Word) => {
    helloWorldInstance.value = word;
    console.log("[AnimationsDebug] Hello World instance created:", word);
};

// Animation function using LetterPeople API
const playGreetingAnimation = async () => {
    if (!helloWorldInstance.value) {
        console.warn("[AnimationsDebug] No word instance available");
        return;
    }

    // After null check, TypeScript knows helloWorldInstance.value is Word
    const word = helloWorldInstance.value;

    console.log("[AnimationsDebug] Playing greeting animation");

    // Strategy: Use Timeline.call() to orchestrate LetterPeople API methods
    // Timeline drives timing, LetterPeople methods handle animations
    const tl = createTimeline();

    let currentTime = 0;

    // Show eyes and mouth for each letter sequentially
    for (let i = 0; i < word.length; i++) {
        const letter = word.getLetter(i);
        if (letter) {
            // Call LetterPeople API methods at specific times
            tl.call(async () => {
                // await letter.eyes.show({ duration: 300 });

                await letter.eyes.left.show({ duration: 100 });
                await letter.eyes.right.show({ duration: 200 });
                await letter.mouth.show({ duration: 300 });
            }, currentTime);

            // Advance time: 300ms for animation + 200ms stagger
            currentTime += 500;
        }
    }

    // Pause before arms (300ms)
    currentTime += 300;

    // Show all arms in parallel
    tl.call(() => {
        word.letters.forEach((letter) => {
            letter.mouth
                .updateShape(
                    {
                        mood: 0,
                        openness: 0.15,
                    },
                    {
                        duration: 500,
                    },
                )
                .then(() =>
                    letter.mouth.animateSpeak({
                        loop: 5,
                    }),
                );
            letter.arms.show({ duration: 300 });
        });
    }, currentTime);

    // Advance time for arms animation
    currentTime += 300;

    // Pause before wave (200ms)
    currentTime += 200;

    // Wave all arms in parallel
    tl.call(() => {
        word.letters.forEach((letter) => {
            letter.arms.wave({ duration: 600 });
        });
    }, currentTime);

    tl.play();
    console.log("[AnimationsDebug] Greeting animation complete");
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
