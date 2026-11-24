<template>
    <div class="word-display-area">
        The window is: {{ computedHeight }}

        <div ref="wordContainer" class="word-container">
            <!-- Hard-coded word will be rendered here -->
        </div>

        <button @click="playRippleAnimation" :disabled="!word">
            Play Ripple Animation
        </button>

        <button @click="playSpeakSequence" :disabled="!word">
            Play Speaking Sequence
        </button>

        <button @click="testUpdateAppearance" :disabled="!word">
            Test updateAppearance (Change Color)
        </button>

        <button @click="testAnimatedAppearance" :disabled="!word">
            Test Animated updateAppearance
        </button>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, shallowRef } from "vue";
import { Word } from "../letterpeople";
import type { LetterInstance } from "../letterpeople/types";
import { animate, stagger } from "animejs";

// Reactive data
const selectedIndex = ref(0);
const word = shallowRef<Word | null>(null);
const wordContainer = ref<HTMLElement | null>(null);
const debugOutput = ref<HTMLElement | null>(null);
const computedHeight = ref("");

// Debug logging helper
const log = (message: string) => {
    console.log(message);
    if (debugOutput.value) {
        const p = document.createElement("p");
        p.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
        debugOutput.value.appendChild(p);
        debugOutput.value.scrollTop = debugOutput.value.scrollHeight;
    }
};

// Initialize hard-coded word
const initializeWord = () => {
    if (!wordContainer.value) return;

    try {
        // Hard-coded word for API testing
        word.value = new Word("HELLO", wordContainer.value, {
            spacing: 15,
            letterOptions: {
                color: "#fdabf7",
                borderColor: "#093152",
                lineWidth: 20,
                eyeSize: 6,
                armColor: "#1971c2",
            },
        });

        log(
            `Word created: "${word.value.text}" with ${word.value.length} letters`,
        );
        log(`Characters: [${word.value.characters.join(", ")}]`);
    } catch (error) {
        log(`Error creating word: ${error}`);
    }
};

// Ripple animation function
const playRippleAnimation = async () => {
    if (!word.value) return;

    log("Starting ripple animation...");

    // Get all letter SVG elements
    const letterSvgs: SVGElement[] = [];
    for (let i = 0; i < word.value.length; i++) {
        const letter = word.value.getLetter(i);
        if (letter?.svgElement) {
            letterSvgs.push(letter.svgElement);
            log(
                `Found letter ${i}: ${letter.character}, SVG: ${letter.svgElement.tagName}`,
            );
        }
    }

    if (letterSvgs.length === 0) {
        log("No letter SVGs found for animation");
        return;
    }

    // Debug: Log current transform of first letter
    const firstSvg = letterSvgs[0];
    const currentTransform = window.getComputedStyle(firstSvg).transform;
    log(`First letter current transform: ${currentTransform}`);

    try {
        // Smooth ripple: clean jump up and gentle return
        const animation = animate(letterSvgs, {
            y: [
                { to: -400, ease: "outExpo", duration: 600 }, // Jump up
                { to: 0, ease: "outBounce", duration: 800, delay: 100 }, // Bounce back
            ],
            rotate: {
                from: "-2turn", // Full rotation from -360deg
                delay: 0,
            },
            delay: stagger(50), // 50ms between each letter
            ease: "inOutCirc",
            loopDelay: 1000,
            loop: 2,
            onBegin: () => log("Animation started"),
            onComplete: () => log("Animation completed"),
        });

        log(`Animation object created: ${animation}`);
    } catch (error) {
        log(`Animation error: ${error}`);
    }

    log(`Ripple animation started on ${letterSvgs.length} letters`);
};

// Speaking sequence using simple timeout-based stagger (avoiding anime.js conflicts)
const playSpeakSequence = async () => {
    if (!word.value) return;

    log("Starting speaking sequence...");

    try {
        // Simple sequential triggering without anime.js interference
        for (let i = 0; i < word.value.length; i++) {
            setTimeout(() => {
                const letter = word.value?.getLetter(i);
                if (letter?.mouth?.animateSpeak) {
                    log(
                        `Triggering speak for letter ${i}: ${letter.character}`,
                    );
                    letter.mouth
                        .animateSpeak()
                        .then(() => {
                            log(
                                `Letter ${i} (${letter.character}) finished speaking`,
                            );
                        })
                        .catch((error) => {
                            log(`Letter ${i} speak error: ${error}`);
                        });
                } else {
                    log(`Letter ${i} has no speak method available`);
                }
            }, i * 200); // 200ms delay between each letter
        }

        log(`Speaking sequence scheduled for ${word.value.length} letters`);
    } catch (error) {
        log(`Speaking sequence error: ${error}`);
    }
};

