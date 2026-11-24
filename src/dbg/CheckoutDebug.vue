<template>
    <div class="checkout-container">
        <div v-if="!authStore.isLoggedIn" class="login-prompt">
            <div class="checkout-header">
                <h1>Happy to see you here!</h1>
                <p class="text-body-1 mb-4">
                    Please log in to complete your purchase.
                </p>
            </div>

            <UserLogin
                redirect-to="/checkout"
                @login-success="handleLoginSuccess"
            />
        </div>

        <div v-else>
            <div class="checkout-header">
                <h1>TEST Checkout ($0)</h1>
                <p>This is a test checkout using a $0 price. It will trigger real webhooks!</p>
            </div>

            <div id="checkout" class="stripe-checkout"></div>

            <div v-if="loading" class="loading">Loading payment form...</div>

            <div v-if="error" class="error">
                <p>{{ error }}</p>
                <v-btn @click="initialize" variant="outlined">Try Again</v-btn>
            </div>

            <!-- Stripe Checkout will be mounted here -->
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getDataLayer } from "@vue-skuilder/db";
import { useAuthStore, UserLogin, getUserStatus } from "@vue-skuilder/common-ui";

const loading = ref(true);
const error = ref("");
const authStore = useAuthStore();
const userEmail = ref<string>("");

// TEST PRICE ID - Replace with your actual $0 price ID from Stripe
// Note: This should be a price ID (starts with "price_"), not a product ID
const TEST_PRICE_ID = "price_1SLqFrFQBG2N02rAhDY6ZSzH";

let stripe: any = null;

onMounted(() => {
    loadStripe();
});

const loadStripe = async () => {
    try {
        // Load Stripe.js
        const script = document.createElement("script");
        script.src = "https://js.stripe.com/basil/stripe.js";
        script.async = true;
        script.onload = () => {
            // Check if publishable key exists
            const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
            console.log("Environment check:", import.meta.env);
            console.log("Stripe key:", publishableKey);

            if (!publishableKey) {
                error.value = "Stripe publishable key not configured.";
                loading.value = false;
                return;
            }

            // Initialize Stripe with publishable key
            stripe = (window as any).Stripe(publishableKey);
            initialize();
        };
        script.onerror = () => {
            error.value = "Failed to load Stripe. Please refresh the page.";
            loading.value = false;
        };
        document.head.appendChild(script);
    } catch (err) {
        error.value = "Error initializing payment system.";
        loading.value = false;
    }
};

const handleLoginSuccess = () => {
    // After successful login, initialize the checkout
    initialize();
};

const initialize = async () => {
    if (!stripe) {
        error.value = "Payment system not loaded.";
        loading.value = false;
        return;
    }

    // Only initialize if user is logged in
    if (!authStore.isLoggedIn) {
        return;
    }

    try {
        loading.value = true;
        error.value = "";

        // Get current user info
        const user = getDataLayer().getUserDB();

        const userId = user.getUsername();

        // Fetch user's email and status - only pre-fill if verified
        try {
            const statusResult = await getUserStatus();
            if (statusResult.ok && statusResult.status === 'verified') {
                // Only use email if account is verified
                userEmail.value = statusResult.email || "";
            }
        } catch (e) {
            console.warn("Could not fetch user status:", e);
        }

        const checkout = await stripe.initEmbeddedCheckout({
            fetchClientSecret: async () => {
                const response = await fetch(
                    "/backend/payments/create-checkout-session",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            userId,
                            email: userEmail.value || undefined,
                            priceId: TEST_PRICE_ID,
                        }),
                    },
                );

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const { clientSecret } = await response.json();
                return clientSecret;
            },
        });

        // Mount Checkout
        checkout.mount("#checkout");
        loading.value = false;
    } catch (err: any) {
        console.error("Checkout initialization error:", err);
        error.value =
            err.message || "Failed to initialize checkout. Please try again.";
        loading.value = false;
    }
};
</script>

<style scoped>
.checkout-container {
    max-width: 600px;
    margin: 2rem auto;
    padding: 2rem;
}

.checkout-header {
    text-align: center;
    margin-bottom: 2rem;
}

.checkout-header h1 {
    color: var(--primary-color);
    margin-bottom: 0.5rem;
}

.checkout-header p {
    color: var(--text-secondary);
    font-size: 1.1rem;
}

.loading {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
}

.error {
    text-align: center;
    padding: 2rem;
    color: var(--error-color);
}

.stripe-checkout {
    margin-top: 1rem;
}

/* Responsive design */
@media (max-width: 768px) {
    .checkout-container {
        margin: 1rem;
        padding: 1rem;
    }
}
</style>
