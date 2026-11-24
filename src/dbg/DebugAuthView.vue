<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <h1>🔧 Debug: Authentication</h1>
      </v-col>
    </v-row>

    <!-- Current Auth State -->
    <v-row>
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>Current Auth State</v-card-title>
          <v-card-text>
            <div v-if="authStore.isLoggedIn">
              <p><strong>Status:</strong> <v-chip color="success">Logged In</v-chip></p>
              <p><strong>Username:</strong> {{ currentUsername }}</p>
              <v-btn color="error" @click="logout" class="mt-4">
                <v-icon start>mdi-logout</v-icon>
                Logout
              </v-btn>
            </div>
            <div v-else>
              <p><strong>Status:</strong> <v-chip color="warning">Not Logged In</v-chip></p>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Login Component -->
    <v-row class="mt-4">
      <v-col cols="12" md="6">
        <h2>Login</h2>
        <UserLogin />
      </v-col>

      <!-- Registration Component -->
      <v-col cols="12" md="6">
        <h2>Register New Account</h2>
        <UserRegistration @signup-success="handleSignupSuccess" />
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from '@vue-skuilder/common-ui';
import { UserLogin, UserRegistration } from '@vue-skuilder/common-ui';
import { getDataLayer } from '@vue-skuilder/db';

const authStore = useAuthStore();
const currentUsername = ref<string>('');

onMounted(async () => {
  if (authStore.isLoggedIn) {
    try {
      const user = getDataLayer().getUserDB();
      currentUsername.value = user.getUsername();
    } catch (e) {
      console.error('Error getting username:', e);
    }
  }
});

async function logout() {
  console.log('[DEBUG-AUTH] Logging out...');
  try {
    const user = getDataLayer().getUserDB();
    await user.logout();
    authStore.loginAndRegistration.loggedIn = false;
    currentUsername.value = '';
    console.log('[DEBUG-AUTH] Logout successful');
  } catch (e) {
    console.error('[DEBUG-AUTH] Logout error:', e);
  }
}

function handleSignupSuccess({ username }: { username: string }) {
  console.log('[DEBUG-AUTH] 🎉 Signup success event received!', { username });
  console.log('[DEBUG-AUTH] Not redirecting - staying on debug page');
  // Refresh auth state
  currentUsername.value = username;
}
</script>

<style scoped>
h1 {
  margin-bottom: 1rem;
}

h2 {
  margin-bottom: 1rem;
  font-size: 1.5rem;
}
</style>
