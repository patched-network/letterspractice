<template>
    <div :class="compact ? 'email-signup-compact' : 'email-signup-form'">
        <v-card
            :variant="compact ? 'flat' : variant"
            :color="compact ? 'transparent' : undefined"
            :class="compact ? 'pa-0' : 'pa-6'"
            :rounded="compact ? '0' : 'lg'"
            :elevation="compact ? 0 : undefined"
        >
            <h3 :class="['text-h6', compact ? 'mb-2' : 'mb-4']">{{ heading }}</h3>
            <p
                v-if="description"
                :class="['text-body-2', 'text-medium-emphasis', compact ? 'mb-3' : 'mb-4']"
            >
                {{ description }}
            </p>

            <v-form
                v-if="!emailSignup.success.value"
                @submit.prevent="handleEmailSubmit"
                v-model="formValid"
                class="signup-fields"
            >
                <v-text-field
                    v-model="email"
                    label="Your email"
                    type="email"
                    autocomplete="email"
                    variant="outlined"
                    :rules="emailRules"
                    required
                    density="comfortable"
                    class="signup-input"
                />
                <v-btn
                    type="submit"
                    color="primary"
                    size="large"
                    rounded="lg"
                    class="signup-submit"
                    :disabled="!formValid || emailSignup.submitting.value"
                    :loading="emailSignup.submitting.value"
                >
                    {{ submitButtonText }}
                </v-btn>
            </v-form>

            <v-alert
                v-if="emailSignup.success.value"
                type="success"
                variant="tonal"
                class="mt-4"
            >
                {{ successText }}
            </v-alert>

            <v-alert
                v-if="emailSignup.alreadySubscribed.value"
                type="info"
                variant="tonal"
                class="mt-4"
            >
                {{ alreadySubscribedText }}
            </v-alert>

            <v-alert
                v-if="emailSignup.error.value"
                type="error"
                variant="tonal"
                class="mt-4"
            >
                {{ emailSignup.error.value }}
            </v-alert>
        </v-card>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useEmailSignup } from "../../composables/useEmailSignup";

interface Props {
    heading?: string;
    description?: string;
    variant?: "outlined" | "elevated" | "tonal" | "flat" | "text" | "plain";
    /** Submit button label in its resting state. */
    submitText?: string;
    /** Confirmation shown after a successful signup. */
    successText?: string;
    /** Message shown when the email was already on the list. */
    alreadySubscribedText?: string;
    /** Un-boxed layout: drops the card chrome (elevation/padding/background)
     *  so the form sits inline in a footer column. */
    compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    heading: "Join Our Waiting List",
    description: "Be the first to know when we're ready.",
    variant: "outlined",
    submitText: "Join Waiting List",
    successText: "Thank you! We'll be in touch soon.",
    alreadySubscribedText: "You're already on the list! We'll be in touch soon.",
    compact: false,
});

// Email form state
const email = ref("");
const formValid = ref(false);

// Use email signup composable
const emailSignup = useEmailSignup({
    site: "letterspractice",
    onSuccess: () => {
        console.log("Email submitted successfully!");
        email.value = ""; // Clear form
        // Reset success message after 5 seconds
        setTimeout(() => {
            emailSignup.reset();
        }, 5000);
    },
    onError: (error) => {
        console.error("Email submission error:", error);
        // Reset error message after 5 seconds
        setTimeout(() => {
            emailSignup.reset();
        }, 5000);
    },
    onAlreadySubscribed: () => {
        console.log("Email already subscribed");
        email.value = ""; // Clear form
        // Reset message after 5 seconds
        setTimeout(() => {
            emailSignup.reset();
        }, 5000);
    },
});

// Email validation rules
const emailRules = [
    (v: string) => !!v || "Email is required",
    (v: string) => /.+@.+\..+/.test(v) || "Email must be valid",
];

// Submit button text
const submitButtonText = computed(() => {
    if (emailSignup.submitting.value) return "Submitting...";
    if (emailSignup.success.value) return "Submitted!";
    if (emailSignup.alreadySubscribed.value) return "Already Subscribed!";
    return props.submitText;
});

// Email form submission
const handleEmailSubmit = async () => {
    if (!formValid.value) return;
    await emailSignup.submitEmail(email.value);
};
</script>

<style scoped>
.email-signup-form {
    max-width: 500px;
}
/* Compact: fill the footer column, no card frame. */
.email-signup-compact {
    width: 100%;
    max-width: 100%;
    /* Named, so only the compact form's own width drives the row layout below
       (an unnamed query could match some unrelated ancestor container). */
    container: email-signup / inline-size;
}

/* Default: field stacked over a full-width button. */
.signup-input {
    margin-bottom: 8px;
}
.signup-submit {
    width: 100%;
}

/* Compact, with room: field and button on one row (saves ~50px of height).
   By the form's own width, not the viewport: in the 3-column footer this
   column is too narrow below ~1280px. 360px leaves the field ≥ ~230px. The
   button is aligned to the field's top and matched to its 48px (comfortable)
   height; validation messages stay under the field. */
@container email-signup (min-width: 360px) {
    .signup-fields {
        display: flex;
        align-items: flex-start;
        gap: 8px;
    }
    .signup-input {
        flex: 1 1 auto;
        min-width: 0;
        margin-bottom: 0;
    }
    .signup-submit {
        flex: none;
        width: auto;
        --v-btn-height: 48px;
    }
}
</style>