// Test updateAppearance functionality
const testUpdateAppearance = async () => {
    if (!word.value) return;

    log("Testing updateAppearance() method...");

    try {
        // Test first letter: change color to red
        const firstLetter = word.value.getLetter(0);
        if (firstLetter) {
            log(`Before: Testing on letter '${firstLetter.character}'`);

            // Log current paths found by selector
            const paths =
                firstLetter.svgElement.querySelectorAll("path.letter-path");
            log(`Found ${paths.length} letter-path elements`);

            // Also check what the old selector would have found
            const allPaths = firstLetter.svgElement.querySelectorAll(
                "path[fill], path[stroke]",
            );
            log(`Old selector would have found ${allPaths.length} elements`);

            const r = Math.floor(Math.random() * 256);
            const g = Math.floor(Math.random() * 256);
            const b = Math.floor(Math.random() * 256);
            await firstLetter.updateAppearance({
                color: `rgb(${r}, ${g}, ${b})`,
            });

            log("Successfully changed first letter color");

            // Test another letter: change border
            if (word.value.length > 1) {
                const secondLetter = word.value.getLetter(1);
                if (secondLetter) {
                    await secondLetter.updateAppearance({
                        borderColor: "blue",
                        borderWidth: 4,
                    });
                    log(
                        "Successfully changed second letter border to blue/4px",
                    );
                }
            }
        }
    } catch (error) {
        log(`updateAppearance test error: ${error}`);
    }
};

// Test animated updateAppearance functionality
const testAnimatedAppearance = async () => {
    if (!word.value) return;

    log("Testing animated updateAppearance() method...");

    try {
        // Animate each letter with different colors and timings
        const promises: Promise<void>[] = [];

        for (let i = 0; i < word.value.length; i++) {
            const letter = word.value.getLetter(i);
            if (letter) {
                const r = Math.floor(Math.random() * 256);
                const g = Math.floor(Math.random() * 256);
                const b = Math.floor(Math.random() * 256);

                log(
                    `Animating letter ${i} (${letter.character}) to rgb(${r}, ${g}, ${b})`,
                );

                // Each letter gets animated with custom parameters
                const promise = letter.updateAppearance(
                    {
                        color: `rgb(${r}, ${g}, ${b})`,
                        borderWidth: Math.floor(Math.random() * 5) + 2,
                    },
                    {
                        duration: 500 + i * 2000, // Stagger duration
                        ease: "outBounce",
                        delay: i * 200, // Stagger delay
                        complete: () => {
                            log(`Letter ${i} animation completed`);
                        },
                    },
                );

                promises.push(promise);
            }
        }

        // Wait for all animations to complete
        await Promise.all(promises);
        log("All animated appearances completed!");

        // Follow up with a synchronized color reset
        // setTimeout(async () => {
        //     log("Resetting all colors with synchronized animation...");
        //     const resetPromises: Promise<void>[] = [];

        //     for (let i = 0; i < word.value!.length; i++) {
        //         const letter = word.value!.getLetter(i);
        //         if (letter) {
        //             resetPromises.push(
        //                 letter.updateAppearance(
        //                     { color: "currentColor", borderWidth: 2 },
        //                     { duration: 300, ease: "outQuad" },
        //                 ),
        //             );
        //         }
        //     }

        //     await Promise.all(resetPromises);
        //     log("Reset animation completed!");
        // }, 1000);
    } catch (error) {
        log(`Animated updateAppearance test error: ${error}`);
    }
};

// Lifecycle
onMounted(() => {
    log("Word API Playground initialized");

    // Skip anime.js config to avoid conflicts with letter internal animations
    // import("animejs").then(({ engine }) => {
    //     engine.timeUnit = "s";
    //     log("Anime.js configured for seconds");
    // });

    initializeWord();
    computedHeight.value = window.getComputedStyle(wordContainer.value!).height;
});
</script>

<style scoped>
.word-display-area {
    flex-grow: 1;
    border: 2px dashed #4dabf7;
    border-radius: 8px;
    padding: 40px;
    background: #f8f9ff;
    overflow: auto;
}
.word-container {
    height: 400px;
    background-color: lightcyan;
    border-style: dashed;
}

.word-container {
    min-height: 120px;
    display: flex;
    align-items: flex-start; /* Allow Y movement */
    justify-content: center;
    padding-top: 100px; /* Space for upward movement */
}

/* Ensure letter containers work with the new Word implementation */
.word-container :deep(.letterpeople-word) {
    display: flex;
    align-items: flex-start; /* Allow Y movement */
    gap: inherit;
}

.word-container :deep(.letterpeople-letter-wrapper) {
    position: relative;
    display: flex;
    align-items: flex-start; /* Allow Y movement */
    min-height: 80px;
}

button {
    display: block;
    margin-top: 20px;

    margin: 15px;
    padding: 10px 20px;
    background-color: #4dabf7;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
}

button:hover:not(:disabled) {
    background-color: #339af0;
}
</style>
