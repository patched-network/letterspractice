<template>
  <v-container>
    <!-- Resolving the invite token -->
    <v-row v-if="state === 'checking'" justify="center">
      <v-col cols="12" sm="8" md="6" lg="5" class="text-center py-12">
        <v-progress-circular indeterminate color="primary" size="48" />
        <p class="text-body-2 text-medium-emphasis mt-4">Checking your invite…</p>
      </v-col>
    </v-row>

    <!-- Unknown / expired token -->
    <v-row v-else-if="state === 'invalid'" justify="center">
      <v-col cols="12" sm="8" md="6" lg="5">
        <v-alert type="warning" variant="tonal" class="mb-4">
          <v-alert-title>This invite link isn't valid</v-alert-title>
          <p class="mt-2">
            It may have expired or been mistyped. If you were given this link by
            someone, double-check it — otherwise you can
            <router-link to="/signup">join the waitlist</router-link>.
          </p>
        </v-alert>
      </v-col>
    </v-row>
  </v-container>

  <!-- Valid token → branded intro + comped signup -->
  <template v-if="state === 'valid'">
    <v-container>
      <v-row justify="center">
        <v-col cols="12" sm="8" md="6" lg="5">
          <p class="text-body-1 mb-4">
            You're invited<span v-if="label"> ({{ label }})</span>. Create an account
            below — access is on the house.
          </p>
        </v-col>
      </v-row>
    </v-container>
    <SignUpView :grant-token="token" />
  </template>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import SignUpView from "./SignUpView.vue";

const route = useRoute();
const token = (route.params.token as string) || "";

const state = ref<"checking" | "valid" | "invalid">("checking");
const label = ref<string>("");

// The invite token is the gate that bypasses the closed-signup waitlist, so
// validate it server-side before rendering the signup form. The backend
// allowlist is the source of truth; an unknown/expired token shows the
// invalid state rather than a form.
onMounted(async () => {
  if (!token) {
    state.value = "invalid";
    return;
  }
  try {
    const resp = await fetch(`/backend/grant/resolve/${encodeURIComponent(token)}`);
    if (!resp.ok) {
      state.value = "invalid";
      return;
    }
    const data = await resp.json();
    label.value = data.label || data.cohort || "";
    state.value = data.valid ? "valid" : "invalid";
  } catch {
    state.value = "invalid";
  }
});
</script>
