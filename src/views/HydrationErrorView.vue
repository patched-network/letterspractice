<template>
  <v-container class="d-flex align-center justify-center" style="min-height: 80vh">
    <v-row justify="center">
      <v-col cols="12" sm="10" md="8" lg="6">
        <v-card elevation="4" class="pa-6">
          <div class="text-center mb-6">
            <v-icon size="80" color="warning" class="mb-4">mdi-cloud-off-outline</v-icon>
            <h1 class="text-h5 mb-3">We couldn't load your progress</h1>
            <p class="text-body-1 text-medium-emphasis mb-2">
              This device hasn't downloaded
              <strong v-if="username">{{ username }}'s</strong>
              <span v-else>your</span>
              saved work yet, and we couldn't reach our servers just now.
            </p>
            <p class="text-body-1 text-medium-emphasis">
              Nothing is lost — your progress is safe and will appear once we can connect.
            </p>
          </div>

          <v-alert
            v-if="isOffline"
            type="info"
            variant="tonal"
            density="comfortable"
            class="mb-4"
          >
            Your device looks offline. We'll retry automatically when it reconnects.
          </v-alert>

          <v-btn
            color="primary"
            size="large"
            block
            :loading="retrying"
            prepend-icon="mdi-refresh"
            class="mb-3"
            @click="retry"
          >
            Try Again
          </v-btn>

          <v-btn variant="text" block size="small" @click="router.push('/')">
            Back to Home
          </v-btn>

          <v-expansion-panels v-if="detail" class="mt-4" variant="accordion">
            <v-expansion-panel>
              <v-expansion-panel-title class="text-caption">
                Technical details
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <code class="text-caption">{{ detail }}</code>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
/**
 * Shown when this device has never synced the signed-in account and the
 * initial pull failed — i.e. `hydrationStatus().state === 'failed'`.
 *
 * The alternative would be rendering the study hub off an empty local
 * database, which looks identical to a brand-new account: progress apparently
 * erased, and any work done from that state lost when sync resumes and the
 * real documents win. A wall the parent can retry is the honest option.
 *
 * Reached only via the router guard in router/index.ts.
 */
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { getDataLayer } from '@vue-skuilder/db';

const router = useRouter();

const retrying = ref(false);
const isOffline = ref(typeof navigator !== 'undefined' && navigator.onLine === false);
const username = ref('');
const detail = ref('');

/**
 * Full reload rather than an in-place re-sync: hydration runs inside the data
 * layer's initialization, and no marker was written on failure, so a fresh boot
 * retries it. Re-running it in place would mean reaching around the data
 * layer's own lifecycle.
 */
function retry() {
  retrying.value = true;
  window.location.reload();
}

function handleOnline() {
  isOffline.value = false;
  retry();
}

function handleOffline() {
  isOffline.value = true;
}

onMounted(() => {
  try {
    const user = getDataLayer().getUserDB();
    const name = user.getUsername();
    if (name && !name.startsWith('sk-guest-')) {
      username.value = name;
    }
    detail.value = user.hydrationStatus().error ?? '';
  } catch {
    // Nothing to report — the retry path doesn't depend on this.
  }

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
});

onUnmounted(() => {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
});
</script>
