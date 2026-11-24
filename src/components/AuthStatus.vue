<template>
  <div class="auth-status">
    <!-- Not logged in: Show Login and Sign Up buttons -->
    <div v-if="!authStore.isLoggedIn" class="d-flex gap-2 align-center">
      <v-btn
        to="/login"
        variant="text"
        size="small"
        prepend-icon="mdi-login"
      >
        Log In
      </v-btn>
      <v-btn
        to="/signup"
        color="primary"
        size="small"
        prepend-icon="mdi-account-plus"
      >
        Sign Up
      </v-btn>
    </div>

    <!-- Logged in: Show user menu -->
    <div v-else class="d-flex align-center">
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn
            v-bind="props"
            variant="text"
            size="small"
            class="text-none"
            aria-label="Account menu"
          >
            <!-- Avatar only: usernames are now the account email, which
                 shouldn't sit in the header of a kid-facing screen. The full
                 name is shown inside the menu instead. -->
            <v-avatar size="28" color="primary">
              <span class="text-caption">{{ usernameInitial }}</span>
            </v-avatar>
            <v-icon end size="small">mdi-menu-down</v-icon>
          </v-btn>
        </template>

        <v-list density="compact">
          <v-list-item v-if="username" :subtitle="username" class="username-item" />
          <v-divider v-if="username" class="my-1"></v-divider>

          <v-list-item to="/account" prepend-icon="mdi-account-circle">
            <v-list-item-title>Account</v-list-item-title>
          </v-list-item>

          <v-list-item to="/study" prepend-icon="mdi-book-open-page-variant">
            <v-list-item-title>Study</v-list-item-title>
          </v-list-item>

          <v-list-item to="/progress" prepend-icon="mdi-chart-line">
            <v-list-item-title>Progress</v-list-item-title>
          </v-list-item>

          <v-divider class="my-1"></v-divider>

          <v-list-item @click="handleLogout" prepend-icon="mdi-logout">
            <v-list-item-title>Log Out</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@vue-skuilder/common-ui';
import { getDataLayer } from '@vue-skuilder/db';

const router = useRouter();
const authStore = useAuthStore();
const username = ref<string>('');
const usernameInitial = computed(() => username.value.charAt(0).toUpperCase());

function loadUsername() {
  try {
    username.value = getDataLayer().getUserDB().getUsername();
  } catch (e) {
    console.error('Error getting username:', e);
  }
}

onMounted(() => {
  if (authStore.isLoggedIn) loadUsername();
});

// Follow login/logout. Pinia drops this subscription when the component unmounts.
authStore.$subscribe((_mutation, state) => {
  if (state.loginAndRegistration.loggedIn) loadUsername();
  else username.value = '';
});

async function handleLogout() {
  try {
    const user = getDataLayer().getUserDB();
    await user.logout();
    authStore.loginAndRegistration.loggedIn = false;
    username.value = '';
    router.push('/');
  } catch (e) {
    console.error('Logout error:', e);
  }
}
</script>

<style scoped>
.auth-status {
  display: flex;
  align-items: center;
}

.username-item :deep(.v-list-item-subtitle) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 240px;
}
</style>
