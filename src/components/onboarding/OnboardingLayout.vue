<template>
  <v-container class="onboarding-layout" fluid>
    <v-row justify="center">
      <v-col cols="12" md="8" lg="6" xl="4">
        <!-- Progress Bar (only show if multiple screens) -->
        <v-card v-if="hasMultipleScreens" class="mb-6" elevation="1">
          <v-card-text class="pb-2">
            <div class="text-body-2 mb-2">
              {{ screenTitle || `Step ${ONBOARDING_SCREENS.indexOf(currentScreen) + 1} of ${ONBOARDING_SCREENS.length}` }}
            </div>
            <v-progress-linear
              :model-value="progressPercentage"
              color="primary"
              height="8"
              rounded
            />
            <div class="text-caption text-medium-emphasis mt-1 text-center">
              {{ Math.round(progressPercentage) }}% Complete
            </div>
          </v-card-text>
        </v-card>

        <!-- Main Content -->
        <v-card elevation="2">
          <v-card-text class="px-6 py-8">
            <slot />
          </v-card-text>
        </v-card>

        <!-- Navigation -->
        <OnboardingNavigation
          :current-screen="currentScreen"
          :can-continue="canContinue"
          @back="handleBack"
          @next="handleNext"
          class="mt-6"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useOnboardingStore, type OnboardingScreen, ONBOARDING_SCREENS } from '@/stores/onboarding'
import OnboardingNavigation from './OnboardingNavigation.vue'

interface Props {
  currentScreen: OnboardingScreen
  screenTitle?: string
  canContinue?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  screenTitle: '',
  canContinue: true
})

const router = useRouter()
const onboardingStore = useOnboardingStore()

// Computed
const progressPercentage = computed(() => onboardingStore.progressPercentage)
const hasMultipleScreens = computed(() => onboardingStore.getEnabledScreens().length > 1)

// Navigation handlers
const handleBack = () => {
  const previousScreen = onboardingStore.previousScreen(props.currentScreen)
  if (previousScreen) {
    router.push(`/onboarding/${previousScreen}`)
  }
}

const handleNext = () => {
  // Mark current screen as completed
  onboardingStore.markScreenCompleted(props.currentScreen)

  const nextScreen = onboardingStore.nextScreen(props.currentScreen)
  if (nextScreen) {
    router.push(`/onboarding/${nextScreen}`)
  } else {
    // Complete onboarding and redirect
    onboardingStore.completeOnboarding()
    router.push('/study') // or wherever the main app starts
  }
}

</script>

<style scoped>
.onboarding-layout {
  min-height: 100vh;
  padding-top: 2rem;
  padding-bottom: 2rem;
  background: linear-gradient(135deg, rgba(245, 124, 0, 0.05) 0%, rgba(255, 152, 0, 0.05) 100%);
}

@media (max-width: 600px) {
  .onboarding-layout {
    padding-top: 1rem;
    padding-bottom: 1rem;
  }
}
</style>