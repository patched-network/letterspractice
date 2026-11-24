<template>
    <v-container>
        <v-row justify="center">
            <v-col cols="12" sm="10" md="8" lg="6">
                <div class="pei-hero text-center mb-6">
                    <div class="pei-badge">🏝️ Hello, Island family!</div>
                    <h1 class="text-h3 font-weight-bold mt-4 mb-2">
                        Free forever for PEI families.
                    </h1>
                    <p class="text-h6 text-medium-emphasis">
                        LettersPractice is made here on the Island. If you
                        live in PEI, your family gets full access — no cost,
                        no catch, no expiry.
                    </p>
                </div>

                <p class="text-body-1 mb-4">
                    Thank you for picking up a card from one of our posters.
                    This is an early-literacy app for ages 2–5, designed for
                    short daily practice sessions (2–5 minutes), with light
                    parent supervision. Animated letter characters guide your
                    child through the building blocks of reading.
                </p>

                <p class="text-body-1 mb-4">
                    The product is still young and you're early — expect
                    rough edges, and please tell me what you find. Feedback
                    by email to
                    <a href="mailto:colin@letterspractice.com"
                        >colin@letterspractice.com</a
                    >
                    is read by an actual person (me).
                </p>

                <p class="text-body-1 mb-4">
                    Create an account below to get started. The PEI offer
                    applies automatically — no code needed during the initial
                    rollout.
                </p>
            </v-col>
        </v-row>
    </v-container>
    <SignUpView />
</template>

<script setup lang="ts">
import SignUpView from "./SignUpView.vue";
</script>

<style scoped>
.pei-hero {
    padding: 24px 0 8px;
}

.pei-badge {
    display: inline-block;
    background: rgb(var(--v-theme-primary));
    color: #fff;
    font-weight: 700;
    padding: 6px 18px;
    border-radius: 999px;
    font-size: 14pt;
    letter-spacing: 0.02em;
}
</style>
