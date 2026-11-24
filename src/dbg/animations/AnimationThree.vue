<template>
    <v-card>
        <v-card-title>Animation Example 2</v-card-title>
        <v-card-text>
            <div class="animation-container mb-4">
                <WordDisplay
                    ref="wordRef"
                    text="J   j"
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
import { animateJuggling, type JugglingController } from "../../letterpeople/transforms/juggling";

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

const activeJugglingControllers: JugglingController[] = [];

// Animation function
const playAnimation = async () => {
    if (!wordInstance.value) {
        console.warn("[AnimationTwo] No word instance available");
        return;
    }

    const word = wordInstance.value;
    console.log("[AnimationTwo] Playing animation");

    const J = word.getLetter(0)!;
    const j = word.getLetter(1)!;

    const tl = createTimeline();
    let currentTime = 0;

    // J opens eyes
    tl.call(async () => {
        await J.eyes.show({ duration: 300 });
    }, currentTime);

    currentTime += 400;

    // Eyes dart to the left
    tl.call(async () => {
        const controller = await animateJuggling(J, "3", { loop: true });
        activeJugglingControllers.push(controller);
    }, currentTime);

    currentTime += 500;

    // H opens mouth, speaks, shows arms and waves
    tl.call(async () => {
        await J.mouth.show({ duration: 300 });
        await J.mouth.updateShape(
            { mood: 0.7, openness: 0.2 },
            { duration: 200 },
        );
        await J.mouth.animateSpeak({ duration: 150, loop: 3 });
        // await J.arms.show({ duration: 300 });
        await J.arms.left.rotateTo(325, { duration: 150 });
        // J.arms.wave({ duration: 600, count: 2 });
    }, currentTime);

    currentTime += 2000; // Give time for H's wave

    // Some delay before I responds
    currentTime += 300;

    // I opens eyes, mouth, and waves back
    tl.call(async () => {
        await j.eyes.show({ duration: 300 });
        j.body.lookAt(J, { duration: 200 });

        await j.mouth.show({ duration: 300 });
        j.mouth.updateShape({ mood: 0.8, openness: 0.15 }, { duration: 200 });
        await j.arms.show({ duration: 300 });

        await j.arms.wave({ duration: 600, count: 2 });

        // await j.body.resetPose({ duration: 300 });
        // await J.body.resetPose({ duration: 300 });
        j.arms.relax({ duration: 300 });
        // J.arms.relax({ duration: 300 });
        const jController = await animateJuggling(J, "3", {
            loop: true,
        });
        activeJugglingControllers.push(jController);
        await J.body.turnTo(40, { duration: 400 });

        for (let i = 0; i < 3; i++) {
            await J.mouth.animateSpeak();
        }
        const littleJController = await animateJuggling(j, "4", { loop: true, beatDuration: 200 });
        activeJugglingControllers.push(littleJController);
        // await J.body.turnTo(-30, { duraction: 800 });
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
